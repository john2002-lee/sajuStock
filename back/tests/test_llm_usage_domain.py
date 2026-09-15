"""토큰 사용량의 순수 부분 — 프로바이더 어휘에서 우리 숫자로 넘어오는 자리.

이 파일이 따로 있는 이유는 `test_visits_domain.py` 와 같다. **DB 없이 돌아야** 한다.
나머지(upsert·집계)는 Postgres 가 필요하지만, 오류 없이 조용히 틀릴 수 있는 부분은
여기 모여 있다:

* SDK 가 필드를 하나 더 붙였을 때 **LLM 호출 자체가 죽는 것**
* 프로바이더가 합계를 안 줬을 때 합계가 0 으로 굳는 것
* 사고(thinking) 토큰이 합계에서 빠지는 것 — Gemini 는 그것을 출력으로 과금하므로
  빠지면 비용이 실제보다 작게 보인다
"""

from app.domain.llm_usage import LlmTokens


class TestFromUsage:
    def test_maps_the_five_counters(self) -> None:
        tokens = LlmTokens.from_usage(
            {
                "input_tokens": 1833,
                "output_tokens": 1387,
                "reasoning_tokens": 1653,
                "cache_read_tokens": 512,
                "total_tokens": 4873,
            }
        )

        assert tokens.input_tokens == 1833
        assert tokens.output_tokens == 1387
        assert tokens.reasoning_tokens == 1653
        assert tokens.cache_read_tokens == 512
        assert tokens.total_tokens == 4873

    def test_unknown_keys_are_dropped_instead_of_raising(self) -> None:
        """**이 테스트가 이 파일의 존재 이유다.**

        SDK 가 `usage_metadata` 에 필드를 하나 추가하면 `LlmTokens(**usage)` 는
        `TypeError` 다. 그 예외가 `_persist` 밖으로 나가면 계측 때문에 사주 리포트와
        AI 판단이 통째로 실패한다 — 새 숫자를 한동안 놓치는 쪽이 낫다.
        """
        tokens = LlmTokens.from_usage(
            {"input_tokens": 10, "tool_use_prompt_token_count": 999}
        )

        assert tokens.input_tokens == 10

    def test_missing_total_is_filled_from_the_parts(self) -> None:
        """합계가 안 오면 입력+출력+사고로 채운다.

        0 으로 두면 화면의 "누적" 이 호출을 세고도 토큰 0 을 보여준다 — 값이
        틀렸다는 신호가 어디에도 없는 상태다.
        """
        tokens = LlmTokens.from_usage(
            {"input_tokens": 100, "output_tokens": 50, "reasoning_tokens": 25}
        )

        assert tokens.total_tokens == 175

    def test_reasoning_counts_toward_the_total(self) -> None:
        """사고 토큰은 **출력과 같은 단가로 과금된다.** 합계에서 빼면 비용이 작게 보인다."""
        without = LlmTokens.from_usage({"input_tokens": 100, "output_tokens": 50})
        with_thinking = LlmTokens.from_usage(
            {"input_tokens": 100, "output_tokens": 50, "reasoning_tokens": 900}
        )

        assert with_thinking.total_tokens - without.total_tokens == 900

    def test_cache_read_does_not_inflate_the_total(self) -> None:
        """캐시로 읽은 입력은 입력의 **부분집합**이다. 더하면 두 번 세어진다."""
        tokens = LlmTokens.from_usage(
            {"input_tokens": 100, "output_tokens": 50, "cache_read_tokens": 80}
        )

        assert tokens.total_tokens == 150

    def test_provider_total_wins_over_our_sum(self) -> None:
        """프로바이더가 셈한 값이 있으면 그것을 쓴다 — 청구의 근거는 그쪽이다."""
        tokens = LlmTokens.from_usage(
            {"input_tokens": 1, "output_tokens": 1, "total_tokens": 999}
        )

        assert tokens.total_tokens == 999


class TestEmpty:
    def test_no_usage_is_empty(self) -> None:
        """실패·거절 응답에는 사용량 메타가 없다. 그때 행을 만들면 호출 수만 부푼다."""
        assert LlmTokens.from_usage({}).empty

    def test_any_token_is_not_empty(self) -> None:
        """**입력만 태운 호출도 기록한다.** SAFETY 로 막혀도 프롬프트 토큰은 나갔다."""
        assert not LlmTokens.from_usage({"input_tokens": 1833}).empty
