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


class DailyVisitPoint(BaseModel):
    """추이 그래프의 한 칸. **방문이 0 인 날도 온다.**

    DB 는 행이 있는 날만 아는데, 빈 날을 서버가 채워 보내지 않으면 화면이
    "조회가 안 된 날" 과 "아무도 안 온 날" 을 구분할 수 없다. 축은 서버가 세운다.
    """

    #: KST 기준 날짜 (ISO `YYYY-MM-DD`)
    day: str
    visitors: int = 0


class MemberVisit(BaseModel):
    """회원 한 명의 접속 요약."""

    user_id: str
    email: str | None = None
    name: str | None = None
    #: 방문한 **날 수**. 승인된 정의(하루 1회)에서 이것이 접속수다
    visit_count: int = 0
    #: 최근 접속일시(ISO). 이 화면의 핵심 값이다
    last_seen_at: str | None = None
    first_seen_at: str | None = None


class VisitStats(BaseModel):
    """`GET /admin/visits` 응답.

    ## 익명과 회원을 나눠 담는 이유

    승인된 접속 정의가 "익명 포함" 이라 `total_visitors` 에는 둘이 섞여 있다.
    구성을 함께 주지 않으면 화면이 3,000 이라는 숫자만 내놓고, 보는 사람은 그것이
    회원 3,000명인지 브라우저 3,000개인지 알 수 없다. 사주 서비스는 회원가입을
    받지 않으므로 실제로는 익명이 대부분이다.

    ## 총 방문일을 함께 주는 이유

    `total_visitors` 만으로는 재방문이 있었는지 알 수 없다. 방문자 1,000명·방문일
    1,000건이면 아무도 두 번 오지 않았다는 뜻이고, 그건 접속자수와 전혀 다른 신호다.
    """

    #: 서로 다른 방문자 수 (익명 + 회원)
    total_visitors: int = 0
    #: 방문일의 합. `total_visitors` 보다 크면 재방문이 있었다
    total_visit_days: int = 0
    anon_visitors: int = 0
    member_visitors: int = 0

    #: 오늘(KST) 접속자수
    today_visitors: int = 0
    #: 기준 날짜(KST, ISO). 화면이 "어느 날의 오늘인가" 를 밝힐 수 있게 함께 준다 —
    #: UTC 로 계산됐는지 KST 로 계산됐는지가 이 값으로 드러난다
    today: str

    #: 최신이 먼저. 빈 날 포함
    daily: list[DailyVisitPoint] = Field(default_factory=list)

    members: list[MemberVisit] = Field(default_factory=list)
    #: 접속 기록이 있는 회원 수. `members` 는 페이지이고 이것이 전체다
    member_total: int = 0

    generated_at: str


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


class TokenTotals(BaseModel):
    """한 구간의 토큰 합계."""

    #: **토큰을 태운 호출 수 — 거절도 포함한다.** SAFETY 로 막힌 응답에도 입력
    #: 토큰은 실려 온다. 네트워크 실패처럼 사용량 자체가 없는 호출만 빠진다
    calls: int = 0
    input_tokens: int = 0
    #: 본문 출력. **사고 토큰은 여기 포함되지 않는다**
    output_tokens: int = 0
    #: 사고(thinking). Gemini 는 이것을 출력과 같은 단가로 과금한다 —
    #: 실측(`saju-llm-cost.xlsx`)에서 medium 은 사고가 과금 출력의 절반을 넘었다.
    #: 합쳐 두면 비용이 어디서 나는지 화면에서 안 보인다
    reasoning_tokens: int = 0
    #: 캐시에서 읽은 입력. 입력의 부분집합이라 합계에 더하지 않는다
    cache_read_tokens: int = 0
    total_tokens: int = 0


class ModelTokenUsage(BaseModel):
    """모델 하나의 누적. 단가가 모델마다 10배 넘게 다르므로 쪼개 준다."""

    model: str
    totals: TokenTotals = Field(default_factory=TokenTotals)


class TokenUsage(BaseModel):
    """AI 토큰 사용량. `llm_usage_days` 의 집계다.

    **예산·잔여는 없다.** Gemini API 가 잔여 할당량을 응답으로 주지 않고, 이 제품은
    월 예산을 두지 않기로 했다(2026-09-14). 없는 숫자를 추정해 보여주는 것보다
    쓴 만큼만 말하는 편이 정직하다.

    **임베딩은 빠져 있다.** RAG 색인·검색이 쓰는 `embed_content` 는 토큰 수를 주지
    않는다(과금 단위가 문자다). 여기 숫자는 생성 호출만이고, 화면도 그렇게 밝힌다.
    """

    today: TokenTotals = Field(default_factory=TokenTotals)
    month: TokenTotals = Field(default_factory=TokenTotals)
    total: TokenTotals = Field(default_factory=TokenTotals)
    #: 누적 합계 내림차순
    by_model: list[ModelTokenUsage] = Field(default_factory=list)
    #: **집계를 시작한 날(KST, `YYYY-MM-DD`).** 과거는 채우지 않았으므로 화면이
    #: 이것을 밝혀야 "누적" 이 언제부터인지 오해가 없다
    started_on: str | None = None
    last_used_at: str | None = None


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

    #: AI 토큰 사용량. 위 `advice_*` 와 **다른 질문**에 답한다 — 그쪽은 재시작하면
    #: 0 이 되는 현재 상태고, 이쪽은 누적이라 DB 에 쌓인다
    token_usage: TokenUsage = Field(default_factory=TokenUsage)

    generated_at: str
