"""SSE 스트림 배선 계약 테스트.

`test_agents.py`가 에이전트 한 명씩을 덮는다면, 여기서는 **4단계 이벤트가 프런트와의
계약대로 흐르는지**를 본다. 스트림 경로는 상류(yfinance)가 막히면 확인할 수 없어서
그동안 사각지대였다 — 실제로 Yahoo 429 한 번에 수동 확인이 통째로 막혔다.

네트워크·LLM·벡터 DB를 전부 대역으로 바꾸고 오케스트레이션만 검증한다.
"""

import asyncio
import time

import pytest

from app.agents import analysts, decision
from app.api.sse import sse_with_heartbeat
from app.core.config import settings
from app.schemas.advice import AdviceStreamEvent, AnalystOutput, InvestmentDecision
from app.schemas.profile import InvestorProfile
from app.schemas.rag import RetrievedDoc
from app.schemas.stock import (
    NewsItem,
    StockContent,
    StockHistory,
    StockMetrics,
    StockRow,
)
from app.services import advice_stream, fundamentals_service, rag_service, stock_service

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
    news=[NewsItem(title="실적 발표", summary="영업이익 증가", url="https://example.com/1")],
)

_DOC = RetrievedDoc(
    doc_id="D1",
    title="3분기 영업이익 컨센서스 상회",
    publisher="매일경제",
    url="https://example.com/1",
    published_at="2026-07-28",
    snippet="영업이익이 시장 기대를 넘었다.",
)


@pytest.fixture
def wired(monkeypatch: pytest.MonkeyPatch) -> None:
    """상류·LLM·RAG 를 전부 대역으로 세운다."""

    async def fake_history(params, **kwargs):
        return _HISTORY

    async def fake_content(symbol: str):
        return _CONTENT

    async def fake_fundamentals(symbol: str):
        return None

    # 그래프는 `documents_for_advice` 가 아니라 색인·검색을 **따로** 부른다 —
    # 질의를 고쳐 다시 검색할 때 같은 기사를 또 색인하지 않기 위해서다. 그래서
    # 대역도 그 두 지점에 세운다.
    async def fake_retrieve(symbol: str, query: str):
        return [_DOC]

    async def fake_index(symbol: str, content):
        from app.schemas.rag import IngestResult

        return IngestResult()

    async def fake_analyst(system_prompt: str, user_content: str, output_model):
        return AnalystOutput(summary="분석 결과", stance="긍정", cited_doc_ids=["D1"])

    async def fake_decision(system_prompt: str, user_content: str, output_model):
        return InvestmentDecision(
            verdict="BUY", decision_label="무시될 라벨", confidence=71, answer="BUY. 참고용."
        )

    monkeypatch.setattr(stock_service, "get_history", fake_history)
    monkeypatch.setattr(stock_service, "get_content", fake_content)
    monkeypatch.setattr(fundamentals_service, "get_fundamentals_or_none", fake_fundamentals)
    monkeypatch.setattr(rag_service, "retrieve", fake_retrieve)
    monkeypatch.setattr(rag_service, "index_content", fake_index)
    # 그래프는 rag_enabled 를 보고 검색 루프에 들어갈지 정한다. conftest 가
    # 기본으로 꺼 두므로 이 테스트는 명시적으로 켠다.
    monkeypatch.setattr(settings, "vector_database_url", "postgresql://x:y@h:6543/db")
    monkeypatch.setattr(analysts, "ask_structured", fake_analyst)
    monkeypatch.setattr(decision, "ask_structured", fake_decision)


async def test_stream_emits_four_stages_in_order(wired: None) -> None:
    events = [event async for event in advice_stream.stream_advice("005930")]

    # 1 → 2 → 3×3 → 4. 프런트 진행 바가 이 순서를 그대로 그린다.
    assert [event.stage for event in events] == [1, 2, 3, 3, 3, 4]
    assert all(event.error is None for event in events)


async def test_agent_events_carry_stance_and_verified_sources(wired: None) -> None:
    events = [event async for event in advice_stream.stream_advice("005930")]
    agents = [event.agent for event in events if event.agent]

    assert len(agents) == 3
    assert all(opinion.status == "done" for opinion in agents)
    assert all(opinion.stance == "긍정" for opinion in agents)
    # 인용한 D1 이 실제 문서로 해석돼 화면에 쓸 수 있는 형태로 실린다.
    assert all(opinion.sources[0].title == "3분기 영업이익 컨센서스 상회" for opinion in agents)
    assert agents[0].sources[0].url == "https://example.com/1"


