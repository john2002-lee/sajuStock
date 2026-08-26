"""고아 정리 — **데이터를 지우는 코드**라 안전장치부터 검증한다.

관심종목·투자 성향은 소유자를 외래키가 아니라 문자열로 들고 있어(익명이 로그인보다
먼저 존재할 수 있어야 한다) `ON DELETE CASCADE` 가 해 줄 일을 아무도 안 한다. 이
서비스가 그 자리를 메우는데, 판단 근거가 틀리면 **남의 관심종목이 사라진다.**

그래서 여기서 가장 중요한 테스트는 "잘 지우는가" 가 아니라 **"안 지워야 할 때 안
지우는가"** 다.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.listed_company import ListedCompanyRepository
from app.repositories.watchlist import WatchlistRepository
from app.schemas.stock import ListedCompanyRecord
from app.services import orphan_service
from app.services.orphan_service import UsersTableUnavailable, sweep_orphans

_LIVE = "11111111-1111-1111-1111-111111111111"
_GONE = "22222222-2222-2222-2222-222222222222"


async def _make_users_table(session: AsyncSession, ids: list[str]) -> None:
    """NextAuth `users` 를 흉내 낸다. 실제 스키마는 alembic 이 만든다(b3f1c2d47a90).

    여기서는 `id` 하나면 충분하다 — 이 서비스가 보는 것이 그것뿐이다.
    """
    await session.execute(text("create table users (id text primary key)"))
    for user_id in ids:
        await session.execute(text("insert into users (id) values (:id)"), {"id": user_id})
    await session.commit()


@pytest.fixture
async def owned(db_session: AsyncSession) -> WatchlistRepository:
    """살아 있는 사용자 · 사라진 사용자 · 익명 — 셋의 관심종목을 깔아 둔다."""
    await ListedCompanyRepository(db_session).upsert_many(
        [
            ListedCompanyRecord(symbol="005930.KS", name="삼성전자", market="유가"),
            ListedCompanyRecord(symbol="000660.KS", name="SK하이닉스", market="유가"),
        ]
    )

    repo = WatchlistRepository(db_session)
    await repo.add(f"user:{_LIVE}", "005930.KS", group="관찰")
    await repo.add(f"user:{_GONE}", "005930.KS", group="관찰")
    await repo.add("anon:browser-1", "000660.KS", group="관찰")
    return repo


# ── 안전장치 ────────────────────────────────────────────────────────────


async def test_missing_users_table_stops_everything(
    db_session: AsyncSession, owned: WatchlistRepository
) -> None:
    """`users` 를 못 읽으면 **아무것도 지우지 않는다.**

    행이 0개인 것과 테이블이 없는 것은 완전히 다르다. 후자를 "사용자가 하나도 없다"
    로 읽으면 모든 `user:` 행이 고아가 되어 전부 사라진다 — NextAuth 마이그레이션이
    아직 안 돌았거나 백엔드가 엉뚱한 DB 를 보고 있을 때 스크립트를 한 번 돌리는 것으로
    충분하다.

    아래 조회가 이 테스트의 절반이다. Postgres 는 실패한 문장 하나가 트랜잭션 전체를
    중단시키므로, `users` 탐침이 세이브포인트 안에서 돌지 않으면 **거부한 뒤 세션이
    죽는다.** 그러면 "아무것도 안 했다" 를 확인할 방법조차 없다.
    """
    with pytest.raises(UsersTableUnavailable):
        await sweep_orphans(db_session, apply=True)

    # 한 건도 안 지워졌고, 세션은 계속 쓸 수 있다.
    assert len(await WatchlistRepository(db_session).list_for_owner(f"user:{_GONE}")) == 1


async def test_dry_run_is_the_default(
    db_session: AsyncSession, owned: WatchlistRepository
) -> None:
    """되돌릴 수 없는 일이라 숫자를 먼저 보여 주고 끝난다."""
    await _make_users_table(db_session, [_LIVE])

    report = await sweep_orphans(db_session)

    assert report.applied is False
    assert report.counts["watchlist_items"] == 1
    # 세어만 봤을 뿐 그대로 있다.
    assert len(await owned.list_for_owner(f"user:{_GONE}")) == 1


async def test_anonymous_rows_are_never_orphans(
    db_session: AsyncSession, owned: WatchlistRepository
) -> None:
    """익명 행은 대응하는 사용자가 **원래** 없다.

    `user:` 접두사로 거르지 않으면 로그인 전 사용자의 목록이 통째로 사라진다 —
    이 서비스가 저지를 수 있는 가장 나쁜 실수다.
    """
    await _make_users_table(db_session, [_LIVE])

    await sweep_orphans(db_session, apply=True)

    assert len(await owned.list_for_owner("anon:browser-1")) == 1


async def test_live_user_is_untouched(
    db_session: AsyncSession, owned: WatchlistRepository
) -> None:
    await _make_users_table(db_session, [_LIVE])

    await sweep_orphans(db_session, apply=True)

    assert len(await owned.list_for_owner(f"user:{_LIVE}")) == 1


# ── 실제 정리 ───────────────────────────────────────────────────────────


async def test_apply_removes_rows_of_deleted_users(
    db_session: AsyncSession, owned: WatchlistRepository
) -> None:
    await _make_users_table(db_session, [_LIVE])

    report = await sweep_orphans(db_session, apply=True)

    assert report.applied is True
    assert report.total == 1
    assert await owned.list_for_owner(f"user:{_GONE}") == []


async def test_empty_users_table_means_every_account_row_is_orphan(
    db_session: AsyncSession, owned: WatchlistRepository
) -> None:
    """행이 0개인 것은 판단 **가능한** 상태다 — 아직 아무도 가입하지 않았다는 뜻이고,
    그러면 `user:` 행은 전부 진짜 고아다. 테이블 부재와 구분되는 지점."""
    await _make_users_table(db_session, [])

    report = await sweep_orphans(db_session, apply=True)

    assert report.counts["watchlist_items"] == 2
    assert len(await owned.list_for_owner("anon:browser-1")) == 1  # 익명은 그대로


async def test_nothing_to_do_is_not_an_error(db_session: AsyncSession) -> None:
    await _make_users_table(db_session, [_LIVE])

    report = await sweep_orphans(db_session, apply=True)

    assert report.total == 0


async def test_investor_profiles_are_swept_too(db_session: AsyncSession) -> None:
    """관심종목만 치우면 성향 프로파일이 남는다 — 같은 규칙을 쓰는 테이블은 함께 본다."""
    await _make_users_table(db_session, [_LIVE])
    assert "investor_profiles" in dict(orphan_service._OWNED_TABLES)

    report = await sweep_orphans(db_session)

    assert "investor_profiles" in report.counts
