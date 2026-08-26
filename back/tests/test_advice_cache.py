"""AI 판단 캐시 — 이 프로젝트에서 **돈이 새는 유일한 경로**의 가드.

여기서 확인하는 것은 "빠른가" 가 아니라 **LLM 이 몇 번 나갔는가** 다. 그래서 모든
테스트가 대역 호출 횟수를 직접 센다. 캐시가 조용히 무력화되는 회귀(예: 키를 심볼이
아닌 것으로 바꾸거나, 지문에 순서를 섞어 넣는 변경)는 응답만 봐서는 안 보인다.
"""

import pytest
from httpx import AsyncClient

from app.agents import analysts, decision
from app.core.config import settings
from app.schemas.advice import AnalystOutput, InvestmentDecision
from app.schemas.stock import (
    NewsItem,
    StockContent,
    StockHistory,
    StockMetrics,
    StockRow,
)
from app.services import (
    advice_cache,
    advice_stream,
    fundamentals_service,
    rag_service,
    stock_service,
)

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


def _content(*urls: str) -> StockContent:
    return StockContent(
        symbol="005930.KS",
        news=[NewsItem(title=f"기사 {url}", url=url) for url in urls],
    )


class _Counter:
    """LLM 대역 호출 수. 캐시가 실제로 호출을 막았는지는 이 숫자로만 증명된다."""

    def __init__(self) -> None:
        self.analyst = 0
        self.decision = 0

    @property
    def total(self) -> int:
        return self.analyst + self.decision


@pytest.fixture
def llm(monkeypatch: pytest.MonkeyPatch) -> _Counter:
    counter = _Counter()

    async def fake_analyst(system_prompt: str, user_content: str, output_model):
        counter.analyst += 1
        return AnalystOutput(summary="분석", stance="긍정", cited_doc_ids=[])

    async def fake_decision(system_prompt: str, user_content: str, output_model):
        counter.decision += 1
        return InvestmentDecision(
            verdict="BUY", decision_label="무시됨", confidence=70, answer="BUY."
        )

    async def fake_history(params, **kwargs):
        return _HISTORY

    async def fake_fundamentals(symbol: str):
        return None

    async def fake_documents(symbol: str, name: str, content):
        return []

    monkeypatch.setattr(stock_service, "get_history", fake_history)
    monkeypatch.setattr(fundamentals_service, "get_fundamentals_or_none", fake_fundamentals)
    monkeypatch.setattr(rag_service, "documents_for_advice", fake_documents)
    monkeypatch.setattr(analysts, "ask_structured", fake_analyst)
    monkeypatch.setattr(decision, "ask_structured", fake_decision)
    return counter


def _serve(monkeypatch: pytest.MonkeyPatch, content: StockContent) -> None:
    """이번 요청에서 상류가 돌려줄 뉴스 묶음을 정한다."""

    async def fake_content(symbol: str):
        return content

    monkeypatch.setattr(stock_service, "get_content", fake_content)


async def _run(symbol: str = "005930") -> list:
    return [event async for event in advice_stream.stream_advice(symbol)]


# ── 지문 ────────────────────────────────────────────────────────────────


def test_fingerprint_ignores_order() -> None:
    """같은 기사 묶음이 순서만 바뀌어 와도 같은 지문이어야 한다.

    안 그러면 공급자가 목록 순서를 흔들 때마다 LLM 4회가 이유 없이 나간다.
    """
    a = _content("https://a", "https://b")
    b = _content("https://b", "https://a")
    assert advice_cache.fingerprint(a) == advice_cache.fingerprint(b)


def test_fingerprint_changes_when_article_added_or_removed() -> None:
    two = _content("https://a", "https://b")
    assert advice_cache.fingerprint(two) != advice_cache.fingerprint(_content("https://a"))
    assert advice_cache.fingerprint(two) != advice_cache.fingerprint(
        _content("https://a", "https://b", "https://c")
    )


def test_fingerprint_falls_back_to_title_when_url_missing() -> None:
    """URL 이 빈 항목이 실제로 온다. 전부 빈 문자열로 뭉개면 서로 다른 기사가
    같은 지문을 갖는다 — 새 기사가 떠도 캐시가 안 깨진다는 뜻이다."""
    day = "2026-08-01"
    one = StockContent(symbol="005930.KS", news=[NewsItem(title="첫 기사", published_at=day)])
    two = StockContent(symbol="005930.KS", news=[NewsItem(title="다른 기사", published_at=day)])
    assert advice_cache.fingerprint(one) != advice_cache.fingerprint(two)


# ── 캐시 적중 ───────────────────────────────────────────────────────────