async def test_decision_event_uses_canonical_label(wired: None) -> None:
    events = [event async for event in advice_stream.stream_advice("005930")]
    decision_event = events[-1].decision

    assert decision_event is not None
    assert decision_event.verdict == "BUY"
    assert decision_event.decision_label == "매수 가능"  # LLM 라벨보다 표준 매핑이 우선
    assert decision_event.decision_source == "llm"
    assert decision_event.stock.symbol == "005930.KS"


async def test_rag_failure_does_not_stop_the_stream(
    wired: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """벡터 DB가 죽어도 판단은 나와야 한다.

    `documents_for_advice` 는 스스로 실패를 삼키도록 만들어져 있지만, 그 계약이
    깨졌을 때 스트림이 stage 0 으로 떨어지는지까지 여기서 잡는다.
    """

    async def no_documents(symbol: str, query: str):
        return []

    monkeypatch.setattr(rag_service, "retrieve", no_documents)

    events = [event async for event in advice_stream.stream_advice("005930")]
    agents = [event.agent for event in events if event.agent]

    assert [event.stage for event in events] == [1, 2, 3, 3, 3, 4]
    # 문서가 없으면 인용도 없다 — 있는 척하지 않는다.
    assert all(opinion.sources == [] for opinion in agents)


async def test_upstream_failure_becomes_stage_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    """주가 조회 실패(예: yfinance 429)는 복구 불가라 stage 0 에러로 나간다."""

    async def failing_history(params, **kwargs):
        raise RuntimeError("Too Many Requests. Rate limited.")

    monkeypatch.setattr(stock_service, "get_history", failing_history)

    events = [event async for event in advice_stream.stream_advice("005930")]

    assert len(events) == 1
    assert events[0].stage == 0
    assert "Rate limited" in (events[0].error or "")


# ---------------------------------------------------------------------------
# 2축 판단이 **이 경로**로 흐르는지 (사주 통합 계획 5.4).
#
# 이 테스트가 따로 필요한 이유: 프런트는 비스트리밍 `/advice` 를 부르지 않는다.
# 그쪽에만 personal 을 얹었을 때 백엔드 테스트는 전부 초록인데 화면에는 2축 판단이
# 영영 나타나지 않았다 — 계층별 테스트가 배선을 검증해 주지 않는다는 사례다.
# ---------------------------------------------------------------------------

_CAUTIOUS = InvestorProfile(
    risk_appetite=25, patience=15, decisiveness=80, loss_aversion=90, herd_tendency=85
)

_VOLATILE_METRICS = StockMetrics(
    latest_close=82_000.0,
    day_change_pct=7.1,
    volatility_20d_pct=34.0,
    week52_position_pct=93.0,
    volume_ratio_20d=2.8,
    sma5=80_000.0,
    sma20=76_000.0,
    trend="상승 우위",
)


@pytest.fixture
def volatile(monkeypatch: pytest.MonkeyPatch, wired: None) -> None:
    """적합도가 확실히 낮게 나오는 종목으로 바꾼다."""
    history = _HISTORY.model_copy(update={"metrics": _VOLATILE_METRICS})

    async def fake_history(params, **kwargs):
        return history

    monkeypatch.setattr(stock_service, "get_history", fake_history)
    monkeypatch.setattr(stock_service, "get_metrics", lambda data: _VOLATILE_METRICS)


async def test_stream_omits_personal_without_a_profile(wired: None) -> None:
    """프로파일이 없으면 종전 이벤트 그대로다 — 개인화는 얹는 기능이다."""
    events = [event async for event in advice_stream.stream_advice("005930")]

    assert events[-1].decision is not None
    assert events[-1].decision.personal is None


async def test_stream_carries_the_two_axis_verdict_when_a_profile_is_given(
    volatile: None,
) -> None:
    events = [
        event
        async for event in advice_stream.stream_advice("005930", profile=_CAUTIOUS)
    ]

    decision_event = events[-1].decision
    assert decision_event is not None
    # 상단은 여전히 시장 판단 — 기존 클라이언트가 보는 필드는 안 바뀐다.
    assert decision_event.verdict == "BUY"

    personal = decision_event.personal
    assert personal is not None
    assert personal.market_verdict == "BUY"
    assert personal.verdict == "WATCH"      # 단방향 보정
    assert personal.adjusted is True
    assert personal.fit_level == "low"
    assert personal.concerns and personal.guardrails


async def test_stage_order_is_unchanged_by_personalisation(volatile: None) -> None:
    """개인화가 이벤트 순서·개수를 건드리지 않는다 — 진행 바 계약은 그대로다."""
    events = [
        event
        async for event in advice_stream.stream_advice("005930", profile=_CAUTIOUS)
    ]

    assert [event.stage for event in events] == [1, 2, 3, 3, 3, 4]


# ── 실행 예산 — 멈추는 것이 아니라 착지한다 ─────────────────────────────


@pytest.fixture
def slow_agents(monkeypatch: pytest.MonkeyPatch, wired: None) -> None:
    """에이전트가 영영 안 끝나는 상황. 예산이 유일한 탈출구가 된다."""

    async def never(system_prompt: str, user_content: str, output_model):
        await asyncio.sleep(30)
        raise AssertionError("여기까지 오면 예산이 안 걸린 것이다")

    monkeypatch.setattr(analysts, "ask_structured", never)


async def test_budget_lands_on_a_rule_based_decision(slow_agents: None) -> None:
    """예산을 넘기면 **판단이 나온다.** 에러가 아니다.

    이 한 줄이 이번 변경의 전부다. 예산이 끝난 시점에 우리는 이미 지표를 갖고
    있고 규칙 기반 판단기도 갖고 있다 — 그걸 버리고 "불러오지 못했습니다" 를
    내보내는 것은 기다린 사람에게서 답을 빼앗는 일이다.
    """
    events = [
        event
        async for event in advice_stream.stream_advice("005930", budget_seconds=0.2)
    ]

    assert events[-1].stage == 4
    decision_event = events[-1].decision
    assert decision_event is not None
    assert decision_event.decision_source == "timeout"
    # 규칙 기반이어도 화면이 그릴 것은 다 있다.
    assert decision_event.verdict in {"BUY", "WATCH", "AVOID"}
    assert decision_event.answer


async def test_budget_landing_carries_no_error_field(slow_agents: None) -> None:
    """착지 이벤트에 `error` 를 실으면 **판단이 통째로 버려진다.**

    프런트의 `runAdvice` 는 error 를 decision 보다 **먼저** 검사해서, 하나라도
    실려 있으면 예외를 던지고 결과를 캐시에 넣지 않는다. 즉 여기에 error 를 한
    글자라도 넣는 순간 이 설계 전체가 무력화된다 — 그래서 모든 이벤트를 본다.
    """
    events = [
        event
        async for event in advice_stream.stream_advice("005930", budget_seconds=0.2)
    ]

    assert all(event.error is None for event in events)
    assert not any(event.stage == 0 for event in events)


async def test_budget_landing_keeps_the_two_axis_verdict(
    volatile: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """예산 착지에서도 개인화는 유지된다.

    2축 판단은 그래프 밖에서 지표로 만든다. 시간이 없다고 그것까지 버릴 이유가
    없다 — 오히려 규칙 기반일수록 "당신에게는" 이 더 필요하다.
    """

    async def never(system_prompt: str, user_content: str, output_model):
        await asyncio.sleep(30)

    monkeypatch.setattr(analysts, "ask_structured", never)

    events = [
        event
        async for event in advice_stream.stream_advice(
            "005930", profile=_CAUTIOUS, budget_seconds=0.2
        )
    ]

    decision_event = events[-1].decision
    assert decision_event is not None
    assert decision_event.decision_source == "timeout"
    assert decision_event.personal is not None
    assert decision_event.personal.fit_level == "low"


async def test_budget_reports_failure_when_there_are_no_metrics(
    wired: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """주가조차 못 받았으면 정직하게 실패한다.

    규칙 기반 판단의 입력이 지표라, 지표가 없으면 지어낼 수 없다. 여기서까지
    무언가를 내보내면 그것은 착지가 아니라 날조다.
    """

    async def never(params, **kwargs):
        await asyncio.sleep(30)

    monkeypatch.setattr(stock_service, "get_history", never)

    events = [
        event
        async for event in advice_stream.stream_advice("005930", budget_seconds=0.2)
    ]

    assert [event.stage for event in events] == [0]
    assert events[0].error is not None
    assert events[0].decision is None


async def test_generous_budget_leaves_the_normal_path_untouched(wired: None) -> None:
    """예산이 넉넉하면 종전 경로 그대로다 — 예산은 안전망이지 경로가 아니다."""
    events = [
        event
        async for event in advice_stream.stream_advice("005930", budget_seconds=30)
    ]

    assert [event.stage for event in events] == [1, 2, 3, 3, 3, 4]
    assert events[-1].decision is not None
    assert events[-1].decision.decision_source == "llm"


# ── 스트림 × 펌프 — 두 층이 만나는 자리 ─────────────────────────────────
#
# `test_advice_sse.py` 는 펌프를 평범한 제너레이터로 돌리고, 위 테스트들은
# `stream_advice` 를 펌프 없이 직접 순회한다. **둘이 함께 도는 경로에 테스트가
# 하나도 없었다** — 그런데 예산이 실제로 사는 곳이 정확히 그 이음매다.


async def _through_pump(budget: float, *, consumer_delay: float) -> list[bytes]:
    """소켓 쓰기가 느린 소비자를 흉내 내며 펌프를 끝까지 돌린다."""
    frames: list[bytes] = []
    async for frame in sse_with_heartbeat(
        advice_stream.stream_advice("005930", budget_seconds=budget),
        # 하트비트 자체는 이 테스트의 관심사가 아니다. 다만 **무한대로 두지
        # 않는다** — 배선이 깨졌을 때 실패가 아니라 정지로 나타나면 CI 가
        # 타임아웃으로 죽을 때까지 아무도 원인을 모른다.
        heartbeat_seconds=1.0,
        on_finish=lambda: None,
    ):
        frames.append(frame)
        await asyncio.sleep(consumer_delay)
    return frames


def _stages(frames: list[bytes]) -> list[int]:
    import json

    return [
        json.loads(frame.decode().removeprefix("data: "))["stage"]
        for frame in frames
        if frame.startswith(b"data: ")
    ]


async def test_the_pump_never_makes_the_producer_wait() -> None:
    """**펌프는 생산자에게 역압을 주지 않는다.** 이 파일에서 가장 미묘한 불변식이다.

    큐에 `maxsize` 를 주면 생산자가 `await queue.put()` 에서 **제너레이터 밖**에
    파킹한다. 그 창에서 예산 타이머가 터지면 취소가 제너레이터가 아니라 생산자
    함수 프레임에서 잡혀, `asyncio.timeout` 의 `__aexit__` 가 돌지 않는다 —
    `CancelledError → TimeoutError` 변환이 없으니 **규칙 기반 착지가 통째로
    사라지고** 스트림이 조용히 잘린다. 예외도 로그도 남지 않는다.

    그 회귀를 결과로 잡으려면 타이밍 경합에 기대야 해서 불안정하다. 대신 **원인**을
    직접 단언한다: 생산자는 소비자보다 훨씬 먼저 끝나야 한다.
    """
    delay = 0.05
    stages = (1, 2, 3, 3, 3, 4)
    finished_at: list[float] = []

    async def burst():
        for stage in stages:
            yield AdviceStreamEvent(stage=stage)
        finished_at.append(time.monotonic())

    started = time.monotonic()
    frames = []
    async for frame in sse_with_heartbeat(
        burst(), heartbeat_seconds=1.0, on_finish=lambda: None
    ):
        frames.append(frame)
        await asyncio.sleep(delay)  # 소켓 쓰기가 느린 소비자
    drained = time.monotonic() - started

    assert len(frames) == len(stages)
    # **소비 시간과 비교하지 않는다.** 역압이 생기면 소비 시간까지 함께 늘어나
    # 비율이 가려진다(실측: 회귀 주입 시 생산 0.218초 · 소비 1.343초라 '절반
    # 미만' 이 그대로 통과했다). 절대 기준으로 본다 — 건강한 경우 생산자는
    # 소비자를 **한 번도** 기다리지 않으므로 사실상 0초다.
    assert finished_at[0] - started < delay * 2
    # 소비자가 실제로 느렸다는 것도 함께 고정한다. 안 그러면 위 단언이 공짜다.
    assert drained >= delay * (len(stages) - 1)


async def test_budget_landing_survives_a_slow_consumer(slow_agents: None) -> None:
    """느린 소비자 뒤에서도 규칙 기반 착지가 도착한다.

    사용자의 회선이 느리면 프레임 하나를 소켓에 쓰는 데 시간이 걸린다. 착지가
    하필 그 창에서 만들어지므로, 이 경로가 성립하지 않으면 **가장 느린 사용자만**
    판단을 못 받는다 — 재현하기 가장 어려운 종류의 결함이다.
    """
    frames = await _through_pump(0.2, consumer_delay=0.15)
    data = [frame for frame in frames if frame.startswith(b"data: ")]

    assert _stages(frames)[-1] == 4
    assert b'"decision_source":"timeout"' in data[-1]


async def test_normal_path_through_the_pump_keeps_every_frame(wired: None) -> None:
    """소비자가 느려도 6프레임이 하나도 안 사라진다."""
    frames = await _through_pump(30, consumer_delay=0.05)

    assert _stages(frames) == [1, 2, 3, 3, 3, 4]


async def test_progress_events_carry_the_budget(wired: None) -> None:
    """화면이 예고 문구의 숫자를 손으로 적지 않게, 예산을 와이어에 싣는다.

    프런트 상수로 두면 `ADVICE_BUDGET_SECONDS` 를 조이는 순간 진행 표시가
    "90초가 지나면…" 이라고 거짓말한다 — 그것도 사용자가 가장 예민한 순간에.
    """
    events = [
        event
        async for event in advice_stream.stream_advice("005930", budget_seconds=42)
    ]

    progress = [event for event in events if event.stage in (1, 2)]
    assert progress and all(event.budget_seconds == 42 for event in progress)
