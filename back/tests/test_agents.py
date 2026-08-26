"""에이전트 배선 계약 테스트.

LLM 호출 경계(`ask_text` / `ask_structured`)만 대체하고 그 위의 로직을 전부 검증한다.
자격 증명 없이 CI에서 돌아가며, 라이브 검증에서 남는 미확인 영역을 "네트워크 왕복 한 번"
으로 좁히는 것이 목적이다.
"""

import asyncio

import pytest

from app.agents import analysts, decision
from app.agents.prompts import ANALYST_PROFILES
from app.schemas.advice import AgentOpinion, AnalystOutput, InvestmentDecision
from app.schemas.rag import RetrievedDoc
from app.schemas.stock import NewsItem, StockHistory, StockMetrics, StockRow

_METRICS = StockMetrics(
    latest_close=70000.0,
    day_change_pct=1.5,
    return_20d_pct=4.0,
    trend="상승 우위",
    volume_ratio_20d=1.2,
)

_HISTORY = StockHistory(
    name="삼성전자",
    symbol="005930.KS",
    query="005930",
    timeframe="day",
    period="2y",
    interval="1d",
    rows=[StockRow(name="삼성전자", symbol="005930.KS", date="2026-07-30", close=70000.0)],
    news=[NewsItem(title="뉴스 제목", publisher="출처", published_at="2026-07-29")],
)

_DOCS = [
    RetrievedDoc(
        doc_id="D1",
        title="3분기 영업이익 컨센서스 상회",
        publisher="매일경제",
        url="https://example.com/a",
        published_at="2026-07-28",
        snippet="영업이익이 시장 기대를 넘었다.",
    ),
    RetrievedDoc(
        doc_id="D2",
        title="메모리 가격 반등",
        publisher="한국경제",
        published_at="2026-07-27",
        snippet="DRAM 고정거래가격이 올랐다.",
    ),
]


def _fake_analyst(summary: str = "  분석 결과입니다.  ", **kwargs):
    """`ask_structured` 대역. 하위 에이전트는 AnalystOutput 을 돌려준다."""
    output = AnalystOutput(summary=summary, stance=kwargs.get("stance", "중립"),
                           cited_doc_ids=kwargs.get("cited_doc_ids", []))

    async def _call(system_prompt: str, user_content: str, output_model):
        assert output_model is AnalystOutput
        return output

    return _call


# --- 하위 에이전트 3인 -------------------------------------------------------


async def test_opinions_are_marked_done_on_success(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str] = []

    async def fake_ask_structured(system_prompt: str, user_content: str, output_model):
        seen.append(system_prompt)
        return AnalystOutput(summary="  분석 결과입니다.  ", stance="중립")

    monkeypatch.setattr(analysts, "ask_structured", fake_ask_structured)

    opinions = await analysts.collect_opinions("{}", _METRICS)

    assert [o.agent for o in opinions] == [p.name for p in ANALYST_PROFILES]
    assert all(o.status == "done" for o in opinions)
    assert all(o.summary == "분석 결과입니다." for o in opinions)  # clean_text 적용
    assert all(o.error is None for o in opinions)
    # 각 에이전트가 자기 역할 프롬프트 + 한국어 번역 규칙을 받았는지
    assert len(seen) == 3
    assert all("한국어 번역" in prompt for prompt in seen)
    assert any("저널리스트" in prompt for prompt in seen)


async def test_opinions_run_concurrently(monkeypatch: pytest.MonkeyPatch) -> None:
    """3인이 실제로 동시에 실행되는지.

    Barrier(3)는 세 호출이 모두 도달해야 풀린다 — 순차 실행이면 첫 호출에서 영구
    대기하므로 `wait_for` 타임아웃으로 실패한다.
    """
    barrier = asyncio.Barrier(3)

    async def fake_ask_structured(system_prompt: str, user_content: str, output_model):
        await barrier.wait()
        return AnalystOutput(summary="동시 실행", stance="중립")

    monkeypatch.setattr(analysts, "ask_structured", fake_ask_structured)

    opinions = await asyncio.wait_for(analysts.collect_opinions("{}", _METRICS), timeout=5)

    assert all(o.status == "done" for o in opinions)


