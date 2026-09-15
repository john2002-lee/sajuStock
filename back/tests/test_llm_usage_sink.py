"""토큰 사용량 싱크의 배선 — DB 도 네트워크도 없이 확인한다.

## 무엇을 지키는 테스트인가

사용량 기록은 **조용히 사라질 수 있는 종류**다. 싱크가 안 꽂혀 있거나, 사용량이
빈 응답에 행을 만들거나, 싱크가 던진 예외가 LLM 호출까지 끌고 내려가도 — 셋 다
화면에는 "숫자가 좀 이상하다" 또는 "AI 판단이 가끔 실패한다" 로만 나타난다.
원인을 그때 찾기는 어렵다.

`_persist` 는 비공개 함수지만 여기서 직접 부른다. 공개 경로(`ask_text`)로 가려면
Gemini 클라이언트를 흉내 내야 하고, 그러면 **테스트가 검증하는 대상이 배선이 아니라
가짜 SDK** 가 된다.
"""

import pytest

from app.core.config import settings
from app.domain.llm_usage import LlmTokens
from app.integrations import llm


class _Usage:
    """Gemini 의 `usage_metadata` 흉내. 이름은 프로바이더 쪽 어휘 그대로다."""

    def __init__(self, **counts: int) -> None:
        self.prompt_token_count = counts.get("prompt", 0)
        self.candidates_token_count = counts.get("candidates", 0)
        self.thoughts_token_count = counts.get("thoughts", 0)
        self.total_token_count = counts.get("total", 0)


class _Response:
    def __init__(self, usage: _Usage | None) -> None:
        self.usage_metadata = usage


@pytest.fixture
def sink():
    """기록된 호출을 모으는 싱크. **테스트가 끝나면 반드시 떼어낸다** —
    모듈 전역이라 남겨 두면 다음 테스트가 이 리스트에 쌓는다."""
    seen: list[tuple[str, LlmTokens]] = []

    async def record(model: str, tokens: LlmTokens) -> None:
        seen.append((model, tokens))

    llm.set_usage_sink(record)
    yield seen
    llm.set_usage_sink(None)


class TestPersist:
    async def test_hands_the_model_and_tokens_to_the_sink(self, sink) -> None:
        response = _Response(_Usage(prompt=1833, candidates=1387, thoughts=1653, total=4873))

        await llm._persist(response)  # type: ignore[arg-type]

        assert len(sink) == 1
        model, tokens = sink[0]
        # 모델은 설정에서 온다 — 호출부가 넘기지 않는다. 그래야 셸 환경변수가
        # `.env` 를 덮은 상황(이 저장소에서 실제로 났다)도 표에 그대로 남는다.
        assert model == settings.gemini_model
        assert tokens.input_tokens == 1833
        assert tokens.reasoning_tokens == 1653
        assert tokens.total_tokens == 4873

    async def test_empty_usage_records_nothing(self, sink) -> None:
        """사용량이 없는 응답에 행을 만들면 호출 수만 부풀고 토큰은 0 으로 남는다."""
        await llm._persist(_Response(None))  # type: ignore[arg-type]

        assert sink == []

    async def test_no_response_records_nothing(self, sink) -> None:
        """네트워크 실패 경로다. 응답 자체가 없으면 셈할 것도 없다."""
        await llm._persist(None)

        assert sink == []


class TestFailureIsolation:
    async def test_without_a_sink_it_is_a_no_op(self) -> None:
        """싱크가 안 꽂힌 상태(테스트·배치·스크립트)에서도 던지지 않는다."""
        llm.set_usage_sink(None)

        await llm._persist(_Response(_Usage(prompt=10, total=10)))  # type: ignore[arg-type]

    async def test_a_failing_sink_does_not_break_the_call(self) -> None:
        """**계측이 판단을 죽이면 안 된다.**

        DB 가 잠깐 안 되는 것과 사주 리포트가 실패하는 것은 전혀 다른 사건이다.
        전자 때문에 후자가 생기면, 토큰을 이미 태우고도 사용자는 답을 못 받는다.
        """

        async def broken(model: str, tokens: LlmTokens) -> None:
            raise RuntimeError("DB 가 응답하지 않습니다")

        llm.set_usage_sink(broken)
        try:
            await llm._persist(_Response(_Usage(prompt=10, total=10)))  # type: ignore[arg-type]
        finally:
            llm.set_usage_sink(None)
