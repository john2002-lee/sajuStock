"""FastAPI 애플리케이션 조립. 라우팅·설정·수명주기만 담당한다."""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import create_all, dispose_engine
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.core.vector_database import dispose_vector_engine
from app.integrations.llm import close_client
from app.repositories.listed_company import ListedCompanyRepository
from app.services import listed_company_service, market_service

logger = logging.getLogger(__name__)


async def _warm_up() -> None:
    """상장사 목록을 채우고 등락률 스냅샷을 미리 만든다.

    기동을 막지 않는 배경 작업이다. 이걸 안 하면 첫 사용자가 대신 기다린다 —
    검색은 KRX 수집(수 초)을, 홈은 등락률 스캔(약 7초)을 각각 첫 요청에서 만난다.
    상세 화면은 목록이 비면 `.KS`/`.KQ` 추측 경로로 내려가 엉뚱한 종목을 보여줄
    수도 있다 (`listed_company_service.resolve_listing`).

    실패해도 서비스는 정상으로 뜬다. 각 경로에 이미 지연 배너·예시 데이터·
    재시도가 있고, 기동이 외부 API 사정에 묶이면 그게 더 나쁘다.
    """
    from app.core.database import AsyncSessionLocal

    try:
        if settings.seed_listed_companies_on_startup:
            async with AsyncSessionLocal() as session:
                await listed_company_service.ensure_seeded(ListedCompanyRepository(session))

        # 목록이 있어야 스캔 모집단(시총 상위)을 뽑을 수 있으므로 순서가 있다.
        if settings.warm_market_movers_on_startup:
            async with AsyncSessionLocal() as session:
                await market_service.refresh_movers(ListedCompanyRepository(session))
    except asyncio.CancelledError:
        raise
    except Exception:  # noqa: BLE001 - 워밍업 실패로 서버가 못 뜨면 안 된다
        logger.exception("기동 워밍업 실패 — 첫 요청 때 각자 다시 시도합니다")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    if settings.db_create_all_on_startup:
        # 켜져 있다는 사실 자체가 경고다. 기본값은 False 이고(`core/config` 주석),
        # 이 경로는 alembic 을 아직 돌리지 않은 개발 DB 를 위한 것이다 —
        # 이미 마이그레이션이 관리하는 DB 면 `create_all` 이 기동을 거부한다.
        logger.warning(
            "DB_CREATE_ALL_ON_STARTUP 이 켜져 있습니다 — 스키마를 모델에서 직접 만듭니다. "
            "운영에서는 끄고 `alembic upgrade head` 를 쓰세요"
        )
        await create_all()
    logger.info("%s 시작 (model=%s)", settings.app_name, settings.gemini_model)

    # 조용히 열려 있는 것이 가장 나쁘다 — 자물쇠가 꺼져 있으면 매 기동마다 말한다.
    if not settings.advice_auth_enabled:
        logger.warning(
            "ADVICE_API_KEY 가 없어 AI 판단 엔드포인트가 공개 상태입니다 — "
            "외부에 노출하면 누구나 LLM 토큰을 태울 수 있습니다"
        )

    # 자격증명이 `.env` 에 있는데도 조용히 폴백으로 내려가던 것이 이 설정을 한동안
    # 무력화했다. 꺼져 있으면 매 기동마다 말한다 — 느려지는 것은 괜찮지만 모르는
    # 채로 느려지는 것은 아니다.
    if not settings.krx_bulk_enabled:
        logger.info(
            "KRX_ID / KRX_PW 가 없어 시가총액을 yfinance 폴백으로 채웁니다 "
            "(종목당 1회 · 1회 실행 %d종목) — 전 종목은 며칠에 걸쳐 채워집니다",
            settings.market_cap_batch_limit,
        )

    warm_up = asyncio.create_task(_warm_up())

    yield

    # 아직 도는 중이면 접는다 — 종료를 외부 API 응답만큼 기다릴 이유가 없다.
    warm_up.cancel()
    await close_client()
    await dispose_engine()
    await dispose_vector_engine()
    logger.info("%s 종료", settings.app_name)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)
    app.include_router(api_router, prefix=settings.api_v1_prefix)

    @app.get("/health", tags=["meta"], summary="헬스체크")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
