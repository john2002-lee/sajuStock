"""OHLCV 히스토리 + 보조지표 파생 (명세 6.3).

동기 함수다 — 서비스 계층이 `asyncio.to_thread`로 호출한다.
"""

import logging
from datetime import date, timedelta
from typing import Any

from app.core.exceptions import ProviderUnavailableError, StockNotFoundError
from app.domain.constants import STOCK_TIMEFRAMES
from app.domain.symbols import (
    get_common_stock_name,
    get_korean_stock_name,
    normalize_stock_candidates,
)
from app.integrations.yfinance.client import get_stock_name, is_rate_limited, load_yfinance
from app.integrations.yfinance.news import fetch_stock_news
from app.integrations.yfinance.reports import fetch_analyst_reports
from app.schemas.stock import KrxListing, StockHistory, StockRow
from app.utils.numbers import int_or_none, number_or_none

logger = logging.getLogger(__name__)

_SMA_SHORT = 5
_SMA_MID = 20
_SMA_LONG = 60
_BOLLINGER_STD = 2
_NEWS_LIMIT = 3
_REPORT_LIMIT = 3


def _with_indicators(history: Any) -> Any:
    """SMA5/20/60 · 볼린저밴드 · 골든/데드크로스 신호를 붙인다.

    교차는 20일선과 60일선으로 판정한다. 5×20 교차는 노이즈가 많아 화면에
    마커가 과도하게 찍히고, 프런트 차트 레전드(MA20/MA60)와도 어긋난다.
    SMA5는 애널리스트 에이전트 프롬프트가 참조하므로 계속 계산한다.
    """
    history = history.copy()
    history["SMA5"] = history["Close"].rolling(_SMA_SHORT).mean()
    history["SMA20"] = history["Close"].rolling(_SMA_MID).mean()
    history["SMA60"] = history["Close"].rolling(_SMA_LONG).mean()

    std20 = history["Close"].rolling(_SMA_MID).std()
    history["BB_upper"] = history["SMA20"] + _BOLLINGER_STD * std20
    history["BB_lower"] = history["SMA20"] - _BOLLINGER_STD * std20

    # SMA20이 SMA60을 상향 돌파하면 golden, 하향 이탈하면 dead.
    #
    # 두 이동평균이 모두 존재하는 구간에서만 비교한다. 그냥 `SMA20 > SMA60`을 쓰면
    # 워밍업 구간에서 `값 > NaN`이 False(=0)로 평가되고, SMA60이 처음 생기는 봉에서
    # 0→1로 뒤집혀 교차가 없었는데도 golden이 찍힌다(차트 왼쪽 끝의 유령 마커).
    both = history["SMA20"].notna() & history["SMA60"].notna()
    above = (history["SMA20"] > history["SMA60"]).where(both)
    # 워밍업 구간은 NaN이라 diff도 NaN → 경계에서 신호가 생기지 않는다.
    ma_cross = above.astype(float).diff()
    history["CrossSignal"] = None
    history.loc[ma_cross == 1, "CrossSignal"] = "golden"
    history.loc[ma_cross == -1, "CrossSignal"] = "dead"

    return history


def _date_text(date_value: Any) -> str:
    if hasattr(date_value, "date"):
        return date_value.date().isoformat()

    return str(date_value)[:10]


def _build_rows(history: Any, stock_name: str, symbol: str, limit: int) -> list[StockRow]:
    rows: list[StockRow] = []
    for date_value, row in history.tail(limit).iterrows():
        rows.append(
            StockRow(
                name=stock_name,
                symbol=symbol,
                date=_date_text(date_value),
                open=number_or_none(row.get("Open")),
                close=number_or_none(row.get("Close")),
                high=number_or_none(row.get("High")),
                low=number_or_none(row.get("Low")),
                volume=int_or_none(row.get("Volume")),
                sma5=number_or_none(row.get("SMA5")),
                sma20=number_or_none(row.get("SMA20")),
                sma60=number_or_none(row.get("SMA60")),
                bb_upper=number_or_none(row.get("BB_upper")),
                bb_lower=number_or_none(row.get("BB_lower")),
                cross_signal=row.get("CrossSignal"),
            )
        )
    return rows


