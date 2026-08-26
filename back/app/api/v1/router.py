"""v1 라우터 통합."""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin,
    advice_verdicts,
    markets,
    profile,
    saju,
    stocks,
    watchlist,
)

api_router = APIRouter()
api_router.include_router(stocks.router)
# 판단을 **만드는** 문(/stocks/advice)과 **보관하는** 문을 나눠 둔다 —
# 앞은 LLM 4회가 나가는 무거운 경로고 여기는 평범한 CRUD 다
# (endpoints/advice_verdicts.py 모듈 주석).
api_router.include_router(advice_verdicts.router)
api_router.include_router(markets.router)
api_router.include_router(watchlist.router)
api_router.include_router(profile.router)
# 사주 라우터는 **아무것도 저장하지 않는다** — 소유자 헤더도 받지 않는다
# (endpoints/saju.py 모듈 주석). 저장은 사용자가 보정을 끝낸 뒤 `/profile` 이 받는다.
api_router.include_router(saju.router)
# 관리자 라우터는 **전체가 X-Admin-Key 로 잠겨 있다** (endpoints/admin.py 모듈 주석).
api_router.include_router(admin.router)
