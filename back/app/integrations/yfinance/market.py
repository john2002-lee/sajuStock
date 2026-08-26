"""시장 개요 조회 (명세 6.1). 동기 — 서비스가 스레드로 감싼다."""

import logging
from datetime import UTC, datetime
from typing import Any

from app.core.exceptions import MarketDataUnavailableError, UnsupportedMarketCategoryError
from app.domain.market_catalog import MARKET_OVERVIEW_CATEGORIES
from app.schemas.market import MarketOverview, MarketRow
from app.utils.numbers import number_or_none
from app.utils.text import clean_text

logger = logging.getLogger(__name__)

# 인트라데이가 없으면 일봉으로 후퇴한다.
_HISTORY_ATTEMPTS = (("1d", "5m"), ("5d", "1d"))
_SPARKLINE_POINTS = 24


def _chart_label(value: Any) -> str:
    try:
        timestamp = value.to_pydatetime() if hasattr(value, "to_pydatetime") else value
    except Exception:
        timestamp = value

    if isinstance(timestamp, datetime):
        if timestamp.hour or timestamp.minute:
            return timestamp.strftime("%H:%M")
        return timestamp.strftime("%m/%d")

    text = clean_text(value)
    return text[:5] if text else ""


def _load_history(ticker: Any) -> Any | None:
    for period, interval in _HISTORY_ATTEMPTS:
        try:
            history = ticker.history(period=period, interval=interval, auto_adjust=False)
        except Exception as exc:
            logger.debug("history(period=%s, interval=%s) 실패: %s", period, interval, exc)
            continue

        if history is not None and not history.empty:
            return history

    return None


def _previous_close(ticker: Any, history: Any, latest_close: float) -> float:
    """fast_info → info → 직전 종가 순으로 전일 종가를 찾는다."""
    for source in ("fast_info", "info"):
        try:
            payload = getattr(ticker, source)
            key = "previous_close" if source == "fast_info" else "previousClose"
            value = number_or_none(payload.get(key))
        except Exception as exc:
            logger.debug("%s 조회 실패: %s", source, exc)
            continue

        if value not in (None, 0):
            return value

    closes = [value for value in (number_or_none(v) for v in history["Close"].tail(2)) if value]
    return closes[0] if len(closes) > 1 else latest_close


def _build_row(item: dict, ticker: Any, history: Any, highlight: bool) -> MarketRow | None:
    history = history.dropna(subset=["Close"])
    if history.empty:
        return None

    latest_close = number_or_none(history["Close"].iloc[-1])
    if latest_close is None:
        return None

    previous_close = _previous_close(ticker, history, latest_close)
    change = number_or_none(latest_close - previous_close)
    change_percent = number_or_none((change / previous_close) * 100) if previous_close else None

    recent = history.tail(_SPARKLINE_POINTS)
    points: list[float] = []
    labels: list[str] = []
    for index_value, close in zip(recent.index, recent["Close"], strict=False):
        value = number_or_none(close)
        if value is None:
            continue
        points.append(value)
        labels.append(_chart_label(index_value))

    return MarketRow(
        name=item["name"],
        symbol=item["symbol"],
        value=latest_close,
        change=change,
        change_percent=change_percent,
        tone="up" if (change or 0) >= 0 else "down",
        highlight=highlight,
        chart_points=points,
        chart_labels=labels,
    )


def fetch_market_overview(category: str = "index") -> MarketOverview:
    from app.integrations.yfinance.client import load_yfinance

    yf = load_yfinance()

    config = MARKET_OVERVIEW_CATEGORIES.get(category)
    if config is None:
        raise UnsupportedMarketCategoryError

    rows: list[MarketRow] = []
    for item in config["symbols"]:
        ticker = yf.Ticker(item["symbol"])
        history = _load_history(ticker)
        if history is None:
            logger.info("%s 시세를 불러오지 못했습니다 → 건너뜀", item["symbol"])
            continue

        row = _build_row(item, ticker, history, highlight=not rows)
        if row is not None:
            rows.append(row)

    if not rows:
        raise MarketDataUnavailableError

    # 대표(highlight) 종목의 스파크라인을 카테고리 차트로 승격한다.
    highlighted = rows[0]
    chart_points = highlighted.chart_points or [row.value for row in rows]
    chart_labels = highlighted.chart_labels or [row.name for row in rows]

    return MarketOverview(
        category=category,
        label=config["label"],
        rows=rows,
        chart_points=chart_points,
        chart_labels=chart_labels,
        updated_at=datetime.now(UTC).isoformat(timespec="seconds"),
    )
