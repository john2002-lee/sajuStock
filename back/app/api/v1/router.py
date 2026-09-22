"""v1 라우터 통합."""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin,
    advice_verdicts,
    markets,
    profile,
    saju,
    saju_shares,
    stocks,
    visits,
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
# 접속 기록은 **일반 사용자 경로**다 — 모든 방문자가 부르고 관리자 키가 없다.
# 조회(`GET /admin/visits`)만 아래 관리자 라우터에 있다 (endpoints/visits.py 주석).
api_router.include_router(visits.router)
# 사주 라우터는 **아무것도 저장하지 않는다** — 소유자 헤더도 받지 않는다
# (endpoints/saju.py 모듈 주석). 저장은 사용자가 보정을 끝낸 뒤 `/profile` 이 받는다.
api_router.include_router(saju.router)
# **위 문장의 유일한 예외다.** 결과 공유 링크는 여덟 글자와 무료 요약을 7일간
# 저장한다 — 공유 버튼을 누른 사람의 것만, 그때만. 무료 경로의 "저장하지 않는다"
# 를 의도적으로 깨는 자리라 같은 파일에 두지 않았다
# (endpoints/saju_shares.py · models/saju_share.py 모듈 주석).
api_router.include_router(saju_shares.router)
# 관리자 라우터는 **전체가 X-Admin-Key 로 잠겨 있다** (endpoints/admin.py 모듈 주석).
api_router.include_router(admin.router)
