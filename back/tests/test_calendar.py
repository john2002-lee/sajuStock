"""오늘의 일정 — 실적발표 · 배당락 (P1). **날짜 규칙과 조회.**

값을 채우는 배치는 `test_snapshot.py` 가 지킨다. 일정과 스크리너 지표를 한 배치가
함께 적재하게 되면서 그쪽으로 옮겼고, 여기에는 이 기능이 소유한 둘만 남는다.

1. **날짜 추출 규칙** — `earningsTimestamp`(직전)와 `earningsTimestampStart`(다음)를
   헷갈리면 '오늘의 일정' 이 과거를 가리킨다. 오류가 안 나고 그냥 틀린다.
2. **조회** — 창 밖 일정이 새지 않는가, 정렬 축이 (종목이 아니라) 날짜인가.

`today` 를 주입해 실제 날짜에 의존하지 않는다. 그러지 않으면 이 파일은 내일 빨개진다.
"""

from datetime import date, datetime

import pytest

from app.integrations.yfinance.calendar import KST, extract_calendar_dates
from app.repositories.listed_company import ListedCompanyRepository
from app.schemas.stock import CalendarDates, ListedCompanyRecord
from app.services import calendar_service, snapshot_service

_TODAY = date(2026, 8, 7)


class _Ticker:
    """`ticker.calendar` 만 흉내 내는 스텁. 네트워크는 타지 않는다."""

    def __init__(self, calendar: dict | None = None) -> None:
        self._calendar = calendar

    @property
    def calendar(self):
        if self._calendar is None:
            raise RuntimeError("calendar 없음")
        return self._calendar


# ── 날짜 추출 규칙 ────────────────────────────────────────────────────────


def test_next_earnings_comes_from_timestamp_start_not_timestamp() -> None:
    """`earningsTimestamp` 는 **직전** 발표일이다 — 그걸 쓰면 일정이 과거를 가리킨다.

    실측값을 그대로 쓴다: 005930.KS 가 2026-08-04 시점에 직전 2026-07-29,
    다음 2026-10-28 이었다.
    """
    info = {
        "earningsTimestamp": 1785283200,  # 2026-07-29 (직전)
        "earningsTimestampStart": 1793142000,  # 2026-10-28 (다음)
    }

    _, next_earnings = extract_calendar_dates(_Ticker(), info)

    assert next_earnings == "2026-10-28"


def test_ex_dividend_is_read_as_utc() -> None:
    """`exDividendDate` 의 원본 epoch 는 UTC 자정 정각이다 (1782691200 / 86400 = 20633.0)."""
    _ex, _ = extract_calendar_dates(_Ticker(), {"exDividendDate": 1782691200})

    assert _ex == "2026-06-29"


def test_calendar_is_only_a_fallback() -> None:
    """info 에 값이 있으면 `ticker.calendar` 를 보지 않는다.

    폴백은 하루가 밀릴 수 있다(yfinance 가 naive `fromtimestamp` 를 쓴다). 그래서
    1차는 항상 원본 epoch 여야 하고, 이 테스트는 그 우선순위를 고정한다.
    """
    ticker = _Ticker({"Earnings Date": [date(2999, 1, 1)]})
    info = {"earningsTimestampStart": 1793142000}

    _, next_earnings = extract_calendar_dates(ticker, info)

    assert next_earnings == "2026-10-28"


def test_missing_dates_do_not_raise() -> None:
    """일정이 없는 종목이 다수다 — 그것은 실패가 아니라 사실이다."""
    assert extract_calendar_dates(_Ticker(), {}) == (None, None)


# ── 조회 ──────────────────────────────────────────────────────────────────


@pytest.fixture
async def seeded(db_session) -> ListedCompanyRepository:
    repo = ListedCompanyRepository(db_session)
    await repo.upsert_many(
        [
            ListedCompanyRecord(symbol="005930.KS", name="삼성전자", market="유가"),
            ListedCompanyRecord(symbol="000660.KS", name="SK하이닉스", market="유가"),
            ListedCompanyRecord(symbol="247540.KQ", name="에코프로비엠", market="코스닥"),
        ]
    )
    await repo.update_market_caps({"005930": 400_000_000, "000660": 200_000_000})
    return repo


async def test_unknown_column_is_rejected(seeded) -> None:
    """컬럼 이름을 문자열로 받되 SQL 에 그대로 넣지 않는다."""
    with pytest.raises(ValueError, match="일정 컬럼"):
        await seeded.upcoming_calendar("market_cap; drop table", _TODAY, _TODAY, 1)


async def _fill(repo: ListedCompanyRepository) -> None:
    await repo.update_snapshots(
        {
            # 같은 날 두 종목 — 시총 큰 쪽이 먼저여야 한다.
            "000660.KS": CalendarDates(next_earnings_date="2026-08-11"),
            "005930.KS": CalendarDates(
                next_earnings_date="2026-08-11", ex_dividend_date="2026-08-09"
            ),
            # 창(7일) 밖.
            "247540.KQ": CalendarDates(next_earnings_date="2026-09-30"),
        },
        {},
        ["005930.KS", "000660.KS", "247540.KQ"],
    )


