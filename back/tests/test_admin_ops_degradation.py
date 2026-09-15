"""운영 현황이 **부가 정보 하나 때문에 통째로 사라지지 않는다**.

## 왜 이 테스트가 필요한가

`/admin/ops` 는 여러 조회를 한 응답에 모은다. 그중 하나가 던지면 등록된 핸들러가
없어 500 이 되고, 그 순간 화면에서 사라지는 것은 토큰 사용량만이 아니다 — 배치
적재율, 마지막 실행 시각, 그리고 **"AI 판단 엔드포인트가 안 잠겨 있다" 는 경고**까지
함께 사라진다. 조용히 열려 있는 자물쇠를 못 보게 되는 것이 이 화면에서 가장 나쁜
결과이고, 그것을 나중에 붙인 숫자 하나 때문에 잃을 수는 없다.

구체적인 경로는 **백엔드가 `alembic upgrade head` 보다 먼저 배포된 순간**이다.
`llm_usage_days` 가 아직 없어 `UndefinedTable` 이 난다. 흔한 일은 아니지만, 나면
관리자 화면 전체가 죽는데 원인은 "새 표가 없다" 뿐이라 진단이 늦다.
"""

import pytest
from sqlalchemy.exc import ProgrammingError

from app.repositories.llm_usage import LlmUsageSummary
from app.services import admin_service


class _BrokenUsageRepo:
    """표가 없을 때의 리포지터리. asyncpg 의 `UndefinedTable` 은 SQLAlchemy 에서
    `ProgrammingError` 로 올라온다."""

    async def summary(self):
        raise ProgrammingError("select ...", {}, Exception("UndefinedTable"))


class _WorkingUsageRepo:
    def __init__(self, value: LlmUsageSummary) -> None:
        self._value = value

    async def summary(self):
        return self._value


class TestTokenUsageGuard:
    async def test_a_missing_table_degrades_to_zeros(self) -> None:
        """**이 테스트가 이 파일의 존재 이유다.** 던지지 않고 빈 값을 준다."""
        summary = await admin_service._token_usage_or_empty(_BrokenUsageRepo())  # type: ignore[arg-type]

        assert summary.total.total_tokens == 0
        assert summary.by_model == []
        # 화면이 "아직 기록이 없습니다" 를 그리는 근거다. 0 과 None 은 이미 그
        # 화면이 그릴 줄 아는 모양이라, 따로 오류 표시를 만들지 않았다.
        assert summary.started_on is None

    async def test_a_working_repo_is_passed_through_untouched(self) -> None:
        """가드가 정상 경로를 바꾸지 않는다 — 감싸기만 한다."""
        value = LlmUsageSummary.empty()
        assert await admin_service._token_usage_or_empty(_WorkingUsageRepo(value)) is value

    async def test_unexpected_errors_are_not_swallowed(self) -> None:
        """DB 오류만 접는다. 프로그래밍 실수(예: 타입 오류)까지 0 으로 덮으면
        화면이 "기록 없음" 을 보여주는 동안 원인은 어디에도 남지 않는다."""
        class _Bug:
            async def summary(self):
                raise TypeError("잘못된 인자")

        with pytest.raises(TypeError):
            await admin_service._token_usage_or_empty(_Bug())  # type: ignore[arg-type]
