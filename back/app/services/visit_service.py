"""접속 통계 조립.

저장소는 숫자를 세고 이 모듈은 **화면이 물어보는 형태로 맞춘다.** 둘을 나눈 이유는
`admin_service.get_ops_snapshot` 과 같다 — 쿼리 하나하나가 아니라 "한 화면에 필요한
한 벌" 이 여기 있어야, 화면을 고칠 때 SQL 을 건드리지 않는다.

## 여기서 하는 일은 사실상 둘

1. **빈 날 채우기.** DB 는 행이 있는 날만 안다. 축을 `domain/visits.recent_dates`
   로 세우고 값을 얹어야 "조회가 안 된 날" 과 "아무도 안 온 날" 이 구분된다.
2. **날짜·시각을 ISO 문자열로.** 프런트가 그대로 받는 형태다
   (`schemas/admin.VisitStats`).
"""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from app.domain.visits import korean_date, recent_dates
from app.repositories.visit import MemberVisits, VisitRepository

logger = logging.getLogger(__name__)

#: 추이 그래프가 보여주는 기간. 30일은 "이번 달 흐름" 을 한눈에 보는 관례적 폭이고,
#: 화면 한 줄에 막대 30개가 들어간다. 늘리려면 화면 폭을 함께 봐야 한다.
TREND_DAYS = 30

#: 회원 표의 한 페이지. `admin.list_users` 의 기본값(50)과 같다.
MEMBER_PAGE = 50


@dataclass(frozen=True)
class VisitSnapshot:
    """접속 통계 한 벌. 화면이 필요한 전부."""

    total_visitors: int
    total_visit_days: int
    anon_visitors: int
    member_visitors: int
    today_visitors: int
    #: KST 기준 오늘 (ISO). **함께 주는 이유는 검증이다** — 이 값이 UTC 날짜와
    #: 다르면 KST 환산이 살아 있다는 뜻이고, 같으면 의심할 근거가 된다
    today: str
    #: 최신이 먼저. 방문 0 인 날도 들어 있다
    daily: list[tuple[str, int]]
    members: list[MemberVisits]
    member_total: int
    generated_at: str


async def get_visit_snapshot(
    repo: VisitRepository,
    *,
    trend_days: int = TREND_DAYS,
    member_limit: int = MEMBER_PAGE,
    member_offset: int = 0,
) -> VisitSnapshot:
    """총·일일·추이·회원별을 한 번에.

    네 조회를 **순서대로** 한다. 병렬로 던지면 같은 세션을 공유하는
    `AsyncSession` 이 동시 실행을 허용하지 않아 터진다 — 관리자 화면은 호출
    빈도가 낮아 왕복 넷을 아낄 이유가 없다.
    """
    today = korean_date()
    axis = recent_dates(trend_days, today=today)

    totals = await repo.totals()
    today_visitors = await repo.visitors_on(today)
    by_day = await repo.daily(axis)
    members, member_total = await repo.members(member_limit, member_offset)

    return VisitSnapshot(
        total_visitors=totals.visitors,
        total_visit_days=totals.visit_days,
        anon_visitors=totals.anon_visitors,
        member_visitors=totals.member_visitors,
        today_visitors=today_visitors,
        today=today.isoformat(),
        # 축이 먼저고 값이 나중이다 — 빈 날은 0 으로 남는다.
        daily=[(day.isoformat(), by_day.get(day, 0)) for day in axis],
        members=members,
        member_total=member_total,
        generated_at=datetime.now(UTC).isoformat(),
    )