def _candidates(symbol: str, listing: KrxListing | None) -> list[str]:
    """확정된 심볼을 맨 앞으로. 나머지는 기존 추측 순서를 그대로 뒤에 남긴다.

    확정 심볼만 쓰지 않는 이유: KRX 목록이 실제 상장 상태보다 늦을 수 있어
    그 심볼이 실패하면 기존 경로로 되돌아갈 자리가 필요하다.
    """
    guessed = normalize_stock_candidates(symbol)
    if listing is None:
        return guessed
    return [listing.symbol, *(item for item in guessed if item != listing.symbol)]


def fetch_stock_history(
    symbol: str,
    timeframe: str,
    period: str | None,
    limit: int,
    start_date: date | None = None,
    end_date: date | None = None,
    *,
    include_content: bool = True,
    listing: KrxListing | None = None,
) -> StockHistory:
    """후보 심볼을 순서대로 시도해 첫 성공을 반환한다.

    파라미터 검증(timeframe/period/날짜 범위)은 서비스 계층에서 이미 끝난 상태로
    들어온다 — 이 함수는 공급자 호출과 변환만 담당한다.

    `listing`은 서비스 계층이 KRX 목록에서 확정해 넘긴 신원이다. 있으면 그 심볼을
    맨 앞에서 시도하고 이름도 그 값을 쓴다 — 6자리 코드로 `.KS`/`.KQ`를 추측하면
    야후가 틀린 접미사에도 응답을 주기 때문에(다른 계열의 하루 늦은 시세) 조용히
    잘못된 데이터가 화면까지 간다.
    """
    yf = load_yfinance()

    has_date_range = bool(start_date or end_date)
    selected_period = None if has_date_range else period or STOCK_TIMEFRAMES[timeframe]["period"]
    interval = STOCK_TIMEFRAMES[timeframe]["interval"]
    requested_name = get_common_stock_name(symbol)

    for candidate in _candidates(symbol, listing):
        ticker = yf.Ticker(candidate)

        history_kwargs: dict[str, Any] = {"interval": interval, "auto_adjust": False}
        if has_date_range:
            if start_date:
                history_kwargs["start"] = start_date.isoformat()
            if end_date:
                # yfinance의 end는 배타적이라 하루를 더해 종료일을 포함시킨다.
                history_kwargs["end"] = (end_date + timedelta(days=1)).isoformat()
        else:
            history_kwargs["period"] = selected_period

        try:
            history = ticker.history(**history_kwargs)
        except Exception as exc:
            # **레이트리밋은 '다음 후보' 가 아니다.** 상류가 우리를 막은 것이므로 다른
            # 접미사를 물어도 같은 답이 오고, 물어보는 행위 자체가 차단을 연장한다.
            # 여기서 끊으면 6자리 코드 한 건당 상류 호출이 3회에서 1회로 줄어든다.
            if is_rate_limited(exc):
                # 조용한 실패의 유일한 조기 경보라 info 가 아니라 warning 이다.
                logger.warning(
                    "%s 히스토리 조회가 레이트리밋에 걸렸습니다 (%s) → 남은 후보를 "
                    "포기하고 503 으로 올립니다",
                    candidate,
                    exc,
                )
                raise ProviderUnavailableError(
                    "시세 공급자가 요청을 제한하고 있습니다. 잠시 뒤 다시 시도해주세요."
                ) from exc

            logger.info("%s 히스토리 조회 실패 (%s) → 다음 후보", candidate, exc)
            continue

        if history.empty:
            logger.info("%s 히스토리가 비어 있습니다 → 다음 후보", candidate)
            continue

        history = _with_indicators(history)
        # KRX 상호(에코프로비엠)가 공급자 영문명(ECOPROBM)보다 앞선다 —
        # 목록·검색·관심종목이 모두 KRX 이름으로 표시되므로 상세만 다르면 안 된다.
        stock_name = (
            requested_name
            or (listing.name if listing else None)
            or get_korean_stock_name(candidate)
            or get_stock_name(ticker, candidate)
        )

        return StockHistory(
            name=stock_name,
            symbol=candidate,
            query=symbol,
            timeframe=timeframe,  # type: ignore[arg-type]  # 서비스 계층에서 검증됨
            period=selected_period or "custom",
            interval=interval,
            start_date=start_date.isoformat() if start_date else None,
            end_date=end_date.isoformat() if end_date else None,
            rows=_build_rows(history, stock_name, candidate, limit),
            news=fetch_stock_news(ticker, _NEWS_LIMIT) if include_content else [],
            reports=(
                fetch_analyst_reports(ticker, candidate, _REPORT_LIMIT) if include_content else []
            ),
        )

    raise StockNotFoundError
