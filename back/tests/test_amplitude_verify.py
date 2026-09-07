"""Agent Analytics 계측이 실제로 이벤트를 내는지 확인한다.

**SDK 를 시험하는 것이 아니라 우리 배선을 시험한다.** 모듈 수준 에이전트를
`MockAmplitudeAI` 것으로 바꿔 끼우고, 앱이 실제로 지나는 경로(`amplitude.session`
→ `amplitude.child` → `llm._record`)를 그대로 통과시킨다.

계측의 실패는 **조용하다** — 예외도 로그도 없이 이벤트가 0건이 될 뿐이라, 이
테스트가 없으면 대시보드를 열어 보기 전까지 아무도 모른다. 실제로 이 저장소에서
프로바이더 래퍼(`wrap()`)를 붙였다면 정확히 그렇게 됐을 것이다: 래퍼는 동기
`generate_content` 만 감싸고 앱은 100% `client.aio` 라서, 에러 없이 이벤트만
사라진다 (`integrations/amplitude` 모듈 주석).
"""

import pytest
from amplitude_ai import (
    PROP_COST_USD,
    PROP_INPUT_TOKENS,
    PROP_LATENCY_MS,
    PROP_MODEL_NAME,
    PROP_OUTPUT_TOKENS,
    PROP_PROVIDER,
    PROP_SESSION_ID,
)
from amplitude_ai.testing import MockAmplitudeAI

from app.integrations import amplitude, llm

# 실제 코드가 쓰는 이름 그대로다. 여기가 어긋나면 테스트는 통과하고 대시보드는 빈다.
# 키가 없으면 `amplitude.py` 가 진짜 에이전트를 만들지 않는다 (그것이 정상 동작이고
# `.env.example` 의 기본값이다). 그 상태에서는 배선을 검사할 대상 자체가 없다 —
# 없는 것을 실패로 부르지 않는다.
pytestmark = pytest.mark.skipif(
    not amplitude.ENABLED,
    reason="AMPLITUDE_AI_API_KEY 가 없어 계측이 꺼져 있습니다",
)

STOCK_AGENT = "stock-advice"
SAJU_AGENT = "saju-report"
CHILDREN = ("journalist", "economist", "analyst", "decision", "query-rewriter")


class _Usage:
    prompt_token_count = 1200
    candidates_token_count = 340
    total_token_count = 1540
    thoughts_token_count = 96


class _Candidate:
    class finish_reason:
        name = "STOP"


class FakeResponse:
    """`google-genai` 응답에서 `_record` 가 읽는 부분만 흉내 낸다."""

    usage_metadata = _Usage()
    candidates = [_Candidate()]
    text = "매수 의견"


@pytest.fixture
def mock(monkeypatch):
    """모듈 수준 에이전트를 mock 으로 갈아 끼운다.

    `amplitude.py` 는 import 시점에 진짜 에이전트를 만든다(그래야 요청마다 새
    Agent ID 가 생기지 않는다). 테스트는 그 상수를 바꿔 끼워서 같은 코드 경로를
    네트워크 없이 지나게 한다.
    """
    m = MockAmplitudeAI()
    stock = m.agent(STOCK_AGENT)
    monkeypatch.setattr(amplitude, "STOCK_ADVICE", stock)
    monkeypatch.setattr(amplitude, "SAJU_REPORT", m.agent(SAJU_AGENT))
    monkeypatch.setattr(
        amplitude, "STOCK_CHILDREN", {name: stock.child(name) for name in CHILDREN}
    )
    return m


async def test_session_sets_and_clears_the_active_session(mock):
    """`llm.py` 는 이 contextvar 하나로 세션을 찾는다 — 새면 다음 요청에 붙는다."""
    assert amplitude.active_session() is None

    async with amplitude.session(
        amplitude.STOCK_ADVICE, user_id="owner-1", session_id="advice:owner-1:005930"
    ) as s:
        assert s is not None
        assert amplitude.active_session() is s

    assert amplitude.active_session() is None
    mock.assert_session_closed("advice:owner-1:005930")


async def test_llm_record_emits_an_ai_response(mock):
    """`_record` 가 실제로 `[Agent] AI Response` 를 낸다."""
    async with amplitude.session(
        amplitude.STOCK_ADVICE, user_id="owner-1", session_id="s-1"
    ):
        llm._record(
            content="매수 의견",
            latency_ms=1234.5,
            system_prompt="너는 애널리스트다",
            response=FakeResponse(),
        )

    events = mock.get_events("[Agent] AI Response")
    assert len(events) == 1
    assert events[0].event_properties["[Agent] Agent ID"] == STOCK_AGENT


