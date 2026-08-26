"""Postgres 방언 회귀 — SQL 의 **모양**을 데이터와 무관하게 고정한다.

원래 이 파일은 하네스가 인메모리 SQLite 로 돌던 시절, 운영 DB 의 SQL 을 검사할
유일한 방법이었다. 그때 이렇게 새어 나간 버그가 있었다:

    ORDER BY market_cap DESC

SQLite 는 NULL 을 가장 작은 값으로 보므로 시총 미수집 종목이 뒤로 밀린다.
Postgres 는 `DESC` 의 기본이 `NULLS FIRST` 라 **맨 앞을 채운다.** 등락률 랭킹의
모집단 200종목이 시총 없는 종목으로 채워졌는데, 오류가 나지 않아 조용했다.

지금은 하네스가 진짜 Postgres 로 돈다(`conftest`). 그래도 이 파일이 남는 이유는
**검사하는 대상이 다르기** 때문이다. 실행하는 테스트는 그 순간 테이블에 NULL 이
들어 있어야만 정렬 실수를 잡는다 — 픽스처가 값을 다 채우도록 바뀌면 조용히 눈이
먼다. 여기서는 쿼리를 실행하지 않고 **Postgres 방언으로 컴파일만 해서** `NULLS
LAST` 가 SQL 에 있는지 본다. 데이터가 무엇이든 결과가 같다.

아래쪽 `_nullable_columns` 규칙 검사도 같은 취지다 — 한 쿼리를 고치는 것이 아니라
"NULL 가능 컬럼으로 정렬하면 NULLS 위치를 명시한다" 는 규칙 자체를 강제한다.
"""

import re
from datetime import date

import pytest
from sqlalchemy import or_, select
from sqlalchemy.dialects import postgresql

from app.models.listed_company import ListedCompany
from app.schemas.market import ScreenerQuery


def _pg_sql(stmt) -> str:
    return str(stmt.compile(dialect=postgresql.dialect()))


def test_market_cap_ranking_puts_nulls_last_on_postgres() -> None:
    """`top_by_market_cap` 의 정렬이 NULLS LAST 를 명시하는지.

    리포지토리의 쿼리와 같은 형태를 여기서 다시 만들지 않고, 실제 메서드가 만드는
    SQL 을 봐야 의미가 있다 — 아래 `test_repository_query_is_the_one_checked` 가
    그 연결을 지킨다.
    """
    stmt = (
        select(ListedCompany)
        .where(or_(ListedCompany.symbol.like("%.KS"), ListedCompany.symbol.like("%.KQ")))
        .order_by(ListedCompany.market_cap.desc().nullslast(), ListedCompany.symbol)
    )

    assert "DESC NULLS LAST" in _pg_sql(stmt)


async def test_repository_query_is_the_one_checked(repo, monkeypatch) -> None:
    """리포지토리가 **실제로** 내보내는 SQL 에 NULLS LAST 가 있는지 가로채 확인한다.

    위 테스트만 있으면 리포지토리에서 `nullslast()` 를 지워도 초록이다 — 검사 대상이
    테스트 안에서 다시 만든 쿼리이기 때문이다. 여기서는 실행 직전의 statement 를
    붙잡아 그 구멍을 막는다.
    """
    captured: list[str] = []
    original = repo._db.execute

    async def spy(stmt, *args, **kwargs):
        captured.append(_pg_sql(stmt))
        return await original(stmt, *args, **kwargs)

    monkeypatch.setattr(repo._db, "execute", spy)
    await repo.top_by_market_cap(limit=5)

    assert captured, "쿼리가 실행되지 않았다"
    assert "DESC NULLS LAST" in captured[0], (
        f"top_by_market_cap 이 NULLS LAST 없이 정렬한다 — Postgres 에서 시총 "
        f"미수집 종목이 랭킹 앞을 채운다.\n{captured[0]}"
    )


@pytest.mark.parametrize(
    "url",
    [
        "sqlite+aiosqlite:///./stock.db",
        "sqlite:///:memory:",
        "mysql+aiomysql://u:p@h/db",
    ],
)
def test_non_postgres_database_url_is_rejected_by_settings(url: str) -> None:
    """설정이 Postgres 아닌 주소를 **기동 시점에** 막는지.

    이 자물쇠가 SQLite 를 코드베이스 밖에 붙들어 두는 장치다. 하네스에서 폴백을
    걷어내는 것만으로는 부족하다 — `.env` 에 `sqlite://` 한 줄이면 되돌아온다.
    조용히 받아 주면 앱은 뜨고 방언 차이만 런타임에 흩어져 나타난다.
    """
    from app.core.config import Settings

    with pytest.raises(ValueError, match="Postgres"):
        Settings(database_url=url)


def test_postgres_database_url_is_accepted() -> None:
    from app.core.config import Settings

    url = "postgresql://u:p@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
    assert Settings(database_url=url).database_url == url


# ── NULL 정렬 규칙 — 한 곳이 아니라 규칙으로 ────────────────────────────


def _nullable_columns() -> set[str]:
    """모델이 선언한 nullable 컬럼 전부. `table.column` 형태."""
    from app.models.base import Base

    return {
        f"{table.name}.{column.name}"
        for table in Base.metadata.tables.values()
        for column in table.columns
        if column.nullable
    }