async def test_agent_failure_degrades_to_rule_based(monkeypatch: pytest.MonkeyPatch) -> None:
    async def failing_ask_structured(system_prompt: str, user_content: str, output_model):
        raise RuntimeError("auth 실패")

    monkeypatch.setattr(analysts, "ask_structured", failing_ask_structured)

    opinions = await analysts.collect_opinions("{}", _METRICS)

    assert all(o.status == "fallback" for o in opinions)
    assert all("auth 실패" in (o.error or "") for o in opinions)
    # 지표 기반 대체 문구가 실제 수치를 담고 있는지
    analyst = next(o for o in opinions if o.agent == "AI 애널리스트")
    assert "70,000" in analyst.summary
    assert "+4.00%" in analyst.summary


async def test_empty_response_degrades_to_rule_based(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(analysts, "ask_structured", _fake_analyst("   "))

    opinions = await analysts.collect_opinions("{}", _METRICS)

    assert all(o.status == "fallback" for o in opinions)
    assert all(o.error == "빈 응답" for o in opinions)


async def test_one_failure_does_not_break_the_others(monkeypatch: pytest.MonkeyPatch) -> None:
    async def flaky_ask_structured(system_prompt: str, user_content: str, output_model):
        if "경제학자" in system_prompt:
            raise RuntimeError("일시 오류")
        return AnalystOutput(summary="정상 응답", stance="긍정")

    monkeypatch.setattr(analysts, "ask_structured", flaky_ask_structured)

    opinions = await analysts.collect_opinions("{}", _METRICS)
    by_agent = {o.agent: o for o in opinions}

    assert by_agent["AI 경제학자"].status == "fallback"
    assert by_agent["AI 저널리스트"].status == "done"
    assert by_agent["AI 애널리스트"].status == "done"


# --- 근거(RAG 인용) ---------------------------------------------------------


async def test_stance_and_sources_are_carried_from_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        analysts,
        "ask_structured",
        _fake_analyst("실적이 좋다.", stance="긍정", cited_doc_ids=["D2", "D1"]),
    )

    opinions = await analysts.collect_opinions("{}", _METRICS, _DOCS)
    first = opinions[0]

    assert first.stance == "긍정"
    # 인용 순서를 그대로 따른다 — 모델이 가장 먼저 든 근거가 앞에 온다.
    assert [s.title for s in first.sources] == ["메모리 가격 반등", "3분기 영업이익 컨센서스 상회"]
    assert first.sources[1].url == "https://example.com/a"


def test_unknown_citations_are_dropped() -> None:
    """검색 결과에 없는 ID는 버린다.

    모델이 D9 를 지어내는 일이 실제로 있다. 그대로 통과시키면 화면에 '근거'라는
    이름으로 존재하지 않는 출처가 뜬다 — 없는 편이 낫다.
    """
    sources = analysts.resolve_sources(["D9", "d1", "D1", ""], _DOCS)

    assert [s.title for s in sources] == ["3분기 영업이익 컨센서스 상회"]  # 소문자 허용, 중복 제거


def test_fallback_opinion_has_no_stance_or_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    """규칙 기반 의견에는 근거 문서가 없다. 빈 값이어야 화면이 거짓말을 하지 않는다."""
    opinion = AgentOpinion(
        agent="AI 애널리스트", status="fallback", summary="규칙 기반", error="llm 실패"
    )

    assert opinion.stance is None
    assert opinion.sources == []


# --- 컨텍스트 ---------------------------------------------------------------


def test_context_excludes_ohlcv_rows() -> None:
    import json

    context = json.loads(analysts.build_context(_HISTORY, _METRICS))

    assert set(context) == {
        "stock",
        "metrics",
        "fundamentals",
        "retrieved_documents",
        "news",
        "analyst_reports",
    }
    assert context["stock"]["symbol"] == "005930.KS"
    assert context["metrics"]["trend"] == "상승 우위"
    assert context["news"][0]["title"] == "뉴스 제목"
    assert "rows" not in context  # 봉 데이터는 토큰만 먹고 판단에 쓰이지 않는다


