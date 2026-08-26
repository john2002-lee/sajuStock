"""적합도 계산 (사주 통합 계획 5.4). 순수 함수라 네트워크·DB 없이 돈다."""

from app.domain.fit import (
    AXIS_CHASE,
    AXIS_HORIZON,
    AXIS_TIMING,
    AXIS_VOLATILITY,
    compute_fit,
)
from app.schemas.profile import InvestorProfile
from app.schemas.stock import StockMetrics


def _profile(**kwargs) -> InvestorProfile:
    """중립(50) 기준에서 필요한 축만 바꾼다."""
    base = {
        "risk_appetite": 50,
        "patience": 50,
        "decisiveness": 50,
        "loss_aversion": 50,
        "herd_tendency": 50,
    }
    return InvestorProfile(**{**base, **kwargs})


def _axes(fit) -> set[str]:
    return {concern.axis for concern in fit.concerns}


def test_no_metrics_is_reported_as_insufficient_data() -> None:
    fit = compute_fit(_profile(), StockMetrics())

    assert fit.insufficient_data is True
    assert fit.concerns == []


def test_volatility_within_tolerance_is_not_penalised() -> None:
    # 감내 = 10 + 50*0.3 - 30*0.15 = 20.5
    fit = compute_fit(
        _profile(risk_appetite=50, loss_aversion=30),
        StockMetrics(latest_close=100.0, volatility_20d_pct=15.0),
    )

    assert fit.score == 100
    assert AXIS_VOLATILITY not in _axes(fit)


def test_volatility_above_tolerance_is_penalised() -> None:
    fit = compute_fit(
        _profile(risk_appetite=50, loss_aversion=30),
        StockMetrics(latest_close=100.0, volatility_20d_pct=32.0),
    )

    assert fit.score < 100
    assert AXIS_VOLATILITY in _axes(fit)
    concern = next(c for c in fit.concerns if c.axis == AXIS_VOLATILITY)
    assert concern.severity == "high"
    assert "32.0%" in concern.message


def test_loss_aversion_narrows_the_tolerated_volatility() -> None:
    """같은 종목이라도 손실 회피가 강하면 더 낮은 변동성에서 걸린다."""
    metrics = StockMetrics(latest_close=100.0, volatility_20d_pct=20.0)

    calm = compute_fit(_profile(risk_appetite=50, loss_aversion=0), metrics)
    anxious = compute_fit(_profile(risk_appetite=50, loss_aversion=100), metrics)

    assert calm.score == 100
    assert anxious.score < calm.score


def test_herd_tendency_flags_chasing_the_52week_high() -> None:
    metrics = StockMetrics(latest_close=100.0, week52_position_pct=90.0)

    follower = compute_fit(_profile(herd_tendency=100), metrics)
    independent = compute_fit(_profile(herd_tendency=0), metrics)

    assert AXIS_CHASE in _axes(follower)
    assert AXIS_CHASE not in _axes(independent)
    assert independent.score == 100


def test_short_horizon_profile_is_flagged_on_a_weak_trend() -> None:
    metrics = StockMetrics(latest_close=100.0, sma5=95.0, sma20=105.0, trend="중립/약세")

    trader = compute_fit(_profile(patience=10), metrics)
    holder = compute_fit(_profile(patience=90), metrics)

    assert AXIS_HORIZON in _axes(trader)
    assert AXIS_HORIZON not in _axes(holder)


def test_short_horizon_profile_is_not_flagged_on_a_confirmed_uptrend() -> None:
    fit = compute_fit(
        _profile(patience=10),
        StockMetrics(latest_close=100.0, sma5=110.0, sma20=100.0, trend="상승 우위"),
    )

    assert AXIS_HORIZON not in _axes(fit)


def test_horizon_axis_needs_actual_trend_evidence() -> None:
    """이동평균도 교차 신호도 없으면 기본값 '중립/약세'로 감점하지 않는다."""
    fit = compute_fit(
        _profile(patience=10), StockMetrics(latest_close=100.0, week52_position_pct=10.0)
    )

    assert AXIS_HORIZON not in _axes(fit)


def test_surge_and_volume_spike_flag_entry_timing() -> None:
    fit = compute_fit(
        _profile(decisiveness=80),
        StockMetrics(latest_close=100.0, day_change_pct=9.0, volume_ratio_20d=2.5),
    )

    concern = next(c for c in fit.concerns if c.axis == AXIS_TIMING)
    assert concern.severity == "high"
    assert "결정이 빠른 편" in concern.message


def test_timing_message_does_not_assert_a_trait_the_profile_lacks() -> None:
    fit = compute_fit(
        _profile(decisiveness=0),
        StockMetrics(latest_close=100.0, day_change_pct=12.0),
    )

    concern = next(c for c in fit.concerns if c.axis == AXIS_TIMING)
    assert "결정이 빠른 편" not in concern.message


def test_score_stays_within_bounds_and_concerns_lead_with_severity() -> None:
    """모든 축이 걸리는 최악 조합에서도 0~100 을 벗어나지 않는다."""
    fit = compute_fit(
        _profile(
            risk_appetite=0,
            loss_aversion=100,
            herd_tendency=100,
            patience=0,
            decisiveness=100,
        ),
        StockMetrics(
            latest_close=100.0,
            volatility_20d_pct=80.0,
            week52_position_pct=99.0,
            day_change_pct=15.0,
            volume_ratio_20d=4.0,
            sma5=90.0,
            sma20=110.0,
            trend="중립/약세",
            recent_cross_signal="dead",
        ),
    )

    assert fit.score == 0
    assert fit.level == "low"
    assert fit.insufficient_data is False
    assert len(fit.concerns) == 4
    severities = [concern.severity for concern in fit.concerns]
    order = {"high": 0, "medium": 1, "low": 2}
    assert severities == sorted(severities, key=lambda s: order[s])
