"""지표 계산 (명세 6.3). 순수 함수 — I/O 없음."""

from math import sqrt

from app.schemas.stock import StockMetrics, StockRow
from app.utils.numbers import is_number, percent_change

_VOLUME_WINDOW = 20
_CROSS_LOOKBACK = 45
_RETURN_20D_OFFSET = 21
_RETURN_60D_OFFSET = 61
# 52주 ≈ 252거래일
_WEEK52_WINDOW = 252
_VOLATILITY_WINDOW = 20


def get_latest_valid_rows(rows: list[StockRow]) -> list[StockRow]:
    """날짜 오름차순으로 정렬하고 종가가 없는 봉을 제거한다."""
    return [row for row in sorted(rows, key=lambda item: item.date or "") if is_number(row.close)]


def build_stock_metrics(rows: list[StockRow]) -> StockMetrics | None:
    """OHLCV 시계열에서 지표 요약을 만든다. 유효한 봉이 없으면 None."""
    valid = get_latest_valid_rows(rows)
    if not valid:
        return None

    latest = valid[-1]
    previous = valid[-2] if len(valid) >= 2 else None
    latest_close = latest.close
    previous_close = previous.close if previous else None

    volumes = [
        row.volume
        for row in valid[-_VOLUME_WINDOW:]
        if is_number(row.volume) and row.volume and row.volume > 0
    ]
    avg_volume = sum(volumes) / len(volumes) if volumes else None
    volume_ratio = (
        round(latest.volume / avg_volume, 2) if is_number(latest.volume) and avg_volume else None
    )

    recent_cross = next(
        (row for row in reversed(valid[-_CROSS_LOOKBACK:]) if row.cross_signal is not None),
        None,
    )

    return_20 = (
        percent_change(valid[-_RETURN_20D_OFFSET].close, latest_close)
        if len(valid) >= _RETURN_20D_OFFSET
        else None
    )
    return_60 = (
        percent_change(valid[-_RETURN_60D_OFFSET].close, latest_close)
        if len(valid) >= _RETURN_60D_OFFSET
        else None
    )

    bb_position = "중립"
    if is_number(latest_close) and is_number(latest.bb_upper) and latest_close > latest.bb_upper:
        bb_position = "상단 돌파"
    elif is_number(latest_close) and is_number(latest.bb_lower) and latest_close < latest.bb_lower:
        bb_position = "하단 이탈"

    trend = (
        "상승 우위"
        if is_number(latest.sma5) and is_number(latest.sma20) and latest.sma5 > latest.sma20
        else "중립/약세"
    )

    week52 = _week52(valid, latest_close)
    volatility = _volatility_20d(valid)

    return StockMetrics(
        latest_date=latest.date,
        latest_close=latest_close,
        day_change=(
            round(latest_close - previous_close, 2)
            if is_number(latest_close) and is_number(previous_close)
            else None
        ),
        day_change_pct=percent_change(previous_close, latest_close),
        return_20d_pct=return_20,
        return_60d_pct=return_60,
        sma5=latest.sma5,
        sma20=latest.sma20,
        sma60=latest.sma60,
        trend=trend,
        bollinger_position=bb_position,
        volume_ratio_20d=volume_ratio,
        recent_cross_signal=recent_cross.cross_signal if recent_cross else None,
        recent_cross_date=recent_cross.date if recent_cross else None,
        week52_position_pct=week52[0],
        week52_high=week52[1],
        week52_low=week52[2],
        volatility_20d_pct=volatility,
    )


def _week52(
    rows: list[StockRow], latest_close: float | None
) -> tuple[float | None, float | None, float | None]:
    """52주 고저와 그 구간에서 현재가가 놓인 백분위.

    일봉 기준 52주 ≈ 252거래일. 봉이 그보다 적으면 있는 만큼으로 계산한다 —
    신규 상장 종목도 값이 나오는 편이 빈칸보다 낫다.
    """
    window = [row.close for row in rows[-_WEEK52_WINDOW:] if is_number(row.close)]
    if not window or not is_number(latest_close):
        return (None, None, None)

    high = max(window)
    low = min(window)
    span = high - low
    position = 100.0 if span == 0 else (latest_close - low) / span * 100
    return (round(position, 1), round(high, 2), round(low, 2))


def _volatility_20d(rows: list[StockRow]) -> float | None:
    """최근 20거래일 일간수익률의 표준편차(%)."""
    closes = [row.close for row in rows[-(_VOLATILITY_WINDOW + 1) :] if is_number(row.close)]
    if len(closes) < 3:
        return None

    returns = [
        (closes[i] - closes[i - 1]) / closes[i - 1] for i in range(1, len(closes)) if closes[i - 1]
    ]
    if len(returns) < 2:
        return None

    mean = sum(returns) / len(returns)
    variance = sum((value - mean) ** 2 for value in returns) / (len(returns) - 1)
    return round(sqrt(variance) * 100, 2)
