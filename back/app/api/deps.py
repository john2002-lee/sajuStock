"""공용 의존성. 엔드포인트는 여기 있는 Annotated 별칭만 쓴다."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_advice_key
from app.core.database import get_db
from app.repositories.advice_verdict import AdviceVerdictRepository
from app.repositories.batch_run import BatchRunRepository
from app.repositories.investor_profile import InvestorProfileRepository
from app.repositories.listed_company import ListedCompanyRepository
from app.repositories.saju_order import SajuOrderRepository
from app.repositories.watchlist import WatchlistRepository

DbSession = Annotated[AsyncSession, Depends(get_db)]


def get_batch_run_repository(db: DbSession) -> BatchRunRepository:
    return BatchRunRepository(db)


BatchRunRepo = Annotated[BatchRunRepository, Depends(get_batch_run_repository)]


def get_listed_company_repository(db: DbSession) -> ListedCompanyRepository:
    return ListedCompanyRepository(db)


ListedCompanyRepo = Annotated[ListedCompanyRepository, Depends(get_listed_company_repository)]


def get_watchlist_repository(db: DbSession) -> WatchlistRepository:
    return WatchlistRepository(db)


WatchlistRepo = Annotated[WatchlistRepository, Depends(get_watchlist_repository)]


def get_investor_profile_repository(db: DbSession) -> InvestorProfileRepository:
    return InvestorProfileRepository(db)


InvestorProfileRepo = Annotated[InvestorProfileRepository, Depends(get_investor_profile_repository)]


def get_advice_verdict_repository(db: DbSession) -> AdviceVerdictRepository:
    return AdviceVerdictRepository(db)


AdviceVerdictRepo = Annotated[
    AdviceVerdictRepository, Depends(get_advice_verdict_repository)
]


async def get_owner_key(
    x_owner_key: str | None = Header(
        default=None,
        alias="X-Owner-Key",
        description="관심종목 소유자. 프런트 BFF 가 httpOnly 쿠키에서 옮겨 붙인다.",
    ),
) -> str:
    """관심종목의 소유자 식별자.

    **인증이 아니라 식별이다.** 남의 키를 알면 그 목록을 볼 수 있다 — 로그인이
    붙기 전까지의 한계이고, 그래서 이 값은 브라우저가 만들지 않고 서버가 발급한
    추측 불가능한 난수다(프런트 `lib/watchlist/owner.ts`).

    없으면 400 이다. 빈 문자열이나 고정값으로 떨어뜨리면 **모든 익명 사용자가 하나의
    목록을 공유**하게 되는데, 그건 비어 보이는 것보다 훨씬 나쁘다.
    """
    key = (x_owner_key or "").strip()
    if not key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "소유자 식별자(X-Owner-Key)가 필요합니다")
    if len(key) > 80:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "소유자 식별자가 너무 깁니다")
    return key


OwnerKey = Annotated[str, Depends(get_owner_key)]


async def get_optional_owner_key(
    x_owner_key: str | None = Header(
        default=None,
        alias="X-Owner-Key",
        description="있으면 그 소유자의 투자 성향으로 판단을 개인화한다.",
    ),
) -> str | None:
    """소유자를 **선택적으로** 읽는다. 없으면 None 이고 그것은 오류가 아니다.

    AI 판단 경로가 쓴다. 여기서 `get_owner_key` 를 그대로 붙였다면 헤더 없는 기존
    호출이 전부 400 이 된다 — 개인화는 얹는 기능이지 전제 조건이 아니고, 로그인하지
    않은 사람도 시장 판단은 그대로 받아야 한다.
    """
    key = (x_owner_key or "").strip()
    if not key or len(key) > 80:
        return None
    return key


OptionalOwnerKey = Annotated[str | None, Depends(get_optional_owner_key)]

# 토큰을 쓰는 엔드포인트에만 붙인다 (app/api/auth.py 주석).
# 값을 쓰지 않는 의존성이라 `dependencies=[...]` 가 아니라 별칭으로 둔 것은,
# 엔드포인트 시그니처만 봐도 잠겨 있다는 게 보이게 하기 위함이다.
AdviceKeyGuard = Annotated[None, Depends(require_advice_key)]


def get_saju_order_repository(db: DbSession) -> SajuOrderRepository:
    return SajuOrderRepository(db)


SajuOrderRepo = Annotated[SajuOrderRepository, Depends(get_saju_order_repository)]
