"""관심종목이 **요청이 끝난 뒤에도 남아 있는가.**

## 왜 별도 파일인가

`test_watchlist.py` 는 픽스처가 준 세션 하나를 계속 쓴다. 그 안에서는 `flush()` 든
`commit()` 이든 똑같이 보이므로, 커밋을 빠뜨려도 전부 초록이다. 실제로 그랬다 —
저장소 계약 테스트 18개가 통과하는 동안 운영 경로는 매 요청 조용히 롤백하고 있었다
(`core/database.get_db` 는 커밋하지 않고 세션을 닫는다).

화면에는 저장된 것처럼 보이고 새로고침하면 사라지는 종류라, 테스트가 아니면
"가끔 안 되는 것 같다"로만 보고된다.

그래서 여기서는 **세션을 두 개 연다.** 첫 세션이 쓰고 닫은 뒤, 두 번째 세션이 같은
DB 를 다시 열어 읽는다.

## 왜 `db_session` 을 쓰지 않는가

그 픽스처는 바깥 트랜잭션을 열어 두고 테스트가 끝나면 롤백한다. 여기서 확인하려는
것이 정확히 "커밋이 실제로 됐는가" 라, 롤백으로 감싸면 검증하려던 것이 사라진다.
그래서 이 파일만 **진짜로 커밋하고**, 남긴 행을 픽스처가 직접 지운다.
"""

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.repositories.listed_company import ListedCompanyRepository
from app.repositories.watchlist import WatchlistRepository
from app.schemas.market import MoversScan
from app.schemas.stock import ListedCompanyRecord
from app.schemas.watchlist import WatchlistItemPatch
from app.services import watchlist_service

_OWNER = "anon:persist"
_SYMBOLS = ("005930.KS", "000660.KS")


@pytest.fixture(autouse=True)
def no_quotes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        watchlist_service,
        "scan_movers",
        lambda universe, *, universe_label: MoversScan(universe_label=universe_label),
    )
    watchlist_service._quote_cache.clear()


async def _clear(engine) -> None:
    """이 파일이 남긴 행을 지운다.

    앞뒤로 모두 부른다 — 앞선 실행이 중간에 죽었으면 행이 남아 있고, 그러면 다음
    실행이 "이미 담겨 있다" 는 이유로 엉뚱하게 통과하거나 실패한다.
    """
    async with engine.begin() as conn:
        await conn.execute(
            text("delete from watchlist_items where owner_key = :owner"), {"owner": _OWNER}
        )
        await conn.execute(
            text("delete from listed_companies where symbol = any(:symbols)"),
            {"symbols": list(_SYMBOLS)},
        )


@pytest_asyncio.fixture(loop_scope="session")
async def sessions(pg_engine):
    """같은 DB 를 보는 세션 팩토리. 커밋이 살아 있어야 요청 경계를 흉내 낼 수 있다."""
    await _clear(pg_engine)
    yield async_sessionmaker(pg_engine, expire_on_commit=False)
    await _clear(pg_engine)


async def _seed(factory) -> None:
    async with factory() as session:
        await ListedCompanyRepository(session).upsert_many(
            [
                ListedCompanyRecord(symbol="005930.KS", name="삼성전자", market="유가"),
                ListedCompanyRecord(symbol="000660.KS", name="SK하이닉스", market="유가"),
            ]
        )


async def test_added_item_survives_the_session(sessions) -> None:
    """담은 종목이 다음 요청에도 있어야 한다. 이것이 실제로 깨졌던 경우다."""
    await _seed(sessions)

    async with sessions() as session:
        await watchlist_service.add_item(
            WatchlistRepository(session),
            ListedCompanyRepository(session),
            _OWNER,
            symbol="005930",
        )

    async with sessions() as session:  # 새 요청
        result = await watchlist_service.get_watchlist(
            WatchlistRepository(session), ListedCompanyRepository(session), _OWNER
        )

    assert [row.code for row in result.items] == ["005930"]


async def test_patch_survives_the_session(sessions) -> None:
    """그룹·알림·보유 수정도 마찬가지다.

    서비스가 ORM 객체를 고치는 방식이라 리포지토리를 거치지 않는다 — 저장 확정을
    잊기 가장 쉬운 자리다.
    """
    await _seed(sessions)

    async with sessions() as session:
        repo = WatchlistRepository(session)
        await watchlist_service.add_item(
            repo, ListedCompanyRepository(session), _OWNER, symbol="005930"
        )
        await watchlist_service.patch_item(
            repo,
            _OWNER,
            "005930",
            WatchlistItemPatch.model_validate(
                {"group": "코어", "holding": {"quantity": 10, "avg_price": 60_000}}
            ),
        )

    async with sessions() as session:
        result = await watchlist_service.get_watchlist(
            WatchlistRepository(session), ListedCompanyRepository(session), _OWNER
        )

    assert result.items[0].group == "코어"
    assert result.items[0].holding is not None
    assert result.items[0].holding.quantity == 10


async def test_reorder_survives_the_session(sessions) -> None:
    await _seed(sessions)

    async with sessions() as session:
        repo = WatchlistRepository(session)
        listings = ListedCompanyRepository(session)
        await watchlist_service.add_item(repo, listings, _OWNER, symbol="005930")
        await watchlist_service.add_item(repo, listings, _OWNER, symbol="000660")
        await repo.reorder(_OWNER, ["000660", "005930"])

    async with sessions() as session:
        result = await watchlist_service.get_watchlist(
            WatchlistRepository(session), ListedCompanyRepository(session), _OWNER
        )

    assert [row.code for row in result.items] == ["000660", "005930"]


async def test_removal_survives_the_session(sessions) -> None:
    await _seed(sessions)

    async with sessions() as session:
        repo = WatchlistRepository(session)
        await watchlist_service.add_item(
            repo, ListedCompanyRepository(session), _OWNER, symbol="005930"
        )
        await repo.remove_by_code(_OWNER, "005930")

    async with sessions() as session:
        result = await watchlist_service.get_watchlist(
            WatchlistRepository(session), ListedCompanyRepository(session), _OWNER
        )

    assert result.items == []
