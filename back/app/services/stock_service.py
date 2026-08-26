"""주가 히스토리 서비스 (명세 6.3).

도메인 규칙 검증은 여기서 하고, 블로킹 공급자 호출은 스레드로 넘긴다.
"""

import asyncio
import logging

from app.core.exceptions import (
    InvalidDateRangeError,
    UnsupportedPeriodError,
    UnsupportedTimeframeError,
)
from app.domain.constants import STOCK_PERIODS, STOCK_TIMEFRAMES
from app.domain.metrics import build_stock_metrics
from app.integrations.yfinance.content import fetch_stock_content
from app.integrations.yfinance.history import fetch_stock_history
from app.schemas.stock import (
    KrxListing,
    StockContent,
    StockHistory,
    StockHistoryParams,
    StockMetrics,
)

logger = logging.getLogger(__name__)


def validate_params(params: StockHistoryParams) -> None:
    """공급자를 호출하기 전에 도메인 규칙을 검증한다."""
    if params.timeframe not in STOCK_TIMEFRAMES:
        raise UnsupportedTimeframeError

    if params.start_date and params.end_date and params.start_date > params.end_date:
        raise InvalidDateRangeError

    # 날짜 범위를 주면 period는 무시된다.
    if params.start_date or params.end_date:
        return

    period = params.period or STOCK_TIMEFRAMES[params.timeframe]["period"]
    if period not in STOCK_PERIODS:
        raise UnsupportedPeriodError


async def get_history(
    params: StockHistoryParams,
    *,
    include_content: bool = True,
    listing: KrxListing | None = None,
) -> StockHistory:
    """`listing`은 라우터가 KRX 목록에서 확정해 넘긴 신원이다 (없으면 추측 경로).

    이 계층에서 조회하지 않고 받아만 쓰는 이유: 서비스가 리포지토리를 직접 잡으면
    AI 스트리밍처럼 수십 초 도는 호출이 DB 세션을 그동안 붙들게 된다. 라우터가
    요청 초입에 한 번 읽고 값으로 넘긴다.
    """
    validate_params(params)

    # yfinance는 동기 블로킹 라이브러리 → 이벤트 루프를 막지 않도록 스레드로 넘긴다.
    history = await asyncio.to_thread(
        fetch_stock_history,
        params.symbol,
        params.timeframe,
        params.period,
        params.limit,
        params.start_date,
        params.end_date,
        include_content=include_content,
        listing=listing,
    )

    # 지표는 rows에서 파생되므로 응답에 함께 담는다. 프런트가 동일한 계산을
    # TypeScript로 재구현하는 중복을 없애는 것이 목적이다.
    return history.model_copy(update={"metrics": build_stock_metrics(history.rows)})


async def get_content(symbol: str) -> StockContent:
    """뉴스·리포트만 조회한다 (명세 6.3).

    `/stocks/history`가 반환한 `symbol`을 그대로 넘겨 후보 탐색을 건너뛴다.
    """
    return await asyncio.to_thread(fetch_stock_content, symbol)


def get_metrics(history: StockHistory) -> StockMetrics:
    """지표 요약. 유효한 봉이 없으면 기본값 인스턴스를 돌려준다."""
    return history.metrics or build_stock_metrics(history.rows) or StockMetrics()