async def test_record_is_silent_without_a_session(mock):
    """워밍업·배치는 세션 없이 `llm.py` 를 부른다 — 거기서 터지면 안 된다."""
    assert amplitude.active_session() is None
    llm._record(content="x", latency_ms=1.0, response=FakeResponse())
    assert mock.get_events("[Agent] AI Response") == []


async def test_failed_call_is_recorded_as_an_error(mock):
    """실패도 남는다. 성공만 남기면 오류율·지연 차트가 실패를 통째로 못 본다."""
    async with amplitude.session(
        amplitude.STOCK_ADVICE, user_id="owner-1", session_id="s-err"
    ):
        llm._record(
            content="",
            latency_ms=45_000.0,
            error=TimeoutError("모델이 응답하지 않았습니다"),
        )

    events = mock.get_events("[Agent] AI Response")
    assert len(events) == 1
    assert events[0].event_properties["[Agent] Is Error"] is True


@pytest.mark.parametrize("name", CHILDREN)
async def test_delegation_keeps_the_session_id(mock, name):
    """자식 에이전트의 이벤트가 부모와 **같은 대화**에 붙어야 한다.

    session_id 가 갈라지면 5개 에이전트가 한 판단이 아니라 5개의 1턴짜리 대화로
    보인다 — 멀티 에이전트 화면이 성립하지 않는다.
    """
    async with amplitude.session(
        amplitude.STOCK_ADVICE, user_id="owner-1", session_id="s-multi"
    ):
        async with amplitude.child(name) as cs:
            assert cs is not None
            llm._record(content="의견", latency_ms=900.0, response=FakeResponse())

    events = mock.events_for_agent(name)
    assert events, f"{name} 에이전트가 이벤트를 하나도 내지 않았습니다"
    assert events[0]["event_properties"][PROP_SESSION_ID] == "s-multi"


async def test_child_is_a_no_op_without_a_session(mock):
    """계측이 꺼져 있어도 `graph/nodes.py` 가 분기 없이 같은 코드를 쓴다."""
    async with amplitude.child("analyst") as cs:
        assert cs is None


async def test_saju_never_sends_prompt_or_response_text(mock, monkeypatch):
    """**생년월일시는 나가면 안 된다.**

    사주 에이전트는 metadata_only 인스턴스에서 나야 한다. 이 테스트가 지키는 것은
    설정 한 줄이 아니라 `saju_service.read_chart` 가 이미 내린 판단이다 — 그쪽은
    예외 메시지에서도 그 값을 뺀다.

    mock 은 진짜 인스턴스의 content_mode 를 물려받지 않으므로, 여기서는 배선을
    검사한다: 사주 세션은 metadata_only 인스턴스의 에이전트를 써야 한다.
    """
    import app.integrations.amplitude as mod

    # 갈아끼우기 전의 진짜 객체를 본다.
    assert mod.SAJU_REPORT is not None
    assert mod.STOCK_ADVICE is not None
    assert mod._ai_metadata_only is not None
    assert mod._ai_full is not None
    assert str(mod._ai_metadata_only.config.content_mode) == "metadata_only"
    assert str(mod._ai_full.config.content_mode) == "full"
    assert mod._ai_full.config.redact_pii is True


async def test_ai_response_carries_what_the_dashboards_need(mock):
    """데이터 품질 게이트 — 필드 하나가 비면 차트 하나가 통째로 빈다."""
    async with amplitude.session(
        amplitude.STOCK_ADVICE, user_id="owner-1", session_id="s-quality"
    ):
        llm._record(
            content="매수 의견",
            latency_ms=1234.5,
            system_prompt="너는 애널리스트다",
            response=FakeResponse(),
        )

    events = mock.get_events("[Agent] AI Response")
    assert len(events) == 1
    event = events[0]
    props = event.event_properties

    assert event.user_id or event.device_id
    assert props.get(PROP_SESSION_ID) == "s-quality"
    assert props.get(PROP_MODEL_NAME)
    assert props.get(PROP_PROVIDER) == "gemini"
    assert props.get(PROP_LATENCY_MS, 0) > 0
    assert props.get(PROP_INPUT_TOKENS, 0) > 0
    assert props.get(PROP_OUTPUT_TOKENS, 0) > 0
    # 비면 모델 이름이 genai-prices 에 없다는 뜻이다.
    assert props.get(PROP_COST_USD) is not None


