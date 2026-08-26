"""AI 판단 그래프 (RAG 2단계).

`test_advice_stream.py` 가 "4단계 이벤트가 계약대로 흐르는가" 를 본다면, 여기서는
**그래프가 어떤 경로로 갔는가** 를 본다. 그래프로 옮긴 이유가 조건부 엣지와 루프이므로,
그 분기들이 실제로 도는지가 이 파일의 전부다.

경로는 "몇 번 불렸는가" 로 확인한다. 응답만 보면 재작성 루프를 돌았는지, 판단을 다시
만들었는지 알 수 없다 — 결과가 같기 때문이다. 그런 분기는 **호출 횟수로만 증명된다.**
"""

import time

import pytest

from app.agents import analysts, decision
from app.core.config import settings
from app.graph import advice_graph, get_graph, nodes
from app.graph.state import is_past, seconds_left
from app.integrations import llm
from app.schemas.advice import AnalystOutput, InvestmentDecision
from app.schemas.rag import IngestResult, RetrievedDoc
from app.schemas.stock import (
    NewsItem,
    StockContent,
    StockHistory,
    StockMetrics,
    StockRow,
)
from app.services import advice_cache, fundamentals_service, rag_service, stock_service

_HISTORY = StockHistory(
    name="삼성전자",
    symbol="005930.KS",
    query="005930",
    timeframe="day",
    period="2y",
    interval="1d",
    rows=[StockRow(name="삼성전자", symbol="005930.KS", date="2026-07-30", close=70000.0)],
    metrics=StockMetrics(latest_close=70000.0, trend="상승 우위", return_20d_pct=4.0),
)

_CONTENT = StockContent(
    symbol="005930.KS",
    news=[NewsItem(title="실적 발표", url="https://example.com/1")],
)


def _doc(doc_id: str) -> RetrievedDoc:
    return RetrievedDoc(
        doc_id=doc_id,
        title=f"문서 {doc_id}",
        publisher="매일경제",
        url=f"https://example.com/{doc_id}",
        published_at="2026-07-28",
        snippet="본문",
    )


class Counter:
    """어느 노드가 몇 번 돌았는지. 경로를 증명하는 유일한 수단이다."""

    def __init__(self) -> None:
        self.retrieve = 0
        self.rewrite = 0
        self.decide = 0
        self.analyst = 0


@pytest.fixture
def wired(monkeypatch: pytest.MonkeyPatch) -> Counter:
    """상류·LLM·RAG 를 전부 대역으로. 기본은 '문서가 충분한' 정상 경로."""
    counter = Counter()

    async def fake_history(params, **kwargs):
        return _HISTORY

    async def fake_content(symbol: str):
        return _CONTENT

    async def fake_fundamentals(symbol: str):
        return None

    async def fake_index(symbol: str, content):
        return IngestResult()

    async def fake_retrieve(symbol: str, query: str):
        counter.retrieve += 1
        return [_doc("D1"), _doc("D2")]

    async def fake_rewrite(system_prompt: str, user_content: str):
        counter.rewrite += 1
        return "고쳐 쓴 질의"

    async def fake_analyst(system_prompt: str, user_content: str, output_model):
        counter.analyst += 1
        return AnalystOutput(summary="분석", stance="긍정", cited_doc_ids=["D1"])

    async def fake_decision(system_prompt: str, user_content: str, output_model):
        counter.decide += 1
        return InvestmentDecision(
            verdict="BUY", decision_label="무시됨", confidence=70, answer="BUY. 근거 있음."
        )

    monkeypatch.setattr(stock_service, "get_history", fake_history)
    monkeypatch.setattr(stock_service, "get_content", fake_content)
    monkeypatch.setattr(fundamentals_service, "get_fundamentals_or_none", fake_fundamentals)
    monkeypatch.setattr(rag_service, "index_content", fake_index)
    monkeypatch.setattr(rag_service, "retrieve", fake_retrieve)
    monkeypatch.setattr(llm, "ask_text", fake_rewrite)
    monkeypatch.setattr(analysts, "ask_structured", fake_analyst)
    monkeypatch.setattr(decision, "ask_structured", fake_decision)
    # 검색 루프를 타려면 RAG 가 켜져 있어야 한다 (conftest 가 기본으로 끈다).
    monkeypatch.setattr(settings, "vector_database_url", "postgresql://x:y@h:6543/db")
    return counter


async def _run(symbol: str = "005930") -> dict:
    return await get_graph().ainvoke({"symbol": symbol, "listing": None})