async def test_second_request_costs_no_llm_calls(
    llm: _Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """같은 종목을 두 번 물으면 LLM 은 **네 번만** 나간다 (여덟 번이 아니라)."""
    _serve(monkeypatch, _content("https://a"))

    await _run()
    assert llm.total == 4  # 에이전트 3 + 판단 1

    await _run()
    assert llm.total == 4  # 두 번째 요청은 한 푼도 쓰지 않았다


async def test_cache_hit_still_emits_the_four_stage_contract(
    llm: _Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """캐시 적중이라고 단계를 건너뛰지 않는다 — 프런트 계약은 4단계다."""
    _serve(monkeypatch, _content("https://a"))
    await _run()

    events = await _run()
    assert [event.stage for event in events] == [1, 2, 3, 3, 3, 4]
    assert events[-1].decision is not None
    assert events[-1].decision.decision_label == "매수 가능"


async def test_ttl_window_skips_even_the_news_fetch(
    llm: _Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """TTL 안에서는 뉴스 조회조차 하지 않는다.

    이 경로가 응답 시간의 대부분이라, 여기를 건너뛰는 것이 캐시의 체감 이득이다.
    상류를 폭발하게 만들어 두고도 통과해야 한다.
    """
    _serve(monkeypatch, _content("https://a"))
    await _run()

    async def exploding_content(symbol: str):
        raise AssertionError("TTL 안에서는 뉴스를 조회하면 안 된다")

    monkeypatch.setattr(stock_service, "get_content", exploding_content)

    events = await _run()
    assert [event.stage for event in events] == [1, 2, 3, 3, 3, 4]


# ── 무효화 ──────────────────────────────────────────────────────────────


async def test_new_article_after_ttl_triggers_reanalysis(
    llm: _Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """새 기사가 뜨면 다시 분석한다 — 캐시의 존재 이유가 걸린 지점.

    악재 기사가 떴는데 낡은 BUY 판단을 계속 보여주면 그건 캐시가 아니라 오보다.
    """
    _serve(monkeypatch, _content("https://a"))
    await _run()
    assert llm.total == 4

    # TTL 을 0 으로 만들어 지문 비교 단계까지 내려보낸다.
    monkeypatch.setattr(settings, "advice_cache_ttl_seconds", 0)
    _serve(monkeypatch, _content("https://a", "https://b"))

    await _run()
    assert llm.total == 8  # 새 기사 → 다시 분석


async def test_unchanged_articles_after_ttl_extend_the_cache(
    llm: _Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """TTL 이 지나도 기사가 그대로면 LLM 을 다시 쓰지 않는다.

    조용한 종목이 하루 종일 LLM 을 한 번도 더 쓰지 않게 하는 것이 이 분기의 목적이다.
    """
    _serve(monkeypatch, _content("https://a"))
    await _run()
    assert llm.total == 4

    monkeypatch.setattr(settings, "advice_cache_ttl_seconds", 0)
    _serve(monkeypatch, _content("https://a"))  # 같은 기사

    events = await _run()
    assert llm.total == 4
    # 지문 비교는 stage 1(주가) 뒤에 일어나므로 여기서도 4단계 계약이 온전하다 —
    # 재생분에서 stage 1 을 빼는 `_replay(...)[1:]` 가 그 이유다.
    assert [event.stage for event in events] == [1, 2, 3, 3, 3, 4]
    assert events[-1].decision is not None


async def test_fallback_decisions_are_not_cached(
    llm: _Counter, monkeypatch: pytest.MonkeyPatch
) -> None:
    """LLM 이 죽어 규칙 기반으로 답한 것은 캐시하지 않는다.

    캐시하면 키가 복구된 뒤에도 TTL 동안 '규칙 기반 판단' 배지가 계속 뜬다 —
    고장이 캐시에 굳는다. 다시 만드는 데 돈도 들지 않는다.
    """

    async def failing_decision(system_prompt: str, user_content: str, output_model):
        raise RuntimeError("llm_unavailable")

    monkeypatch.setattr(decision, "ask_structured", failing_decision)
    _serve(monkeypatch, _content("https://a"))

    first = await _run()
    assert first[-1].decision is not None
    assert first[-1].decision.decision_source == "fallback"

    assert advice_cache.peek("005930.KS") is None


# ── 동시 실행 상한 ──────────────────────────────────────────────────────


def test_slot_limit_rejects_instead_of_queueing(monkeypatch: pytest.MonkeyPatch) -> None:
    """상한을 넘으면 기다리는 게 아니라 거절한다.

    큐잉이면 요청은 결국 전부 실행되고 LLM 호출 총량은 한 푼도 줄지 않는다 —
    늦게 나가는 것과 안 나가는 것은 비용 관점에서 완전히 다르다.
    """
    monkeypatch.setattr(settings, "advice_max_concurrent", 2)

    advice_cache.reserve_slot_now()
    advice_cache.reserve_slot_now()

    with pytest.raises(advice_cache.AdviceBusyError):
        advice_cache.reserve_slot_now()

    advice_cache.release_slot()
    advice_cache.reserve_slot_now()  # 자리가 나면 다시 받는다


def test_release_never_creates_slots(monkeypatch: pytest.MonkeyPatch) -> None:
    """이중 반납이 상한을 늘려 주면 안 된다 — 그쪽이 더 나쁜 버그다."""
    monkeypatch.setattr(settings, "advice_max_concurrent", 1)

    advice_cache.reserve_slot_now()
    advice_cache.release_slot()
    advice_cache.release_slot()
    advice_cache.release_slot()

    advice_cache.reserve_slot_now()
    with pytest.raises(advice_cache.AdviceBusyError):
        advice_cache.reserve_slot_now()


async def test_stream_endpoint_returns_429_before_opening_the_stream(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """상한 초과는 **200 + 빈 스트림**이 아니라 429여야 한다.

    슬롯을 제너레이터 안에서 잡으면 거절을 알릴 때 이미 `text/event-stream` 헤더가
    나간 뒤라, 클라이언트는 거절인지 장애인지 구분할 수 없다. 이 테스트가 엔드포인트의
    '스트림을 열기 전에 잡는다' 배선을 고정한다.
    """
    monkeypatch.setattr(settings, "advice_max_concurrent", 1)
    advice_cache.reserve_slot_now()  # 유일한 자리를 미리 채운다

    response = await client.post("/api/v1/stocks/advice/stream", json={"symbol": "005930"})

    assert response.status_code == 429
    assert response.headers["retry-after"] == "20"
    assert "text/event-stream" not in response.headers.get("content-type", "")