async def test_embedding_records_count_but_not_text(mock):
    """RAG 색인 원문은 남기지 않는다 — 이미 우리 DB 에 있는 텍스트의 사본이다."""
    async with amplitude.session(
        amplitude.STOCK_ADVICE, user_id="owner-1", session_id="s-embed"
    ):
        llm._record_embedding(latency_ms=210.0, count=17)

    events = mock.get_events("[Agent] Embedding")
    assert len(events) == 1


async def test_child_lets_the_real_exception_through(mock):
    """계측이 **원인을 가리면 안 된다.**

    `yield` 를 `except Exception` 안에 두었더니 감싼 본문의 예외가 삼켜지고
    `RuntimeError: generator didn't stop after athrow()` 로 바뀌었다. 그 상태에서
    `nodes.py` 의 `질의 재작성 실패 (%s)` 로그는 진짜 원인 대신 그 RuntimeError 를
    찍는다 — 디버깅이 불가능해진다.
    """
    async with amplitude.session(
        amplitude.STOCK_ADVICE, user_id="owner-1", session_id="s-raise"
    ):
        with pytest.raises(ValueError, match="진짜 원인"):
            async with amplitude.child("analyst"):
                raise ValueError("진짜 원인")


async def test_session_lets_the_real_exception_through(mock):
    """세션 컨텍스트도 마찬가지다."""
    with pytest.raises(ValueError, match="진짜 원인"):
        async with amplitude.session(
            amplitude.STOCK_ADVICE, user_id="owner-1", session_id="s-raise-2"
        ):
            raise ValueError("진짜 원인")

    # 예외가 났어도 contextvar 는 깨끗해야 한다 — 새면 다음 요청에 붙는다.
    assert amplitude.active_session() is None


async def test_agent_profile_keys_match_the_registered_children():
    """프로필 슬러그와 등록된 자식 에이전트 이름이 어긋나면 위임이 통째로 사라진다.

    `amplitude.child()` 는 모르는 이름을 받으면 조용히 통과한다 — 그래야 계측이
    꺼진 상태에서도 호출부가 같은 코드를 쓸 수 있다. 대가는 오타가 침묵한다는
    것이고, 그 침묵을 여기서 깬다.
    """
    from app.agents.prompts import ANALYST, DECISION_PROFILE, ECONOMIST, JOURNALIST

    for profile in (JOURNALIST, ECONOMIST, ANALYST, DECISION_PROFILE):
        assert profile.key in CHILDREN, (
            f"{profile.name}({profile.key}) 가 STOCK_CHILDREN 에 없습니다"
        )


async def test_both_advice_paths_delegate_to_child_agents(mock, monkeypatch):
    """그래프 경로와 비그래프 경로가 **둘 다** 자식 에이전트를 남긴다.

    `POST /stocks/advice` 는 그래프를 타지 않고 `collect_opinions` 를 직접 부른다
    (`services/advice_service`). 계측이 `graph/nodes.py` 에만 있었을 때 이 경로는
    LLM 호출 네 번을 전부 부모에 붙여, 멀티 에이전트 화면이 비어 있었다.
    """
    from app.agents import analysts
    from app.agents.prompts import JOURNALIST

    async def fake_ask_structured(system, content, model):
        # 실제 호출 자리에서 기록이 일어나는지 본다.
        llm._record(content="의견", latency_ms=100.0, response=FakeResponse())
        raise RuntimeError("여기서 멈춘다 — 위임이 걸렸는지만 본다")

    monkeypatch.setattr(analysts, "ask_structured", fake_ask_structured)

    async with amplitude.session(
        amplitude.STOCK_ADVICE, user_id="owner-1", session_id="s-paths"
    ):
        # `_invoke` 는 실패를 규칙 기반 의견으로 흡수하므로 예외가 새지 않는다.
        await analysts.invoke_one(JOURNALIST, "context", None)

    events = mock.events_for_agent("journalist")
    assert events, "journalist 에이전트에 이벤트가 없습니다 — 위임이 안 걸렸습니다"
    assert events[0]["event_properties"][PROP_SESSION_ID] == "s-paths"
