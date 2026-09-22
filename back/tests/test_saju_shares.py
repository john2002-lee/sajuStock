"""사주 결과 공유 링크 — 좁히기 · 만료 · 공개 조회.

이 표는 무료 경로의 **"아무것도 저장하지 않는다" 를 의도적으로 깬 첫 표**다
(`models/saju_share.py` 모듈 주석). 그래서 이 파일이 지키는 것은 넷이다.

  ① **좁혀서 저장하는가** — 생년월일시·양력 환산일·보정 분값·출생지가 응답에도
     표에도 없어야 한다. 이 기능을 티저 수준으로 제한한 이유가 그것이다.
  ② **7일이 지나면 열리지 않는가** — 그리고 **삭제와 무관하게** 그런가. 이 저장소에
     크론이 없으므로, 만료가 조회 쿼리에 있지 않으면 보관 기간은 문서일 뿐이다.
  ③ 공유 조회가 **소유자를 묻지 않는가** — 링크가 곧 열쇠다.
  ④ 발급이 `BirthInput` 검증을 **재사용하는가** — 결과가 아니라 생년월일시를
     받기로 한 판단의 값어치가 이것이다.
"""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.saju_share import SajuShareRow
from app.repositories.saju_share import SajuShareRepository

#: 1990-05-12 07:30, 남성, 서울. 여덟 글자가 나오는 입력이다.
_BIRTH = {
    "year": 1990,
    "month": 5,
    "day": 12,
    "hour": 7,
    "minute": 30,
    "is_lunar": False,
    "is_leap_month": False,
    "gender": "M",
    "birth_place_code": "SEOUL",
}


@pytest.fixture
def shares(db_session: AsyncSession) -> SajuShareRepository:
    return SajuShareRepository(db_session)


async def _mint(client: AsyncClient, **over) -> str:
    birth = {**_BIRTH, **over}
    res = await client.post("/api/v1/saju/shares", json={"birth": birth})
    assert res.status_code == 201, res.text
    return res.json()["share_id"]


# --- ① 좁혀서 저장하는가 ---------------------------------------------------


@pytest.mark.asyncio
async def test_shared_response_carries_no_birth_data(client: AsyncClient) -> None:
    """응답에 생년월일시로 이어지는 칸이 하나도 없어야 한다.

    `solar_date` 한 칸이 곧 생년월일이고, 진태양시 보정 분값의 조합은 출생지를
    좁힌다. 유료 리포트(`/saju/reports/{token}`)는 그 값들을 내려주므로, 그 토큰을
    공유용으로 쓰지 않기로 한 판단이 여기서 지켜진다.
    """
    share_id = await _mint(client)

    res = await client.get(f"/api/v1/saju/shares/{share_id}")
    assert res.status_code == 200
    body = res.json()

    assert set(body) == {
        "pillars_hangul",
        "day_master_hangul",
        "visible_wuxing",
        "strength_verdict",
        "summary",
        "created_at",
        "retention_days",
    }
    # 값으로도 새지 않는지 — 키 검사만으로는 중첩된 것을 못 잡는다.
    raw = res.text
    for leaked in ("solar_date", "1990-05-12", "birth_place", "SEOUL", "conventions"):
        assert leaked not in raw, f"{leaked} 가 공유 응답에 실렸다"