# ── 정상 경로 ───────────────────────────────────────────────────────────


async def test_happy_path_runs_each_node_once(wired: Counter) -> None:
    state = await _run()

    assert wired.retrieve == 1  # 문서가 충분하니 재검색 없음
    assert wired.rewrite == 0
    assert wired.analyst == 3  # 에이전트 3인 병렬
    assert wired.decide == 1
    assert state["decision"].verdict == "BUY"
    assert state["used_fallback"] is False


async def test_three_opinions_survive_the_fan_in(wired: Counter) -> None:
    """리듀서(`operator.add`)가 없으면 **의견 2개가 조용히 사라진다.**

    병렬 노드 셋이 같은 키에 쓰는데 기본 병합은 덮어쓰기라, 마지막 하나만 남고
    오류는 나지 않는다. LangGraph 에서 가장 먼저 밟는 함정이라 테스트로 고정한다.
    """
    state = await _run()

    assert len(state["opinions"]) == 3
    assert {o.agent for o in state["opinions"]} == {
        "AI 저널리스트",
        "AI 경제학자",
        "AI 애널리스트",
    }


# ── 검색 루프 ───────────────────────────────────────────────────────────


async def test_thin_results_trigger_query_rewrite(
    wired: Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """문서가 부족하면 질의를 고쳐 다시 찾는다 — 그래프로 옮긴 첫 번째 이유."""
    calls = {"n": 0}

    async def thin_then_rich(symbol: str, query: str):
        wired.retrieve += 1
        calls["n"] += 1
        # 첫 회차만 빈손, 재작성 뒤에는 문서가 나온다.
        return [] if calls["n"] == 1 else [_doc("D1"), _doc("D2")]

    monkeypatch.setattr(rag_service, "retrieve", thin_then_rich)

    state = await _run()

    assert wired.rewrite == 1
    assert wired.retrieve == 2
    assert len(state["documents"]) == 2


async def test_rewrite_loop_stops_at_the_cap(
    wired: Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """문서가 원래 없는 종목에서 무한히 돌면 안 된다.

    한 바퀴마다 임베딩 1회 + 재작성 LLM 1회가 나간다. 상한이 이 비용의 유일한 뚜껑이다.
    """

    async def always_empty(symbol: str, query: str):
        wired.retrieve += 1
        return []

    monkeypatch.setattr(rag_service, "retrieve", always_empty)

    state = await _run()

    # 첫 검색 + 재작성 MAX_REWRITES 회 = 검색 3회, 재작성 2회.
    assert wired.retrieve == nodes.MAX_REWRITES + 1
    assert wired.rewrite == nodes.MAX_REWRITES
    # 그래도 판단은 나온다 — 문서가 없으면 없는 대로 간다.
    assert state["decision"] is not None
    assert wired.analyst == 3


async def test_rag_disabled_skips_the_loop_entirely(
    wired: Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """RAG 가 꺼져 있으면 재작성은 **LLM 을 쓰면서 아무것도 바꾸지 못한다.**

    실제로 이 가드가 없어서 단위 테스트가 실제 Gemini 를 쳤고 무료 한도를 태웠다.
    """
    monkeypatch.setattr(settings, "vector_database_url", None)
    # 주소가 없으면 `vector_database_dsn` 이 None 을 낸다 = RAG 꺼짐.
    monkeypatch.setattr(settings, "database_url", "")

    state = await _run()

    assert wired.rewrite == 0
    assert state["decision"] is not None


# ── 판단 검증 루프 ──────────────────────────────────────────────────────


async def test_hallucinated_citation_triggers_one_retry(
    wired: Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """판단 본문이 없는 D번호를 인용하면 다시 만든다 — 그래프로 옮긴 두 번째 이유.

    D9 는 검색 결과에 없다. 없는 출처가 '근거' 로 화면에 뜨는 것은 근거가 없는 것보다
    나쁘다.
    """
    calls = {"n": 0}

    async def bad_then_good(system_prompt: str, user_content: str, output_model):
        calls["n"] += 1
        wired.decide += 1
        answer = "BUY. D9 에 따르면 좋다." if calls["n"] == 1 else "BUY. D1 근거."
        return InvestmentDecision(
            verdict="BUY", decision_label="무시됨", confidence=70, answer=answer
        )

    monkeypatch.setattr(decision, "ask_structured", bad_then_good)

    state = await _run()

    assert wired.decide == 2  # 처음 것은 폐기됐다
    assert state["used_fallback"] is False
    assert "D9" not in state["decision"].answer


async def test_repeated_hallucination_falls_back_to_rules(
    wired: Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """재시도해도 지어내면 규칙 기반으로 내린다.

    "지어낸 근거가 붙은 그럴듯한 판단" 보다 "근거 없는 보수적 판단" 이 낫다는 선택이다.
    화면에는 '규칙 기반 판단' 배지가 떠 무엇을 보고 있는지도 드러난다.
    """

    async def always_bad(system_prompt: str, user_content: str, output_model):
        wired.decide += 1
        return InvestmentDecision(
            verdict="BUY", decision_label="무시됨", confidence=99, answer="BUY. D9 근거."
        )

    monkeypatch.setattr(decision, "ask_structured", always_bad)

    state = await _run()

    assert wired.decide == nodes.MAX_DECIDE_RETRIES + 1
    assert state["used_fallback"] is True
    assert "D9" not in state["decision"].answer


async def test_fallback_decision_skips_citation_check(
    wired: Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """규칙 기반 판단은 검증하지 않는다 — 문서를 안 보고 만든 답이라 인용이 없다.

    검사하면 다시 만들어도 같은 답이라 재시도만 낭비한다.
    """

    async def failing(system_prompt: str, user_content: str, output_model):
        wired.decide += 1
        raise RuntimeError("llm_unavailable")

    monkeypatch.setattr(decision, "ask_structured", failing)

    state = await _run()

    assert wired.decide == 1  # 재시도 없음
    assert state["used_fallback"] is True


# ── 캐시 분기 (7회차가 그래프로 옮겨진 자리) ────────────────────────────


async def test_cache_hit_skips_analysis_entirely(wired: Counter) -> None:
    """TTL 안이면 뉴스 조회도 LLM 도 건너뛴다."""
    await _run()
    before = (wired.analyst, wired.decide, wired.retrieve)

    state = await _run()

    assert (wired.analyst, wired.decide, wired.retrieve) == before  # 하나도 안 늘었다
    assert state["from_cache"] is True
    assert len(state["opinions"]) == 3  # 화면이 그릴 것은 그대로 있다


async def test_unchanged_articles_skip_the_llm_but_not_the_news(
    wired: Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """TTL 이 지나도 기사가 그대로면 LLM 만 건너뛴다 (흐름 ②)."""
    await _run()
    before = (wired.analyst, wired.decide)

    monkeypatch.setattr(settings, "advice_cache_ttl_seconds", 0)
    state = await _run()

    assert (wired.analyst, wired.decide) == before
    assert state["from_cache"] is True


async def test_new_article_after_ttl_reanalyses(
    wired: Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _run()
    before = wired.decide

    monkeypatch.setattr(settings, "advice_cache_ttl_seconds", 0)

    async def more_news(symbol: str):
        return StockContent(
            symbol="005930.KS",
            news=[
                NewsItem(title="실적 발표", url="https://example.com/1"),
                NewsItem(title="신규 악재", url="https://example.com/2"),
            ],
        )

    monkeypatch.setattr(stock_service, "get_content", more_news)

    state = await _run()

    assert wired.decide == before + 1  # 새 기사 → 다시 분석
    assert state["from_cache"] is False


async def test_replayed_result_is_not_stored_again(
    wired: Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """캐시에서 꺼낸 것을 다시 넣으면 **기사가 바뀌어도 영원히 안 늙는다.**

    `checked_at` 이 매 조회마다 갱신되어 TTL 이 영원히 만료되지 않기 때문이다.
    """
    await _run()
    stored = []
    original = advice_cache.store

    def spy(*args, **kwargs):
        stored.append(args[0])
        return original(*args, **kwargs)

    monkeypatch.setattr(advice_cache, "store", spy)

    await _run()  # 캐시 적중

    assert stored == []


# ── 배선 자체 ───────────────────────────────────────────────────────────


def test_graph_topology_is_wired_as_designed() -> None:
    """루프를 닫는 엣지와 되돌아가는 엣지가 실제로 있는지.

    노드를 추가하다 엣지를 빠뜨리면 그 노드는 조용히 안 돌고, 결과는 그럴듯하게 나온다.
    """
    graph = advice_graph.build_graph().get_graph()
    edges = {(e.source, e.target) for e in graph.edges}

    assert ("rewrite_query", "retrieve") in edges  # 검색 루프
    assert ("verify", "decide") in edges  # 판단 재시도 루프
    assert ("verify", "force_fallback") in edges
    for name in ("journalist", "economist", "analyst"):
        assert ("grade_documents", name) in edges  # 병렬 fan-out
        assert (name, "decide") in edges  # fan-in
    # 캐시 적중은 분석을 통째로 건너뛴다.
    assert ("check_cache", "replay") in edges
    assert ("replay", "__end__") in edges


# ── 실행 예산 ───────────────────────────────────────────────────────────
#
# 예산은 **조건부 엣지**가 읽는다. 그래서 이 파일의 관심사다 — "시간이 얼마 남았나"
# 가 아니라 "그래서 어느 길로 갔나" 를 본다.


async def _run_expired(*, soft_only: bool = True) -> dict:
    """예산 선이 이미 지난 상태로 돌린다.

    `soft_only` 면 하드 데드라인은 넉넉히 둔다. 여기서 보려는 것은 조건부 엣지의
    판단이지 바깥 타이머가 아니다 — 하드 컷은 `test_advice_stream.py` 의 몫이다.
    """
    now = time.monotonic()
    return await get_graph().ainvoke(
        {
            "symbol": "005930",
            "listing": None,
            "deadline": now + 60 if soft_only else now - 1,
            "soft_deadline": now - 1,
        }
    )


def test_missing_deadline_means_no_budget() -> None:
    """키가 없으면 **예산이 없는 것**이다.

    기본값을 0 이나 현재 시각으로 두면 그래프를 직접 돌리는 테스트·스크립트가
    "항상 예산 초과" 라는 조용한 형태로 죽는다 — 이 파일의 다른 테스트가 전부
    그 형태로 무력화된다(`_run()` 은 예산 키를 넘기지 않는다).
    """
    assert seconds_left({}) is None
    assert is_past({}) is False
    assert is_past({}, "soft_deadline") is False


async def test_expired_soft_budget_skips_the_query_rewrite(
    wired: Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """예산이 얼마 안 남았으면 질의를 고치지 않는다.

    같은 조건(문서가 계속 빈손)에서 예산이 없으면 재작성이 `MAX_REWRITES` 회
    돈다는 것이 위 `test_rewrite_loop_stops_at_the_cap` 이다. 그 대비가 이
    테스트의 전부다 — 재작성 한 바퀴는 LLM 1회 + 임베딩 1회인데, 그것이 끝나도
    최종 판단 LLM 이 아직 남아 있다.
    """

    async def always_empty(symbol: str, query: str):
        wired.retrieve += 1
        return []

    monkeypatch.setattr(rag_service, "retrieve", always_empty)

    state = await _run_expired()

    assert wired.rewrite == 0
    assert wired.retrieve == 1  # 첫 검색만
    # **그래도 판단은 나온다.** 소프트 컷이 END 로 빠지면 판단 없이 끝난다.
    assert state["decision"] is not None
    assert wired.analyst == 3


async def test_expired_soft_budget_never_lets_a_bad_citation_through(
    wired: Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """시간이 없어도 **지어낸 근거는 통과시키지 않는다.**

    예산이 `_after_verify` 에서 `"done"` 을 만들면 없는 D번호가 화면에 나가고
    캐시에까지 들어간다 — 그 검증이 존재하는 이유가 사라진다. 예산이 가르는 것은
    "다시 만들지 말지" 뿐이고, 다시 안 만들기로 했으면 규칙 기반으로 내린다.
    """

    async def always_bad(system_prompt: str, user_content: str, output_model):
        wired.decide += 1
        return InvestmentDecision(
            verdict="BUY",
            decision_label="무시됨",
            confidence=70,
            answer="BUY. D9 에 따르면 좋다.",
        )

    monkeypatch.setattr(decision, "ask_structured", always_bad)

    state = await _run_expired()

    assert wired.decide == 1  # 재시도하지 않았다
    assert state["used_fallback"] is True
    assert "D9" not in state["decision"].answer


async def test_expired_hard_budget_skips_retrieval_entirely(
    wired: Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """예산이 이미 끝났으면 검색에 상류를 부르지 않는다.

    `rag_timeout_seconds`(15초)만 보면 재작성 루프에서 45초가 나갈 수 있다.
    남은 예산으로 clamp 하지 않으면 그것이 판단 전체 예산의 절반이다.
    """
    state = await _run_expired(soft_only=False)

    assert wired.retrieve == 0
    assert state["documents"] == []
    # 검색을 건너뛰어도 판단까지는 간다 — RAG 는 없어도 성립하는 부품이다.
    assert state["decision"] is not None
