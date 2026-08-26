"""오늘의 일정 — 실적발표 · 배당락 (P1). **조회만 한다.**

값을 채우는 배치는 `snapshot_service` 가 소유한다. 일정과 스크리너 지표가 같은
`get_info()` 응답에서 나오므로 배치는 하나이고, 이 파일과 `screener_service` 는 그
하나가 적재한 것을 각자의 방식으로 읽는 **독자**다.

## 왜 미리 적재하나

yfinance 는 종목당 1회 호출(~0.5초)이라 "이번 주에 실적발표가 있는 종목" 을 요청
시점에 찾으려면 전 종목(2,700+)을 훑어야 한다. 답이 나올 무렵이면 사용자는 이미
떠났다. 미리 적재해 두면 그 질문이 인덱스를 타는 SQL 한 번이 된다
(`models/listed_company.py` 주석).
"""

import logging
from datetime import UTC, date, datetime, timedelta

from app.domain.symbols import board_of
from app.integrations.yfinance.calendar import KST
from app.repositories.listed_company import ListedCompanyRepository
from app.schemas.market import CalendarEvent, CalendarKind, MarketCalendar

logger = logging.getLogger(__name__)

#: 응답의 `kind` → 저장 컬럼. 리포지토리가 이 문자열만 받는다.
_COLUMNS: dict[CalendarKind, str] = {
    "earnings": "next_earnings_date",
    "ex_dividend": "ex_dividend_date",
}


def _event(company, kind: CalendarKind, value: date, today: date) -> CalendarEvent:
    return CalendarEvent(
        name=company.name,
        symbol=company.symbol,
        code=company.symbol.split(".", 1)[0],
        board=board_of(company.symbol),
        kind=kind,
        date=value.isoformat(),
        d_day=(value - today).days,
        market_cap=company.market_cap,
    )


async def get_calendar(
    repo: ListedCompanyRepository,
    *,
    kind: CalendarKind | None = None,
    days: int = 7,
    limit: int = 20,
    today: date | None = None,
) -> MarketCalendar:
    """오늘부터 `days` 일 안의 일정. `kind` 가 없으면 둘 다 섞어 날짜순으로 낸다.

    `today` 를 주입받는 것은 테스트 때문이다 — 실제 날짜에 의존하면 그 테스트는
    내일 빨개진다. 기본값은 **KST 기준 오늘**이다: 사용자도 종목도 한국에 있는데
    서버가 UTC 면 자정 근처에서 하루가 밀린다.
    """
    reference = today or datetime.now(KST).date()
    end = reference + timedelta(days=days)
    kinds: tuple[CalendarKind, ...] = (kind,) if kind else ("earnings", "ex_dividend")

    events: list[CalendarEvent] = []
    total = 0
    for target in kinds:
        column = _COLUMNS[target]
        total += await repo.count_upcoming_calendar(column, reference, end)
        # 종류별로 limit 만큼 가져와 합친 뒤 다시 자른다. 한쪽이 창을 독차지해도
        # 다른 쪽이 사라지지 않게 하려면 각자 뽑아야 한다.
        for company in await repo.upcoming_calendar(column, reference, end, limit):
            value = getattr(company, column)
            if value is not None:
                events.append(_event(company, target, value, reference))

    # 날짜 오름차순 → 같은 날은 시총 큰 순. 이 목록의 축은 종목이 아니라 날짜다.
    events.sort(key=lambda item: (item.date, -(item.market_cap or 0)))

    covered, universe = await repo.calendar_coverage()
    latest = await repo.latest_calendar_update()

    return MarketCalendar(
        as_of=latest.astimezone(KST).date().isoformat() if latest else None,
        days=days,
        total=total,
        events=events[:limit],
        covered=covered,
        universe_size=universe,
        updated_at=datetime.now(UTC).isoformat(timespec="seconds"),
    )
