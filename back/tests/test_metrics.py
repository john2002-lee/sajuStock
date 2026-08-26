"""지표 계산과 규칙 기반 판단 (명세 6.3 / 6.4)."""

from app.agents.decision import fallback_decision
from app.domain.metrics import build_stock_metrics
from app.schemas.stock import StockMetrics, StockRow


def _row(day: int, close: float, **kwargs) -> StockRow:
    return StockRow(
        name="테스트",
        symbol="TEST",
        date=f"2026-01-{day:02d}",
        close=close,
        **kwargs,
    )


def test_returns_none_without_valid_rows() -> None:
    assert build_stock_metrics([]) is None
    assert build_stock_metrics([_row(1, None)]) is None  # type: ignore[arg-type]


def test_day_change_uses_previous_close() -> None:
    metrics = build_stock_metrics([_row(1, 100.0), _row(2, 110.0)])

    assert metrics is not None
    assert metrics.latest_close == 110.0
    assert metrics.day_change == 10.0
    assert metrics.day_change_pct == 10.0
    assert metrics.latest_date == "2026-01-02"


def test_rows_are_sorted_by_date() -> None:
    metrics = build_stock_metrics([_row(3, 130.0), _row(1, 100.0), _row(2, 110.0)])

    assert metrics is not None
    assert metrics.latest_date == "2026-01-03"


def test_trend_and_bollinger_position() -> None:
    metrics = build_stock_metrics(
        [_row(1, 100.0), _row(2, 130.0, sma5=120.0, sma20=110.0, bb_upper=125.0)]
    )

    assert metrics is not None
    assert metrics.trend == "상승 우위"
    assert metrics.bollinger_position == "상단 돌파"


def test_recent_cross_signal_picks_latest() -> None:
    metrics = build_stock_metrics(
        [
            _row(1, 100.0, cross_signal="dead"),
            _row(2, 110.0, cross_signal="golden"),
            _row(3, 120.0),
        ]
    )

    assert metrics is not None
    assert metrics.recent_cross_signal == "golden"
    assert metrics.recent_cross_date == "2026-01-02"


def test_volume_ratio_against_20d_average() -> None:
    rows = [_row(day, 100.0, volume=100) for day in range(1, 20)]
    rows.append(_row(20, 100.0, volume=200))

    metrics = build_stock_metrics(rows)

    assert metrics is not None
    assert metrics.volume_ratio_20d == 1.9  # 200 / (100*19+200)/20


def test_fallback_decision_is_bullish_on_positive_signals() -> None:
    decision = fallback_decision(
        StockMetrics(
            return_20d_pct=5.0,
            return_60d_pct=8.0,
            trend="상승 우위",
            recent_cross_signal="golden",
        )
    )

    assert decision.verdict == "BUY"
    assert decision.decision_label == "매수 가능"
    assert 0 <= decision.confidence <= 100
    assert "투자 손익을 보장하지 않습니다" in decision.answer


def test_fallback_decision_is_defensive_on_negative_signals() -> None:
    decision = fallback_decision(
        StockMetrics(
            return_20d_pct=-6.0,
            return_60d_pct=-9.0,
            trend="중립/약세",
            recent_cross_signal="dead",
            day_change_pct=-5.0,
        )
    )

    assert decision.verdict == "AVOID"


def test_fallback_decision_defaults_to_watch() -> None:
    assert fallback_decision(StockMetrics()).verdict == "WATCH"