@pytest.mark.asyncio
async def test_row_stores_only_the_projection(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """표에 들어간 컬럼도 투영뿐인지. 응답 스키마만 좁히면 DB 에는 남을 수 있다."""
    share_id = await _mint(client)

    row = (
        await db_session.execute(
            select(SajuShareRow).where(SajuShareRow.share_id == share_id)
        )
    ).scalar_one()

    assert len(row.pillars_hangul) == 4
    assert row.day_master_hangul
    assert row.summary
    # 모델에 아예 없어야 하는 것들.
    for absent in ("solar_date", "birth", "birth_place_code", "markdown", "char_count"):
        assert not hasattr(row, absent), f"{absent} 컬럼이 생겼다"


@pytest.mark.asyncio
async def test_time_unknown_yields_three_pillars(client: AsyncClient) -> None:
    """시각을 모르면 기둥이 셋이다. 네 번째 자리에 빈 값이 들어가서는 안 된다."""
    share_id = await _mint(client, hour=None, minute=None)

    body = (await client.get(f"/api/v1/saju/shares/{share_id}")).json()
    assert len(body["pillars_hangul"]) == 3
    assert all(body["pillars_hangul"])


# --- ② 만료 ----------------------------------------------------------------


@pytest.mark.asyncio
async def test_expired_link_returns_404_without_any_delete(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """**이 파일에서 가장 중요한 테스트다.**

    행을 지우지 않고 `created_at` 만 보관 기간 밖으로 되돌린 뒤 404 를 확인한다.
    통과한다는 것은 만료가 **조회 쿼리에 있다**는 뜻이고, 그래야 정리 스크립트를
    아무도 돌리지 않는 배포에서도 7일이 실제로 7일이 된다.
    """
    share_id = await _mint(client)

    row = (
        await db_session.execute(
            select(SajuShareRow).where(SajuShareRow.share_id == share_id)
        )
    ).scalar_one()
    row.created_at = datetime.now(UTC) - timedelta(
        days=settings.saju_share_retention_days + 1
    )
    await db_session.commit()

    res = await client.get(f"/api/v1/saju/shares/{share_id}")
    assert res.status_code == 404

    # 행은 여전히 살아 있다 — 만료가 삭제와 독립임을 못박는다.
    still_there = (
        await db_session.execute(
            select(SajuShareRow).where(SajuShareRow.share_id == share_id)
        )
    ).scalar_one_or_none()
    assert still_there is not None


@pytest.mark.asyncio
async def test_link_inside_the_window_still_opens(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """경계 안쪽은 열려야 한다. 만료 조건이 뒤집혀 있으면 이쪽이 깨진다."""
    share_id = await _mint(client)

    row = (
        await db_session.execute(
            select(SajuShareRow).where(SajuShareRow.share_id == share_id)
        )
    ).scalar_one()
    row.created_at = datetime.now(UTC) - timedelta(
        days=settings.saju_share_retention_days - 1
    )
    await db_session.commit()

    assert (await client.get(f"/api/v1/saju/shares/{share_id}")).status_code == 200


@pytest.mark.asyncio
async def test_prune_removes_expired_and_spares_fresh(
    client: AsyncClient, db_session: AsyncSession, shares: SajuShareRepository
) -> None:
    fresh = await _mint(client)
    stale = await _mint(client, year=1988)

    row = (
        await db_session.execute(
            select(SajuShareRow).where(SajuShareRow.share_id == stale)
        )
    ).scalar_one()
    row.created_at = datetime.now(UTC) - timedelta(
        days=settings.saju_share_retention_days + 3
    )
    await db_session.commit()

    assert await shares.count_expired() == 1
    assert await shares.prune_expired() == 1
    await db_session.commit()

    remaining = set(
        (await db_session.execute(select(SajuShareRow.share_id))).scalars().all()
    )
    assert stale not in remaining
    assert fresh in remaining


# --- ③ 공개 조회 ------------------------------------------------------------


@pytest.mark.asyncio
async def test_shared_lookup_needs_no_owner(client: AsyncClient) -> None:
    """소유자 헤더 없이 열린다. `/saju/*` 전체가 그렇다 — 무료 경로에 계정이 없다."""
    share_id = await _mint(client)

    res = await client.get(f"/api/v1/saju/shares/{share_id}")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_unknown_id_is_404(client: AsyncClient) -> None:
    res = await client.get("/api/v1/saju/shares/definitely-not-a-real-share-id")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_each_mint_is_a_new_id_and_both_stay_alive(client: AsyncClient) -> None:
    """같은 사주를 두 번 공유하면 링크가 둘 생기고 **둘 다 산다.**

    지문으로 합치지 않기로 한 판단을 못박는 테스트다 — 생년월일시의 경우 수는
    전수 대조가 가능한 크기라, 지문은 곧 생년월일시다
    (`SajuShareRepository.create` 주석).
    """
    first = await _mint(client)
    second = await _mint(client)

    assert first != second
    assert (await client.get(f"/api/v1/saju/shares/{first}")).status_code == 200
    assert (await client.get(f"/api/v1/saju/shares/{second}")).status_code == 200


# --- ④ 입력 검증 재사용 -----------------------------------------------------


@pytest.mark.asyncio
async def test_birth_validation_is_reused(client: AsyncClient) -> None:
    """`BirthInput` 의 검증이 그대로 걸린다. 결과를 받지 않기로 한 값어치가 이것이다."""
    res = await client.post(
        "/api/v1/saju/shares", json={"birth": {**_BIRTH, "year": 1900}}
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_unknown_birth_place_is_rejected(client: AsyncClient) -> None:
    res = await client.post(
        "/api/v1/saju/shares", json={"birth": {**_BIRTH, "birth_place_code": "atlantis"}}
    )
    assert res.status_code == 422
