"""투자 성향 프로파일 엔드포인트 (사주 통합 계획 5.2).

소유자는 관심종목과 같은 `X-Owner-Key` 헤더다 — `anon:<uuid>` 또는 `user:<uuid>`.
익명으로 온보딩을 끝내고 나중에 가입하면 `/profile/claim` 이 승계한다.

**이 엔드포인트는 사주를 모른다.** 받는 것은 0~100 숫자 6개와 표시용 문장 하나뿐이고,
그 숫자가 사주에서 왔는지 설문에서 왔는지는 `source` 가 말해 줄 뿐 처리는 같다.
사주 엔진 연동은 `integrations/saju/` 경계가 생긴 뒤 그쪽에서 이 PUT 을 부른다.
"""

import logging

from fastapi import APIRouter, HTTPException, status

from app.api.deps import InvestorProfileRepo, OwnerKey
from app.schemas.profile import InvestorProfile, InvestorProfileResponse
from app.schemas.watchlist import WatchlistClaimRequest
from app.services import profile_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=InvestorProfileResponse, summary="내 투자 성향 조회")
async def get_profile(owner: OwnerKey, repo: InvestorProfileRepo) -> InvestorProfileResponse:
    """아직 없으면 `profile: null` 로 200 이다 — 온보딩 전은 오류가 아니다."""
    return await profile_service.read(repo, owner)


@router.put("", response_model=InvestorProfileResponse, summary="투자 성향 저장·수정")
async def put_profile(
    payload: InvestorProfile, owner: OwnerKey, repo: InvestorProfileRepo
) -> InvestorProfileResponse:
    """온보딩 저장과 사용자 보정을 같은 PUT 으로 받는다.

    화면이 "이미 있는가"를 먼저 묻지 않아도 되고, 재시도가 중복 행을 만들지 않는다
    (`owner_key` 유니크 + upsert).
    """
    return await profile_service.save(repo, owner, payload)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT, summary="투자 성향 삭제")
async def delete_profile(owner: OwnerKey, repo: InvestorProfileRepo) -> None:
    # 없는 것을 지우라는 요청도 성공이다 — 결과 상태가 요청자가 원한 그대로다.
    await repo.delete(owner)


@router.post(
    "/claim", response_model=InvestorProfileResponse, summary="익명 프로파일을 계정으로 승계"
)
async def claim_profile(
    payload: WatchlistClaimRequest, owner: OwnerKey, repo: InvestorProfileRepo
) -> InvestorProfileResponse:
    """로그인 직후 관심종목 승계와 나란히 부른다.

    요청 본문을 관심종목과 공유하는 이유: 실을 것이 `from_key` 하나로 같고, 프런트가
    두 승계를 같은 값으로 잇달아 부른다. 형태가 갈라지면 한쪽만 고치는 실수가 난다.
    """
    if payload.from_key == owner:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "같은 소유자에게는 승계할 수 없습니다")

    if await repo.transfer_owner(payload.from_key, owner):
        logger.info("투자 성향 프로파일을 계정으로 승계했습니다")

    return await profile_service.read(repo, owner)
