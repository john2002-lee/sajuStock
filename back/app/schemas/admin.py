"""관리자 API 스키마.

프런트가 이 형태를 그대로 받는다 (`front/src/features/admin/services/*`).
필드 이름을 바꾸면 그쪽 Wire 타입도 함께 바꿔야 한다.
"""

from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["user", "admin"]


class AdminUser(BaseModel):
    """회원 한 명. `users` 행 + 우리가 붙인 통계."""

    id: str
    email: str | None = None
    name: str | None = None
    image: str | None = None
    role: Role = "user"
    #: 메일 인증 시각(ISO). 매직링크로 가입한 계정에만 있다
    email_verified: str | None = None
    #: 담아 둔 관심종목 수. **삭제 확인 화면이 이 숫자를 보여준다** —
    #: "이 계정을 지우면 무엇이 함께 사라지는지" 를 모르고 누르면 안 된다
    watchlist_count: int = 0
    has_profile: bool = False
    #: 만료되지 않은 세션 수. 0 이면 지금 로그인해 있지 않다
    active_sessions: int = 0


class AdminUserPage(BaseModel):
    """`GET /admin/users` 응답."""

    rows: list[AdminUser] = Field(default_factory=list)
    #: 검색 적용 **후** 전체 건수
    total: int = 0
    #: 전체 관리자 수. 화면이 마지막 관리자의 강등 버튼을 미리 잠그는 근거다
    admin_count: int = 0
    updated_at: str


class RoleUpdate(BaseModel):
    """`PATCH /admin/users/{id}/role` 요청."""

    role: Role


class DeleteResult(BaseModel):
    """`DELETE /admin/users/{id}` 응답. 무엇이 함께 사라졌는지 밝힌다."""

    deleted_watchlist: int = 0
    deleted_profiles: int = 0


class AuditEntry(BaseModel):
    """감사 로그 한 줄."""

    id: int
    created_at: str
    actor_email: str | None = None
    actor_user_id: str
    action: str
    target_email: str | None = None
    target_user_id: str | None = None
    detail: str | None = None
    #: 거절된 시도도 남는다. 화면이 성공과 다르게 그려야 한다
    ok: bool = True


class AuditPage(BaseModel):
    rows: list[AuditEntry] = Field(default_factory=list)
    total: int = 0


class BatchStatus(BaseModel):
    """배치 하나의 최근 상태. `batch_runs` 두 질의를 합친 것이다.

    **마지막 실행과 마지막 실패를 함께 담는다.** 마지막 실행만 주면 "어제 실패했고
    오늘 성공" 과 "계속 성공" 이 구분되지 않고, 마지막 실패만 주면 "실패가 없다" 와
    "배치가 아예 돌지 않았다" 가 구분되지 않는다. 후자가 더 나쁜 상태다.
    """

    name: str
    #: 마지막 실행 (성공·실패 무관). None 이면 **한 번도 돌지 않았다**
    last_run_at: str | None = None
    last_run_ok: bool | None = None
    #: 그 실행이 물어본/응답받은/반영한 종목 수
    attempted: int = 0
    answered: int = 0
    applied: int = 0
    detail: str | None = None
    #: 가장 최근 실패. 지금이 정상이어도 남는다 — 되풀이되는 실패를 보려면 필요하다
    last_failure_at: str | None = None
    last_failure_detail: str | None = None


class OpsSnapshot(BaseModel):
    """`GET /admin/ops` — 운영 현황.

    전부 **적재된 값을 읽기만** 한다. 이 엔드포인트는 배치를 돌리지 않는다 —
    관리자 화면을 여는 것만으로 야후에 2,700회를 칠 수는 없다.
    """

    #: 배치 진행률 셋. 분모는 셋 다 같다 (`.KS`/`.KQ` 모집단)
    calendar_covered: int = 0
    fundamentals_covered: int = 0
    market_cap_covered: int = 0
    universe_size: int = 0

    #: 마지막 배치 시각 (ISO). 한 번도 안 돌았으면 None
    last_calendar_batch: str | None = None
    last_fundamentals_batch: str | None = None

    #: AI 판단 캐시 — 돈이 나가는 유일한 경로의 관측 지점.
    #: **프로세스 메모리라 재시작하면 0 이다.** 누적이 아니라 현재 상태다
    advice_cached: int = 0
    advice_capacity: int = 0
    advice_in_flight: int = 0
    advice_max_concurrent: int = 0

    #: 자물쇠·기능 상태. 꺼져 있다는 사실이 화면에 보여야 한다
    advice_locked: bool = False
    rag_enabled: bool = False

    #: 배치 실행 기록. **목록인 것은 의도다** — 지금은 스냅샷 배치 하나만 기록하지만,
    #: 시가총액·등락률 배치가 같은 기록자를 채택할 때 스키마를 바꾸지 않아도 된다.
    batches: list[BatchStatus] = Field(default_factory=list)

    generated_at: str