def null_ordering_violations(sql: str) -> list[str]:
    """`ORDER BY <nullable> DESC` 인데 NULLS 를 안 적은 자리를 찾는다.

    **한 쿼리를 고치는 것으로는 부족하다.** `nullslast()` 를 빠뜨리는 것은 실수이지
    설계가 아니고, 다음에 정렬을 추가하는 사람이 또 빠뜨린다. 그래서 개별 쿼리가
    아니라 **규칙**을 검사한다.

    NOT NULL 컬럼은 대상이 아니다 — 거기서는 NULLS 절이 뜻이 없고, 굳이 적으라고
    하면 잡음만 늘어 진짜 위반이 묻힌다.
    """
    nullable = _nullable_columns()
    violations = []
    for match in re.finditer(r"(\w+\.\w+)\s+DESC\b(?!\s+NULLS)", sql, re.IGNORECASE):
        if match.group(1).lower() in nullable:
            violations.append(match.group(1))
    return violations


def test_the_rule_catches_a_bare_desc() -> None:
    """검사기 자체가 동작하는지. 안 잡는 검사기는 없는 것과 같다."""
    bad = "SELECT x FROM listed_companies ORDER BY listed_companies.market_cap DESC"
    good = bad + " NULLS LAST"

    assert null_ordering_violations(bad) == ["listed_companies.market_cap"]
    assert null_ordering_violations(good) == []


def test_not_null_columns_are_not_flagged() -> None:
    """`symbol` 은 NOT NULL 이라 NULLS 절이 뜻이 없다."""
    sql = "SELECT x FROM listed_companies ORDER BY listed_companies.symbol DESC"

    assert null_ordering_violations(sql) == []


async def test_no_repository_query_orders_nullable_desc_without_nulls(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """**리포지토리가 실제로 내보내는 모든 쿼리**를 규칙에 걸어 본다.

    13회차에 `top_by_market_cap` 하나가 걸렸는데, 그때 주석은 "SQLite 는 NULL 을 가장
    작은 값으로 본다" 며 근거까지 정확히 적혀 있었다 — 코드가 틀린 게 아니라 **전제가
    바뀐** 것이라 리뷰로는 안 잡힌다. 그런 것은 규칙으로 막아야 한다.
    """
    from app.repositories.investor_profile import InvestorProfileRepository
    from app.repositories.listed_company import ListedCompanyRepository
    from app.repositories.watchlist import WatchlistRepository

    captured: list[str] = []
    original = db_session.execute

    async def spy(stmt, *args, **kwargs):
        try:
            captured.append(_pg_sql(stmt))
        except Exception:  # noqa: BLE001 - 원시 SQL 은 컴파일 대상이 아니다
            pass
        return await original(stmt, *args, **kwargs)

    monkeypatch.setattr(db_session, "execute", spy)

    listings = ListedCompanyRepository(db_session)
    watch = WatchlistRepository(db_session)
    profiles = InvestorProfileRepository(db_session)

    # 읽기 경로를 한 번씩 태운다. 결과는 안 본다 — 여기서 보는 것은 **SQL 의 모양**이다.
    await listings.top_by_market_cap(limit=5)
    await listings.symbols_without_market_cap(limit=5)
    await listings.find_by_code("005930")
    await listings.find_by_symbols(["005930.KS"])
    await listings.find_candidates("삼성", "ㅅㅅ", 50)
    await listings.count()
    await listings.latest_market_cap_update()
    # 오늘의 일정(P1). 새 읽기 경로를 여기 추가하지 않으면 그 쿼리는 이 규칙 **밖**이다 —
    # 규칙으로 막는다는 말이 목록을 갱신한다는 뜻이기도 하다.
    await listings.symbols_for_calendar_refresh(limit=5)
    await listings.latest_calendar_update()
    await listings.calendar_coverage()
    await listings.upcoming_calendar("next_earnings_date", date(2026, 8, 7), date(2026, 8, 14), 5)
    await listings.count_upcoming_calendar("ex_dividend_date", date(2026, 8, 7), date(2026, 8, 14))
    # 스크리너(P2). 정렬 축이 다섯이라 **하나만 태우면 나머지 넷은 규칙 밖**이다 —
    # 축을 추가하면서 `nullslast()` 를 빠뜨리는 것이 정확히 이 검사가 노리는 실수다.
    for axis in ("market_cap", "per", "pbr", "dividend_yield", "roe"):
        await listings.screen(ScreenerQuery(sort=axis), limit=5, offset=0)
    await listings.count_screened(ScreenerQuery(per_max=15))
    await listings.screener_coverage()
    await listings.latest_fundamentals_update()
    await watch.list_for_owner("anon:x")
    await watch.find_by_code("anon:x", "005930")
    await watch.count_for_owner("anon:x")
    await profiles.get("anon:x")

    assert captured, "쿼리가 하나도 잡히지 않았다 — 스파이가 안 걸렸다"

    offenders = {
        column for sql in captured for column in null_ordering_violations(sql)
    }
    assert not offenders, (
        f"nullable 컬럼을 NULLS 절 없이 DESC 정렬한다: {sorted(offenders)}\n"
        "Postgres 는 DESC 의 기본이 NULLS FIRST 라 빈 값이 앞을 채운다. "
        "`.desc().nullslast()` 를 쓴다."
    )
