"""종목 엔드포인트 (명세 6.2 / 6.3 / 6.4).

라우터는 파라미터 수신과 서비스 호출만 한다 — 비즈니스 로직은 서비스 계층에 있다.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

from app.api.deps import (
    AdviceKeyGuard,
    InvestorProfileRepo,
    ListedCompanyRepo,
    OptionalOwnerKey,
)
from app.api.sse import sse_with_heartbeat
from app.core.config import settings
from app.integrations import amplitude
from app.schemas.advice import StockAdviceRequest, StockAdviceResponse
from app.schemas.stock import (
    ListedCompaniesStatus,
    StockContent,
    StockFundamentals,
    StockHistory,
    StockHistoryParams,
    StockSuggestion,
)
from app.services import (
    advice_cache,
    advice_service,
    advice_stream,
    fundamentals_service,
    listed_company_service,
    profile_service,
    stock_service,
)

router = APIRouter(prefix="/stocks", tags=["stocks"])


@router.get("/history", response_model=StockHistory, summary="주가 히스토리 + 보조지표")
async def get_stock_history(
    repo: ListedCompanyRepo,
    symbol: Annotated[str, Query(min_length=1, max_length=80)],
    timeframe: Annotated[str, Query()] = "day",
    period: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 504,
    start_date: Annotated[date | None, Query()] = None,
    end_date: Annotated[date | None, Query()] = None,
    include_content: Annotated[
        bool,
        Query(
            description=(
                "뉴스·리포트를 함께 담을지. false면 응답이 20배 가까이 빨라진다"
                " (뉴스·리포트가 소요 시간의 약 95%). 차트만 먼저 그릴 때 쓴다."
            )
        ),
    ] = True,
) -> StockHistory:
    # 공급자를 부르기 전에 KRX 목록에서 심볼·상호를 확정한다. 6자리 코드만 넘기면
    # `.KS`/`.KQ` 를 추측하게 되는데, 야후는 틀린 접미사에도 응답을 준다 —
    # 247540(에코프로비엠, 코스닥)을 `.KS` 로 물으면 하루 늦은 시세와
    # `"247540.KS,0P0001GZPV,623889"` 라는 이름이 돌아온다.
    return await stock_service.get_history(
        StockHistoryParams(
            symbol=symbol,
            timeframe=timeframe,
            period=period,
            limit=limit,
            start_date=start_date,
            end_date=end_date,
        ),
        include_content=include_content,
        listing=await listed_company_service.resolve_listing(repo, symbol),
    )


@router.get("/content", response_model=StockContent, summary="종목 뉴스 · 애널리스트 리포트")
async def get_stock_content(
    symbol: Annotated[str, Query(min_length=1, max_length=80)],
) -> StockContent:
    """`/stocks/history` 응답의 `symbol`을 그대로 넘긴다 (이미 해석된 심볼)."""
    return await stock_service.get_content(symbol)


@router.get("/fundamentals", response_model=StockFundamentals, summary="재무 · 밸류에이션")
async def get_stock_fundamentals(
    symbol: Annotated[str, Query(min_length=1, max_length=80)],
) -> StockFundamentals:
    """`/stocks/history` 응답의 `symbol`을 그대로 넘긴다 (이미 해석된 심볼).

    항목별 실패는 `null`로 흡수한다 — 전 필드가 `null`이어도 200이다.
    종목당 캐시가 있어 두 번째 호출부터는 즉시 응답한다.
    """
    return await fundamentals_service.get_fundamentals(symbol)


@router.get(
    "/suggestions",
    response_model=list[StockSuggestion],
    summary="종목명 · 코드 · 초성 자동완성",
)
async def get_stock_suggestions(
    repo: ListedCompanyRepo,
    # 상한이 없던 유일한 문자열 파라미터였다. 종목명은 40자를 넘지 않고, 길이가
    # 자유로우면 `find_candidates` 의 선행 와일드카드 스캔 비용만 커진다.
    # 프런트 BFF 도 같은 값으로 자른다 (`app/api/stocks/suggestions/route.ts`).
    query: Annotated[str, Query(min_length=1, max_length=40)],
    limit: Annotated[int, Query(ge=1, le=10)] = 5,
) -> list[StockSuggestion]:
    return await listed_company_service.search(repo, query, limit)


@router.get(
    "/listed-companies",
    response_model=ListedCompaniesStatus,
    summary="상장사 목록 준비 상태",
)
async def get_listed_companies_status(repo: ListedCompanyRepo) -> ListedCompaniesStatus:
    """첫 자동완성 지연 배너가 폴링한다. 수집을 유발하지 않고 상태만 읽는다."""
    return await listed_company_service.get_status(repo)


def _advice_session_id(owner: str | None, symbol: str) -> str:
    """이 종목에 대한 이 사람의 판단 대화 하나를 가리키는 ID.

    Agent Analytics 는 `session_id` 로 턴을 이어 붙인다. 요청마다 새 UUID 를 주면
    **모든 판단이 각각 1턴짜리 대화**가 되어 "같은 종목을 몇 번 다시 물었나" 가
    보이지 않는다 — 이 앱에서 가장 궁금한 질문이 바로 그것이다.

    앱에 스레드 개념이 없으므로 (소유자, 종목) 을 그 자리에 쓴다. 비로그인은
    `anon` 으로 묶이는데, 그 구간은 어차피 개인을 구분하지 않는 것이 맞다.
    """
    return f"advice:{owner or 'anon'}:{symbol}"


@router.post("/advice", response_model=StockAdviceResponse, summary="AI 멀티 에이전트 판단")
async def create_stock_advice(
    repo: ListedCompanyRepo,
    payload: StockAdviceRequest,
    profiles: InvestorProfileRepo,
    owner: OptionalOwnerKey,
    _: AdviceKeyGuard = None,
) -> StockAdviceResponse:
    """`X-Owner-Key` 가 있고 그 소유자에게 프로파일이 있으면 2축 판단까지 실어 준다.

    없으면 `personal` 이 null 인 종전 응답 그대로다 — 개인화는 얹는 기능이지 전제
    조건이 아니다.
    """
    listing = await listed_company_service.resolve_listing(repo, payload.symbol)
    profile = await profile_service.get_profile(profiles, owner) if owner else None
    try:
        async with advice_cache.reserve_slot():
            async with amplitude.session(
                amplitude.STOCK_ADVICE,
                user_id=owner,
                session_id=_advice_session_id(owner, payload.symbol),
            ):
                return await advice_service.generate_advice(
                    payload.symbol, listing=listing, profile=profile
                )
    except advice_cache.AdviceBusyError as exc:
        raise _busy(exc) from exc


@router.post(
    "/advice/stream",
    summary="AI 멀티 에이전트 판단 (SSE 스트리밍)",
    response_class=StreamingResponse,
)
async def stream_stock_advice(
    repo: ListedCompanyRepo,
    payload: StockAdviceRequest,
    profiles: InvestorProfileRepo,
    owner: OptionalOwnerKey,
    _: AdviceKeyGuard = None,
) -> StreamingResponse:
    """`/advice`와 같은 결과를 4단계로 나눠 흘린다.

    종목당 LLM 4회라 완료까지 수십 초가 걸린다 — 진행 단계를 보여주려면
    스트리밍이 필요하다. 응답 본문은 `AdviceStreamEvent` JSON 한 줄씩이다.

    **화면이 실제로 부르는 경로는 여기다.** 프런트는 비스트리밍 `/advice` 를 쓰지
    않으므로, 2축 판단(`personal`)도 이쪽에 실려야 사용자에게 도달한다.
    """
    # 스트림이 열리기 전에 읽어 값으로 넘긴다 — 제너레이터 안에서 DB를 만지면
    # 수십 초 동안 세션이 붙잡힌다. 프로파일도 같은 이유로 여기서 읽는다.
    listing = await listed_company_service.resolve_listing(repo, payload.symbol)
    profile = await profile_service.get_profile(profiles, owner) if owner else None

    # 슬롯도 스트림을 열기 **전에** 잡는다. 제너레이터 안에서 잡으면 상한 초과를
    # 알릴 때 이미 200 + text/event-stream 헤더가 나간 뒤라, 클라이언트는 429 대신
    # "빈 스트림"을 받는다 — 거절인지 장애인지 구분할 수 없다.
    try:
        advice_cache.reserve_slot_now()
    except advice_cache.AdviceBusyError as exc:
        raise _busy(exc) from exc

    # 정확히 한 번만 반납하기 위한 가드. 아래 두 경로(`on_finish` 와
    # `background`)가 같은 요청에 대해 둘 다 불릴 수 있는데, `release_slot` 을
    # 두 번 부르면 다른 요청이 방금 잡은 자리를 빼앗는 진짜 이중 반납이 된다 —
    # asyncio 는 단일 스레드이므로 이 플래그 검사·설정 사이에 끼어들 여지가 없다.
    released = False

    def release_slot_once() -> None:
        nonlocal released
        if not released:
            released = True
            advice_cache.release_slot()

    # 프레이밍·하트비트·슬롯 반납은 전송 계층의 일이라 `api/sse.py` 가 맡는다.
    #
    # **여기서 직접 `async for` 하면 안 된다.** 그러면 실행 예산 타이머가 소켓
    # 쓰기 창에서 터졌을 때 취소가 이 함수 프레임에서 터져 `TimeoutError` 로
    # 변환되지 않고, 규칙 기반 착지(stage 4)가 통째로 유실된다. 재현한 함정이라
    # 근거를 `api/sse.py` 파일 주석 ②에 적어 두었다.
    return StreamingResponse(
        sse_with_heartbeat(
            # 세션은 스트림이 **다 소비될 때까지** 열려 있어야 한다. 이 함수는
            # StreamingResponse 를 즉시 반환하므로 여기서 `async with` 를 쓰면
            # LLM 호출이 일어나기 전에 닫힌다 (`integrations/amplitude`).
            amplitude.stream_within(
                amplitude.STOCK_ADVICE,
                user_id=owner,
                session_id=_advice_session_id(owner, payload.symbol),
                # 모듈 속성으로 부르는 형태를 유지한다 — 테스트가 이 속성을 갈아끼운다.
                source=advice_stream.stream_advice(
                    payload.symbol, listing=listing, profile=profile
                ),
            ),
            heartbeat_seconds=settings.advice_heartbeat_seconds,
            # 소비자가 중간에 끊어도 반드시 반납한다. 안 그러면 사용자가 드로어를
            # 몇 번 여닫는 것만으로 동시 실행 상한이 영구히 차 버린다.
            on_finish=release_slot_once,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            # nginx 등 리버스 프록시가 SSE를 버퍼링하지 않도록.
            "X-Accel-Buffering": "no",
        },
        # 2차 방어선. `on_finish` 는 제너레이터 본문이 한 번이라도 실행돼야
        # (`finally` 가 있어야) 불린다 — 응답을 반환한 직후, ASGI 서버가 바디를
        # 한 번도 읽기 전에 클라이언트가 끊기면 그 `finally` 는 영영 안 돈다.
        # Starlette 는 스트림이 어느 쪽으로 끝나든 이 태스크를 실행하므로, 그
        # 틈에서도 슬롯이 반납된다. 정상 경로에서는 위 가드 덕분에 여기서는
        # 아무 일도 하지 않는다.
        background=BackgroundTask(release_slot_once),
    )


def _busy(exc: Exception) -> HTTPException:
    """동시 실행 상한 초과 → 429.

    503(일시적 장애)이 아니라 429(요청이 너무 많음)인 이유: 서버는 멀쩡하고, 잠시 뒤
    다시 보내면 되는 상황이라는 뜻이 정확하다. `Retry-After` 로 그 '잠시'를 명시한다.
    """
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=str(exc),
        headers={"Retry-After": "20"},
    )
