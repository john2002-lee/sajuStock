"""관심종목 엔드포인트 (신규 저장소).

라우터는 파라미터 수신과 서비스 호출만 한다 — 비즈니스 로직은 서비스 계층에 있다.

## 소유자를 헤더로 받는 이유

`X-Owner-Key` 헤더 하나가 소유자를 정한다. 프런트가 그 값을 만들어 붙이고, 브라우저는
이 헤더를 직접 만들지 않는다 — FastAPI 를 직접 부르지 않기 때문이다(CONVENTIONS).

값은 두 가지다.

    anon:<uuid>   로그인 전. 서버가 발급해 httpOnly 쿠키에 둔 익명 신원
    user:<uuid>   로그인 후. NextAuth 세션의 users.id

**엔드포인트는 둘을 구분하지 않는다.** 12회차에 로그인을 붙이면서 프런트의 소유자
해석만 바뀌었고 이 파일의 시그니처는 그대로였다 — 소유자를 외래키가 아니라 불투명한
문자열로 둔 9회차 설계가 값을 한 지점이다.

익명 단계는 **인증이 아니라 식별**이라는 한계가 남는다: 남의 `anon:` 키를 알면 그
목록을 볼 수 있다. 다만 그 값은 추측 불가능한 난수이고 httpOnly 쿠키에만 있다.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, status

from app.api.deps import ListedCompanyRepo, OwnerKey, WatchlistRepo
from app.schemas.watchlist import (
    Watchlist,
    WatchlistAddRequest,
    WatchlistClaimRequest,
    WatchlistItemPatch,
    WatchlistOrderRequest,
)
from app.services import watchlist_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/watchlist", tags=["watchlist"])

#: 행을 지목하는 6자리 종목 코드.
#:
#: **검증이 없으면 데이터가 지워진다.** `code` 는 저장소에서 심볼을 찾는 데 쓰이고,
#: 예전 구현은 그것을 `LIKE '{code}%'` 에 그대로 실었다 — `DELETE /watchlist/%` 가
#: 그 소유자의 임의의 한 종목을 지우고 200 을 돌려줬다(`repositories/watchlist.find_by_code`).
#: 저장소 쪽 LIKE 도 함께 없앴지만, 애초에 들어올 수 없게 하는 것이 첫 번째 방어선이다.
#:
#: 422 로 끊는다 — 6자리가 아닌 코드는 "그 종목이 목록에 없다" 가 아니라 **요청이
#: 잘못된 것**이다. 없는 종목을 지우라는 요청을 404 로 만들지 않는 판단(아래 주석)과
#: 다른 층이다.
StockCode = Annotated[str, Path(pattern=r"^\d{6}$", description="6자리 종목 코드")]


@router.get("", response_model=Watchlist, summary="관심종목 목록 (그룹·순서·시세 포함)")
async def get_watchlist(
    owner: OwnerKey, repo: WatchlistRepo, listings: ListedCompanyRepo
) -> Watchlist:
    return await watchlist_service.get_watchlist(repo, listings, owner)


@router.post("", response_model=Watchlist, summary="관심종목 추가")
async def add_watchlist_item(
    payload: WatchlistAddRequest,
    owner: OwnerKey,
    repo: WatchlistRepo,
    listings: ListedCompanyRepo,
) -> Watchlist:
    """추가 후 **목록 전체**를 돌려준다.

    추가된 한 건만 주면 화면이 그룹 집계·합계를 스스로 다시 계산해야 하고, 그 계산이
    서버와 어긋나는 순간 사용자는 새로고침해야만 맞는 숫자를 본다. 목록은 최대
    200행이라 통째로 주는 비용이 그 위험보다 싸다.
    """
    try:
        await watchlist_service.add_item(
            repo, listings, owner, symbol=payload.symbol, group=payload.group
        )
    except watchlist_service.UnknownSymbolError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except watchlist_service.WatchlistFullError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    return await watchlist_service.get_watchlist(repo, listings, owner)


@router.delete("/{code}", response_model=Watchlist, summary="관심종목 제거")
async def remove_watchlist_item(
    code: StockCode, owner: OwnerKey, repo: WatchlistRepo, listings: ListedCompanyRepo
) -> Watchlist:
    # 없는 것을 지우라는 요청을 404 로 만들지 않는다 — 결과 상태("그 종목은 목록에
    # 없다")가 요청자가 원한 그대로다. 연타·재시도가 오류로 보이면 안 된다.
    await repo.remove_by_code(owner, code)
    return await watchlist_service.get_watchlist(repo, listings, owner)


@router.put("/order", response_model=Watchlist, summary="관심종목 순서 변경")
async def reorder_watchlist(
    payload: WatchlistOrderRequest,
    owner: OwnerKey,
    repo: WatchlistRepo,
    listings: ListedCompanyRepo,
) -> Watchlist:
    await repo.reorder(owner, payload.codes)
    return await watchlist_service.get_watchlist(repo, listings, owner)


@router.post("/claim", response_model=Watchlist, summary="익명 목록을 계정으로 승계")
async def claim_watchlist(
    payload: WatchlistClaimRequest,
    owner: OwnerKey,
    repo: WatchlistRepo,
    listings: ListedCompanyRepo,
) -> Watchlist:
    """로그인 직후 한 번 부른다. 9회차에 만들어 둔 `transfer_owner` 의 유일한 호출부다.

    **자기 자신에게 옮기는 것은 막는다.** `from == to` 면 유니크 제약 때문에 아무것도
    안 옮겨지지만, 그 호출이 오는 것 자체가 배선이 잘못됐다는 신호라 400 으로 막아
    조용히 넘어가지 않게 한다.

    남의 익명 키를 알면 그 목록을 가져갈 수 있다는 것은 사실이다. 다만 그 키는 서버가
    발급한 추측 불가능한 난수이고 httpOnly 쿠키에만 있어, 알아내려면 이미 그 브라우저를
    쥐고 있어야 한다 — 로그인 전 단계의 한계이고 `X-Owner-Key` 주석과 같은 성격이다.
    """
    if payload.from_key == owner:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "같은 소유자에게는 승계할 수 없습니다"
        )

    moved = await repo.transfer_owner(payload.from_key, owner)
    if moved:
        logger.info("관심종목 %d건을 계정으로 승계했습니다", moved)

    return await watchlist_service.get_watchlist(repo, listings, owner)


@router.patch("/{code}", response_model=Watchlist, summary="그룹·알림·보유 수정")
async def patch_watchlist_item(
    code: StockCode,
    payload: WatchlistItemPatch,
    owner: OwnerKey,
    repo: WatchlistRepo,
    listings: ListedCompanyRepo,
) -> Watchlist:
    found = await watchlist_service.patch_item(repo, owner, code, payload)
    if not found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "관심종목에 없는 종목입니다")

    return await watchlist_service.get_watchlist(repo, listings, owner)