async def test_calendar_is_sorted_by_date_then_size(seeded) -> None:
    """이 목록의 축은 종목이 아니라 **날짜**다."""
    await _fill(seeded)

    result = await calendar_service.get_calendar(seeded, days=7, limit=20, today=_TODAY)

    assert [(e.date, e.code, e.kind) for e in result.events] == [
        ("2026-08-09", "005930", "ex_dividend"),
        ("2026-08-11", "005930", "earnings"),  # 같은 날은 시총 큰 순
        ("2026-08-11", "000660", "earnings"),
    ]


async def test_events_outside_the_window_are_excluded(seeded) -> None:
    """창 밖(9/30)은 안 나온다. 지난 일정도 마찬가지다 — 오늘이 하한이다."""
    await _fill(seeded)

    result = await calendar_service.get_calendar(seeded, days=7, limit=20, today=_TODAY)

    assert "247540" not in {event.code for event in result.events}
    assert all(event.d_day >= 0 for event in result.events)


async def test_one_symbol_can_produce_two_rows(seeded) -> None:
    """실적발표와 배당락이 같은 기간에 있으면 **줄이 둘**이다.

    한 줄에 합치면 날짜순 정렬이 불가능해진다 (`schemas/market.CalendarEvent` 주석).
    """
    await _fill(seeded)

    result = await calendar_service.get_calendar(seeded, days=7, limit=20, today=_TODAY)

    assert [e.kind for e in result.events if e.code == "005930"] == ["ex_dividend", "earnings"]


async def test_kind_filter_narrows_to_one(seeded) -> None:
    await _fill(seeded)

    result = await calendar_service.get_calendar(
        seeded, kind="ex_dividend", days=7, limit=20, today=_TODAY
    )

    assert {e.kind for e in result.events} == {"ex_dividend"}


async def test_d_day_counts_from_the_given_today(seeded) -> None:
    await _fill(seeded)

    result = await calendar_service.get_calendar(seeded, days=7, limit=20, today=_TODAY)

    assert {e.date: e.d_day for e in result.events} == {"2026-08-09": 2, "2026-08-11": 4}


async def test_coverage_reports_batch_progress(seeded) -> None:
    """빈 목록이 '데이터 없음'인지 '아직 채우는 중'인지 호출부가 구분할 근거."""
    before = await calendar_service.get_calendar(seeded, days=7, limit=20, today=_TODAY)
    assert (before.covered, before.universe_size) == (0, 3)

    await _fill(seeded)

    after = await calendar_service.get_calendar(seeded, days=7, limit=20, today=_TODAY)
    assert (after.covered, after.universe_size) == (3, 3)


async def test_as_of_reflects_the_batch_not_the_request(seeded) -> None:
    """`updated_at` 은 응답 시각, `as_of` 는 **배치가 마지막으로 돈 날**이다.

    둘을 합치면 값이 며칠 스테일해도 최신처럼 보인다. 그래서 배치가 한 번도 안 돌면
    `as_of` 는 None 이어야 하고, 그때도 `updated_at` 은 채워져 있어야 한다.
    """
    empty = await calendar_service.get_calendar(seeded, days=7, limit=20, today=_TODAY)
    assert empty.as_of is None
    assert empty.updated_at

    await _fill(seeded)

    filled = await calendar_service.get_calendar(seeded, days=7, limit=20, today=_TODAY)
    # 배치가 방금 돌았으므로 KST 기준 **오늘**이다 — `today` 인자에서 오는 값이 아니다.
    # (그 인자는 조회 창의 기준이지 데이터의 신선도가 아니다. 둘이 같은 날일 수도
    # 있으므로 "다르다" 로는 검증할 수 없고, 출처가 배치 타임스탬프임을 직접 본다.)
    assert filled.as_of == datetime.now(KST).date().isoformat()


# ── 엔드포인트 ─────────────────────────────────────────────────────────────


async def test_endpoint_returns_empty_calendar_without_data(client, monkeypatch) -> None:
    """배치가 안 돌았어도 200 이다. 빈 목록은 오류가 아니다."""
    monkeypatch.setattr(snapshot_service, "schedule_snapshot_refresh", lambda: None)

    response = await client.get("/api/v1/markets/calendar")

    assert response.status_code == 200
    body = response.json()
    assert body["events"] == []
    assert body["days"] == 7


async def test_endpoint_never_triggers_a_live_fetch(client, monkeypatch) -> None:
    """요청이 수집(수십 초)을 기다리지 않는다 — 배경 배치로만 던진다."""
    scheduled: list[bool] = []
    monkeypatch.setattr(
        snapshot_service, "schedule_snapshot_refresh", lambda: scheduled.append(True)
    )

    await client.get("/api/v1/markets/calendar?days=3&limit=5")

    assert scheduled == [True]
