"""재시도 경계 — 예산을 지키면서 살릴 수 있는 실패만 살린다.

## 이 파일이 지키는 것

운영에서 사주 리포트가 간이 리포트로 떨어지는 경로가 둘이었다(2026-09-21 실측).

    504 DEADLINE_EXCEEDED   44초 걸려 실패
    503 UNAVAILABLE          1.7초 만에 실패

둘을 같이 재시도하면 `config._llm_must_fit_the_advice_budget` 이 기동을 막고,
둘 다 재시도하지 않으면 살릴 수 있는 호출을 버린다. 그래서 경계가 정확해야 한다 —
**빠른 실패만 다시, 느린 실패는 그대로.**

경계가 틀려도 화면에는 "간이 리포트" 한 줄만 뜨거나, 반대로 설정이 기동을 거부한다.
둘 다 원인이 이 판정이라는 것이 드러나지 않는 종류라 여기서 고정한다.
"""

import pytest

from app.core.config import Settings
from app.domain.llm_retry import (
    FAST_FAILURE_ALLOWANCE_SECONDS,
    is_transient,
    worst_case_seconds,
)


class TestIsTransient:
    @pytest.mark.parametrize("code", [429, 500, 502, 503])
    def test_fast_failures_are_retried(self, code: int) -> None:
        """운영에서 본 503 이 여기 있다. 1.7초 만에 죽었고 예산을 쓰지 않았다."""
        assert is_transient(code) is True

    def test_deadline_is_not_retried(self) -> None:
        """**이 테스트가 이 파일의 존재 이유다.**

        504 는 우리 상한(45초)에 걸렸다는 뜻이다. 다시 부르면 45초를 한 번 더 쓰고
        AI 판단 예산이 무너진다. 느린 모델은 재시도가 아니라 모델·상한의 문제다.
        """
        assert is_transient(504) is False

    @pytest.mark.parametrize("code", [400, 401, 403, 404, 422])
    def test_client_errors_are_not_retried(self, code: int) -> None:
        """잘못 보낸 요청을 다시 보내도 같은 답이 온다."""
        assert is_transient(code) is False

    @pytest.mark.parametrize("code", [None, "503", 503.0, object()])
    def test_unreadable_codes_are_not_retried(self, code: object) -> None:
        """무엇이 잘못됐는지 모르는 채로 다시 부르면 실패를 두 배로 만들 뿐이다."""
        assert is_transient(code) is False


class TestWorstCase:
    def test_transient_retries_cost_a_fast_failure_each(self) -> None:
        """일시 재시도는 타임아웃이 아니라 **빠른 실패 + 대기**만큼만 더 쓴다."""
        base = worst_case_seconds(
            timeout_seconds=45, max_retries=0, transient_retries=0, backoff_seconds=0.5
        )
        one = worst_case_seconds(
            timeout_seconds=45, max_retries=0, transient_retries=1, backoff_seconds=0.5
        )

        assert base == 45
        assert one == 45 + FAST_FAILURE_ALLOWANCE_SECONDS + 0.5

    def test_sdk_retries_cost_a_whole_timeout_each(self) -> None:
        """`llm_max_retries` 는 성질이 다르다 — 이쪽은 상한을 통째로 한 번 더 쓴다."""
        assert (
            worst_case_seconds(
                timeout_seconds=45, max_retries=1, transient_retries=0, backoff_seconds=0.5
            )
            == 90
        )


class TestSettingsInvariant:
    def test_default_settings_fit_the_budget(self) -> None:
        """기본값이 실제로 통과한다. 통과하지 못하면 앱이 기동조차 못 한다."""
        s = Settings()
        worst = worst_case_seconds(
            timeout_seconds=s.llm_timeout_seconds,
            max_retries=s.llm_max_retries,
            transient_retries=s.llm_transient_retries,
            backoff_seconds=s.llm_transient_backoff_seconds,
        )

        assert worst <= s.advice_budget_seconds * s.advice_soft_ratio

    def test_a_second_sdk_retry_is_rejected(self) -> None:
        """예산을 넘기는 설정은 **기동 시점에** 막힌다 — 운영에서 늦게 알면 안 된다."""
        with pytest.raises(ValueError, match="소프트 지점"):
            Settings(llm_max_retries=1)

    def test_too_many_transient_retries_are_rejected(self) -> None:
        """새 손잡이도 같은 예산 안에 있다. 무제한으로 늘릴 수 있으면 뜻이 없다."""
        with pytest.raises(ValueError):
            Settings(llm_transient_retries=3, llm_timeout_seconds=45.0)