def test_context_always_carries_retrieved_documents_key() -> None:
    """검색 문서가 없어도 키는 남는다 (fundamentals 와 같은 이유).

    프롬프트의 근거 규칙이 `retrieved_documents` 를 참조한다. 키가 사라지면 규칙이
    가리킬 대상이 없어지고, 모델은 기억 속 뉴스를 끌어다 쓰기 시작한다.
    """
    import json

    without = json.loads(analysts.build_context(_HISTORY, _METRICS))
    assert without["retrieved_documents"] == []

    with_docs = json.loads(analysts.build_context(_HISTORY, _METRICS, documents=_DOCS))
    assert [doc["doc_id"] for doc in with_docs["retrieved_documents"]] == ["D1", "D2"]
    # 본문은 스니펫만 — 원문 전체를 넣으면 컨텍스트가 봉 데이터만큼 커진다.
    assert with_docs["retrieved_documents"][0]["content"] == "영업이익이 시장 기대를 넘었다."


def test_context_always_carries_fundamentals_key() -> None:
    """재무가 없어도 키는 남는다.

    경제학자 프롬프트가 `fundamentals` 를 명시적으로 참조하므로, 키가 상황에 따라
    사라지면 프롬프트가 거짓이 되고 모델이 없는 PER 을 지어낸다.
    """
    import json

    from app.schemas.stock import StockFundamentals

    without = json.loads(analysts.build_context(_HISTORY, _METRICS))
    assert without["fundamentals"] is None

    with_data = json.loads(
        analysts.build_context(
            _HISTORY, _METRICS, fundamentals=StockFundamentals(symbol="005930.KS", per=21.06)
        )
    )
    assert with_data["fundamentals"]["per"] == 21.06


# --- 최종 판단 --------------------------------------------------------------


async def test_decision_uses_llm_result(monkeypatch: pytest.MonkeyPatch) -> None:
    expected = InvestmentDecision(
        verdict="BUY",
        decision_label="LLM 라벨",
        confidence=77,
        answer="BUY. 참고용 의견입니다.",
    )

    async def fake_ask_structured(system_prompt, user_content, output_model):
        assert output_model is InvestmentDecision
        return expected

    monkeypatch.setattr(decision, "ask_structured", fake_ask_structured)

    result, used_fallback = await decision.decide(_HISTORY, _METRICS, [])

    assert used_fallback is False
    assert result is expected


async def test_decision_falls_back_on_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    async def failing_ask_structured(system_prompt, user_content, output_model):
        raise RuntimeError("refusal")

    monkeypatch.setattr(decision, "ask_structured", failing_ask_structured)

    result, used_fallback = await decision.decide(_HISTORY, _METRICS, [])

    assert used_fallback is True
    assert result.verdict == "BUY"  # 상승 우위 + r20 양수 → 규칙 점수 2
    assert "투자 손익을 보장하지 않습니다" in result.answer


async def test_advice_response_prefers_canonical_label(monkeypatch: pytest.MonkeyPatch) -> None:
    """LLM이 준 라벨보다 표준 라벨 매핑이 우선한다."""
    from app.services import advice_service, fundamentals_service, rag_service, stock_service

    async def fake_history(params, **kwargs) -> StockHistory:
        return _HISTORY

    async def fake_opinions(context, metrics, documents=None) -> list[AgentOpinion]:
        return [AgentOpinion(agent="AI 저널리스트", status="done", summary="요약")]

    async def fake_decide(stock_data, metrics, opinions, **kwargs):
        return (
            InvestmentDecision(
                verdict="WATCH",
                decision_label="이상한 라벨",
                confidence=50,
                answer="WATCH.",
            ),
            False,
        )

    async def fake_fundamentals(symbol: str) -> None:
        return None

    async def no_documents(symbol, name, content):
        return []

    monkeypatch.setattr(stock_service, "get_history", fake_history)
    monkeypatch.setattr(advice_service, "collect_opinions", fake_opinions)
    monkeypatch.setattr(advice_service, "decide", fake_decide)
    # 개발자 .env 에 VECTOR_DATABASE_URL 이 있으면 이 테스트가 Supabase 를 친다.
    monkeypatch.setattr(rag_service, "documents_for_advice", no_documents)
    # 이걸 막지 않으면 generate_advice 가 실제 야후를 친다 — 실패가 아니라
    # 느리게 통과하다 네트워크 없는 환경에서만 드러나는 종류의 누수다.
    monkeypatch.setattr(fundamentals_service, "get_fundamentals_or_none", fake_fundamentals)

    response = await advice_service.generate_advice("005930")

    assert response.decision_label == "관망"
    assert response.verdict == "WATCH"
    assert response.stock.symbol == "005930.KS"
    assert response.updated_at.endswith("+00:00")  # UTC aware
