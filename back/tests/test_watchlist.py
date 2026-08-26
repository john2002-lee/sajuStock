"""관심종목 저장소 — 이 프로젝트에서 처음으로 **사용자가 소유하는** 데이터.

지금까지의 테이블은 전부 우리가 외부에서 수집해 온 것이라 "누구 것인가"를 틀릴 수가
없었다. 여기서는 그게 틀리면 **남의 목록이 보인다.** 그래서 소유자 격리가 이 파일의
첫 번째 관심사다.

시세(yfinance)는 전부 대역으로 세운다 — 저장소 계약을 확인하는 데 네트워크가 낄
이유가 없고, 상류가 막혔을 때도 목록은 나와야 한다는 것 자체가 검증 대상이다.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.listed_company import ListedCompanyRepository
from app.repositories.watchlist import WatchlistRepository
from app.schemas.market import MoverRow, MoversScan
from app.schemas.stock import ListedCompanyRecord
from app.schemas.watchlist import WatchlistItemPatch
from app.services import watchlist_service
from app.utils.text import get_initial_consonants

_SEED = [
    ("005930.KS", "삼성전자", "유가"),
    ("000660.KS", "SK하이닉스", "유가"),
    ("247540.KQ", "에코프로비엠", "코스닥"),
]

_ALICE = "anon:alice"
_BOB = "anon:bob"


@pytest.fixture(autouse=True)
def no_quotes(monkeypatch: pytest.MonkeyPatch) -> None:
    """yfinance 벌크 다운로드를 막고 고정 시세를 준다."""

    def fake_scan(universe, *, universe_label: str) -> MoversScan:
        return MoversScan(
            universe_label=universe_label,
            rows=[
                MoverRow(
                    name=record.name,
                    symbol=record.symbol,
                    code=record.symbol.split(".", 1)[0],
                    market=record.market,
                    price=70_000.0,
                    change_percent=1.5,
                    spark=[69_000.0, 70_000.0],
                )
                for record in universe
            ],
        )

    monkeypatch.setattr(watchlist_service, "scan_movers", fake_scan)
    # 심볼 조합을 키로 쓰는 모듈 전역 캐시 — 테스트 사이로 새면 앞 테스트의 시세가
    # 뒤 테스트에 그대로 나온다.
    watchlist_service._quote_cache.clear()


@pytest.fixture
async def seeded(db_session: AsyncSession) -> ListedCompanyRepository:
    repo = ListedCompanyRepository(db_session)
    await repo.upsert_many(
        [
            ListedCompanyRecord(
                symbol=symbol,
                name=name,
                market=market,
                initial_consonants=get_initial_consonants(name),
            )
            for symbol, name, market in _SEED
        ]
    )
    return repo


@pytest.fixture
def watch(db_session: AsyncSession) -> WatchlistRepository:
    return WatchlistRepository(db_session)


# ── 소유자 격리 ─────────────────────────────────────────────────────────


async def test_owners_do_not_see_each_others_items(
    watch: WatchlistRepository, seeded: ListedCompanyRepository
) -> None:
    """가장 중요한 계약. 이게 깨지면 남의 관심종목이 보인다."""
    await watchlist_service.add_item(watch, seeded, _ALICE, symbol="005930")
    await watchlist_service.add_item(watch, seeded, _BOB, symbol="000660")

    alice = await watchlist_service.get_watchlist(watch, seeded, _ALICE)
    bob = await watchlist_service.get_watchlist(watch, seeded, _BOB)

    assert [row.code for row in alice.items] == ["005930"]
    assert [row.code for row in bob.items] == ["000660"]


async def test_unknown_owner_gets_an_empty_list_not_an_error(
    watch: WatchlistRepository, seeded: ListedCompanyRepository
) -> None:
    result = await watchlist_service.get_watchlist(watch, seeded, "anon:nobody")

    assert result.items == []
    assert result.total_count == 0


# ── 담기 ────────────────────────────────────────────────────────────────


async def test_add_resolves_six_digit_code_to_krx_symbol(
    watch: WatchlistRepository, seeded: ListedCompanyRepository
) -> None:
    """코드만 받아도 접미사를 확정해 저장한다.

    6자리만 저장하면 나중에 시세를 부를 때 `.KS`/`.KQ` 를 추측해야 하는데, 야후는
    틀린 접미사에도 **다른 종목의 시세**를 돌려준다.
    """
    await watchlist_service.add_item(watch, seeded, _ALICE, symbol="247540")

    item = await watch.find_by_code(_ALICE, "247540")
    assert item is not None
    assert item.symbol == "247540.KQ"


async def test_adding_twice_is_not_an_error(
    watch: WatchlistRepository, seeded: ListedCompanyRepository
) -> None:
    """검색 팔레트의 ⇥ 는 연타되기 쉽다. '이미 담겨 있다'는 실패가 아니라 원하는 상태다."""
    assert await watchlist_service.add_item(watch, seeded, _ALICE, symbol="005930") is True
    assert await watchlist_service.add_item(watch, seeded, _ALICE, symbol="005930") is False

    result = await watchlist_service.get_watchlist(watch, seeded, _ALICE)
    assert len(result.items) == 1


async def test_unknown_symbol_is_rejected(
    watch: WatchlistRepository, seeded: ListedCompanyRepository
) -> None:
    with pytest.raises(watchlist_service.UnknownSymbolError):
        await watchlist_service.add_item(watch, seeded, _ALICE, symbol="999999")


async def test_owner_cap_stops_unbounded_growth(
    watch: WatchlistRepository, seeded: ListedCompanyRepository, monkeypatch
) -> None:
    """상한이 없으면 목록 크기만큼 시세를 끌어오다 상류가 먼저 죽는다."""
    monkeypatch.setattr(watchlist_service, "MAX_ITEMS_PER_OWNER", 2)

    await watchlist_service.add_item(watch, seeded, _ALICE, symbol="005930")
    await watchlist_service.add_item(watch, seeded, _ALICE, symbol="000660")

    with pytest.raises(watchlist_service.WatchlistFullError):
        await watchlist_service.add_item(watch, seeded, _ALICE, symbol="247540")


async def test_cap_does_not_block_re_adding_an_existing_item(
    watch: WatchlistRepository, seeded: ListedCompanyRepository, monkeypatch
) -> None:
    """상한에 닿았어도 **이미 담긴** 종목을 다시 누르면 실패하면 안 된다.

    사용자는 아무것도 바꾸지 않았는데 오류를 보게 된다.
    """
    monkeypatch.setattr(watchlist_service, "MAX_ITEMS_PER_OWNER", 1)
    await watchlist_service.add_item(watch, seeded, _ALICE, symbol="005930")

    assert await watchlist_service.add_item(watch, seeded, _ALICE, symbol="005930") is False


# ── 순서 ────────────────────────────────────────────────────────────────


async def test_reorder_applies_the_given_order(
    watch: WatchlistRepository, seeded: ListedCompanyRepository
) -> None:
    for code in ("005930", "000660", "247540"):
        await watchlist_service.add_item(watch, seeded, _ALICE, symbol=code)

    await watch.reorder(_ALICE, ["247540", "005930", "000660"])

    result = await watchlist_service.get_watchlist(watch, seeded, _ALICE)
    assert [row.code for row in result.items] == ["247540", "005930", "000660"]


async def test_partial_reorder_does_not_drop_missing_items(
    watch: WatchlistRepository, seeded: ListedCompanyRepository
) -> None:
    """그룹 탭으로 일부만 보고 있을 때 그 일부만 보내와도 나머지가 사라지면 안 된다.

    순서 변경이 조용한 삭제가 되는 것이 이 화면에서 가장 나쁜 실패다.
    """
    for code in ("005930", "000660", "247540"):
        await watchlist_service.add_item(watch, seeded, _ALICE, symbol=code)

    await watch.reorder(_ALICE, ["247540"])

    result = await watchlist_service.get_watchlist(watch, seeded, _ALICE)
    assert result.items[0].code == "247540"
    assert len(result.items) == 3


# ── 부분 수정 ───────────────────────────────────────────────────────────


async def test_patching_group_keeps_holding(
    watch: WatchlistRepository, seeded: ListedCompanyRepository
) -> None:
    """보내지 않은 필드는 건드리지 않는다.

    `model_fields_set` 없이 짜면 그룹만 바꾸려는 요청이 보유 정보를 조용히 지운다 —
    사용자가 입력한 평단이 사라지는 종류의 버그다.
    """
    await watchlist_service.add_item(watch, seeded, _ALICE, symbol="005930")
    await watchlist_service.patch_item(
        watch,
        _ALICE,
        "005930",
        WatchlistItemPatch.model_validate({"holding": {"quantity": 10, "avg_price": 60_000}}),
    )

    await watchlist_service.patch_item(
        watch, _ALICE, "005930", WatchlistItemPatch.model_validate({"group": "코어"})
    )

    result = await watchlist_service.get_watchlist(watch, seeded, _ALICE)
    assert result.items[0].group == "코어"
    assert result.items[0].holding is not None
    assert result.items[0].holding.quantity == 10


async def test_explicit_null_holding_clears_it(
    watch: WatchlistRepository, seeded: ListedCompanyRepository
) -> None:
    """명시적 null 은 '해제' 다 — 미전송과 구분된다."""
    await watchlist_service.add_item(watch, seeded, _ALICE, symbol="005930")
    await watchlist_service.patch_item(
        watch,
        _ALICE,
        "005930",
        WatchlistItemPatch.model_validate({"holding": {"quantity": 10, "avg_price": 60_000}}),
    )

    await watchlist_service.patch_item(
        watch, _ALICE, "005930", WatchlistItemPatch.model_validate({"holding": None})
    )

    result = await watchlist_service.get_watchlist(watch, seeded, _ALICE)
    assert result.items[0].holding is None


# ── 집계 ────────────────────────────────────────────────────────────────


async def test_total_return_is_value_weighted(
    watch: WatchlistRepository, seeded: ListedCompanyRepository
) -> None:
    """평가손익 합계는 금액 가중이다.

    종목별 수익률을 단순 평균하면 100원짜리 1주와 10만원짜리 100주가 같은 무게가 되어
    합계가 실제 손익과 어긋난다.
    """
    await watchlist_service.add_item(watch, seeded, _ALICE, symbol="005930")
    await watchlist_service.add_item(watch, seeded, _ALICE, symbol="000660")
    # 대역 시세는 둘 다 70,000원이다.
    await watchlist_service.patch_item(
        watch,
        _ALICE,
        "005930",
        WatchlistItemPatch.model_validate({"holding": {"quantity": 100, "avg_price": 35_000}}),
    )  # +100%, 원가 3,500,000
    await watchlist_service.patch_item(
        watch,
        _ALICE,
        "000660",
        WatchlistItemPatch.model_validate({"holding": {"quantity": 1, "avg_price": 70_000}}),
    )  # 0%, 원가 70,000

    result = await watchlist_service.get_watchlist(watch, seeded, _ALICE)

    # 금액 가중: (7,070,000 - 3,570,000) / 3,570,000 ≈ 98.04%
    # 단순 평균이면 50% 가 나온다.
    assert result.total_return_percent == pytest.approx(98.04, abs=0.01)


async def test_groups_and_alert_counts(
    watch: WatchlistRepository, seeded: ListedCompanyRepository
) -> None:
    await watchlist_service.add_item(watch, seeded, _ALICE, symbol="005930", group="코어")
    await watchlist_service.add_item(watch, seeded, _ALICE, symbol="000660", group="코어")
    await watchlist_service.add_item(watch, seeded, _ALICE, symbol="247540")
    await watchlist_service.patch_item(
        watch,
        _ALICE,
        "005930",
        WatchlistItemPatch.model_validate({"alert": {"enabled": True, "condition": "7만원"}}),
    )

    result = await watchlist_service.get_watchlist(watch, seeded, _ALICE)

    assert result.total_count == 3
    assert result.group_count == 2
    assert result.active_alerts == 1
    assert sorted((g.name, g.count) for g in result.groups) == [("관찰", 1), ("코어", 2)]


# ── 상류 장애 ───────────────────────────────────────────────────────────


async def test_quote_failure_still_returns_the_list(
    watch: WatchlistRepository, seeded: ListedCompanyRepository, monkeypatch
) -> None:
    """시세가 죽어도 목록은 나와야 한다.

    그룹·보유·알림은 우리 저장소에 있다. 상류 하나 때문에 화면 전체가 비면,
    사용자는 자기가 담아 둔 것까지 잃은 것처럼 본다.
    """

    def exploding(universe, *, universe_label: str):
        raise RuntimeError("Too Many Requests. Rate limited.")

    await watchlist_service.add_item(watch, seeded, _ALICE, symbol="005930")
    monkeypatch.setattr(watchlist_service, "scan_movers", exploding)
    watchlist_service._quote_cache.clear()

    result = await watchlist_service.get_watchlist(watch, seeded, _ALICE)

    assert [row.code for row in result.items] == ["005930"]
    assert result.items[0].name == "삼성전자"  # 이름은 KRX 수집분이라 살아 있다
    assert result.items[0].price == 0.0
    assert result.items[0].spark == []


# ── 로그인 승계 ─────────────────────────────────────────────────────────


async def test_transfer_moves_anonymous_items_to_a_user(
    watch: WatchlistRepository, seeded: ListedCompanyRepository
) -> None:
    """로그인이 붙는 날 호출할 경로. 익명으로 모은 목록이 계정으로 승계된다.

    `owner_key` 를 `users.id` 외래키가 아니라 문자열로 둔 선택이 값을 하는 지점이다.
    """
    await watchlist_service.add_item(watch, seeded, _ALICE, symbol="005930")
    await watchlist_service.add_item(watch, seeded, _ALICE, symbol="000660")
    await watchlist_service.add_item(watch, seeded, "user:42", symbol="005930")

    moved = await watch.transfer_owner(_ALICE, "user:42")

    # 겹치는 005930 은 유니크 제약에 걸리므로 옮기지 않는다.
    assert moved == 1
    result = await watchlist_service.get_watchlist(watch, seeded, "user:42")
    assert sorted(row.code for row in result.items) == ["000660", "005930"]


# ── 엔드포인트 배선 ─────────────────────────────────────────────────────


async def test_endpoint_requires_owner_key(client: AsyncClient) -> None:
    """소유자 헤더가 없으면 400.

    빈 문자열이나 고정값으로 떨어뜨리면 **모든 익명 사용자가 하나의 목록을 공유**한다 —
    비어 보이는 것보다 훨씬 나쁘다.
    """
    response = await client.get("/api/v1/watchlist")

    assert response.status_code == 400


async def test_endpoint_round_trip(client: AsyncClient, seeded: ListedCompanyRepository) -> None:
    headers = {"X-Owner-Key": _ALICE}

    added = await client.post("/api/v1/watchlist", json={"symbol": "005930"}, headers=headers)
    assert added.status_code == 200
    # 추가 응답이 목록 전체다 — 화면이 집계를 스스로 다시 계산하지 않게 한다.
    assert [row["code"] for row in added.json()["items"]] == ["005930"]

    removed = await client.delete("/api/v1/watchlist/005930", headers=headers)
    assert removed.status_code == 200
    assert removed.json()["items"] == []


async def test_removing_a_missing_item_is_not_an_error(
    client: AsyncClient, seeded: ListedCompanyRepository
) -> None:
    """결과 상태가 요청자가 원한 그대로다 — 연타·재시도가 오류로 보이면 안 된다."""
    response = await client.delete(
        "/api/v1/watchlist/005930", headers={"X-Owner-Key": _ALICE}
    )

    assert response.status_code == 200


# ── 코드 파라미터 검증 (LIKE 와일드카드 결함) ───────────────────────────
#
# 예전 구현은 `symbol LIKE '{code}%'` 로 행을 찾았고 라우터는 code 를 검증하지 않았다.
# 그래서 `DELETE /watchlist/%` 가 그 소유자의 **전 행에 매치**되어(정렬 없는 first())
# 임의의 한 종목을 지우고 200 을 돌려줬다 — 오류 없이 남의 데이터가 사라지는 종류다.
#
# 테스트가 **응답 코드만 보지 않고 목록이 그대로인지 함께 확인한다.** 422 만 단언하면
# 라우터 검증만 지켜지고, 저장소가 LIKE 로 되돌아가도 초록으로 남는다.


# `%` 는 `%25` 로 실어 보낸다. 날 `%` 는 URL 에서 이스케이프 시작 문자라, 그대로 두면
# 클라이언트가 어떻게 해석하는지가 이 테스트의 변수가 된다 — 검증하려는 것은 서버다.
@pytest.mark.parametrize("code", ["%25", "_", "0059_0", "005930%25", "%255930"])
async def test_wildcard_code_deletes_nothing(
    client: AsyncClient, seeded: ListedCompanyRepository, code: str
) -> None:
    headers = {"X-Owner-Key": _ALICE}
    for symbol in ("005930", "000660", "247540"):
        assert (
            await client.post("/api/v1/watchlist", json={"symbol": symbol}, headers=headers)
        ).status_code == 200

    response = await client.delete(f"/api/v1/watchlist/{code}", headers=headers)

    assert response.status_code == 422
    remaining = await client.get("/api/v1/watchlist", headers=headers)
    assert sorted(row["code"] for row in remaining.json()["items"]) == [
        "000660",
        "005930",
        "247540",
    ]


async def test_wildcard_code_patches_nothing(
    client: AsyncClient, seeded: ListedCompanyRepository
) -> None:
    """PATCH 도 같은 경로로 엉뚱한 종목의 그룹·알림·보유수량을 바꿀 수 있었다."""
    headers = {"X-Owner-Key": _ALICE}
    await client.post("/api/v1/watchlist", json={"symbol": "005930"}, headers=headers)

    response = await client.patch(
        "/api/v1/watchlist/_", json={"group": "탈취"}, headers=headers
    )

    assert response.status_code == 422
    listed = await client.get("/api/v1/watchlist", headers=headers)
    assert [row["group"] for row in listed.json()["items"]] != ["탈취"]


async def test_find_by_code_matches_the_exact_symbol_only(
    db_session: AsyncSession, seeded: ListedCompanyRepository
) -> None:
    """저장소도 스스로 안전해야 한다 — 라우터 검증에 기대지 않는다."""
    repo = WatchlistRepository(db_session)
    await repo.add(_ALICE, "005930.KS", group="기본")

    assert (await repo.find_by_code(_ALICE, "005930")) is not None
    assert (await repo.find_by_code(_ALICE, "%")) is None
    assert (await repo.find_by_code(_ALICE, "0059_0")) is None
    # 소유자 격리는 그대로다.
    assert (await repo.find_by_code(_BOB, "005930")) is None


# ── 로그인 승계 엔드포인트 (12회차) ─────────────────────────────────────


async def test_claim_moves_anonymous_items_to_the_account(
    client: AsyncClient, seeded: ListedCompanyRepository
) -> None:
    """로그인 직후 한 번 부르는 경로. 받는 쪽은 **헤더**이고 본문은 내놓는 쪽뿐이다.

    받는 쪽까지 본문으로 받으면 아무 계정으로나 옮길 수 있게 된다.
    """
    anon = {"X-Owner-Key": "anon:browser-1"}
    user = {"X-Owner-Key": "user:42"}

    await client.post("/api/v1/watchlist", json={"symbol": "005930"}, headers=anon)
    await client.post("/api/v1/watchlist", json={"symbol": "000660"}, headers=anon)

    claimed = await client.post(
        "/api/v1/watchlist/claim", json={"from_key": "anon:browser-1"}, headers=user
    )

    assert claimed.status_code == 200
    assert sorted(row["code"] for row in claimed.json()["items"]) == ["000660", "005930"]

    # **복사가 아니라 이동이다.** 익명 쪽에 남아 있으면 로그아웃 후 같은 목록이
    # 두 벌로 보이고, 한쪽을 고쳐도 다른 쪽은 그대로다.
    left = await client.get("/api/v1/watchlist", headers=anon)
    assert left.json()["items"] == []


async def test_claiming_to_self_is_rejected(
    client: AsyncClient, seeded: ListedCompanyRepository
) -> None:
    """유니크 제약 때문에 아무것도 안 옮겨지지만, 그 호출이 오는 것 자체가 배선이
    잘못됐다는 신호라 조용히 넘어가지 않게 막는다."""
    response = await client.post(
        "/api/v1/watchlist/claim",
        json={"from_key": _ALICE},
        headers={"X-Owner-Key": _ALICE},
    )

    assert response.status_code == 400


async def test_claim_keeps_items_the_account_already_had(
    client: AsyncClient, seeded: ListedCompanyRepository
) -> None:
    """계정에 이미 있는 종목은 유니크 제약에 걸린다 — 겹치지 않는 것만 옮긴다."""
    anon = {"X-Owner-Key": "anon:browser-2"}
    user = {"X-Owner-Key": "user:99"}

    await client.post("/api/v1/watchlist", json={"symbol": "005930"}, headers=anon)
    await client.post("/api/v1/watchlist", json={"symbol": "000660"}, headers=anon)
    await client.post("/api/v1/watchlist", json={"symbol": "005930"}, headers=user)

    claimed = await client.post(
        "/api/v1/watchlist/claim", json={"from_key": "anon:browser-2"}, headers=user
    )

    assert sorted(row["code"] for row in claimed.json()["items"]) == ["000660", "005930"]
    # 겹친 005930 은 익명 쪽에 그대로 남는다 — 옮길 수 없었다는 사실이 드러나야 한다.
    left = await client.get("/api/v1/watchlist", headers=anon)
    assert [row["code"] for row in left.json()["items"]] == ["005930"]
