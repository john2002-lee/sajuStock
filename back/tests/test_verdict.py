"""2축 판단 결합과 단방향 보정 원칙 (사주 통합 계획 5.5).

이 파일의 핵심은 `test_correction_is_never_upward_for_any_input` 이다. 결합 표는
앞으로 손볼 일이 많은데, 한 칸만 잘못 고쳐도 "프로파일이 매수를 만들어냈다"가 되어
제품의 방어 논리가 무너진다. 표를 읽는 테스트가 아니라 **원칙을 강제하는 테스트**가
따로 있어야 하는 이유다.
"""

from itertools import product

import pytest

from app.domain.fit import AXIS_TIMING, AXIS_VOLATILITY, compute_fit
from app.domain.verdict import _CONSERVATISM, combine
from app.schemas.advice import InvestmentDecision
from app.schemas.profile import FitConcern, FitScore, InvestorProfile
from app.schemas.stock import StockMetrics

_VERDICTS = ("BUY", "WATCH", "AVOID")
_LEVELS = ("high", "medium", "low")


def _decision(verdict: str, confidence: int = 74) -> InvestmentDecision:
    return InvestmentDecision(
        verdict=verdict,
        decision_label="매수 가능",
        confidence=confidence,
        answer=f"{verdict} 판단입니다.",
    )


def _fit(level: str, score: int = 50, concerns: list[FitConcern] | None = None) -> FitScore:
    return FitScore(score=score, level=level, concerns=concerns or [])


@pytest.mark.parametrize(
    ("market", "level", "expected", "label"),
    [
        ("BUY", "high", "BUY", "매수 검토"),
        ("BUY", "medium", "BUY", "분할 매수"),
        ("BUY", "low", "WATCH", "관망"),
        ("WATCH", "high", "WATCH", "관망"),
        ("WATCH", "medium", "WATCH", "관망"),
        ("WATCH", "low", "AVOID", "비대상"),
        ("AVOID", "high", "AVOID", "매수 보류"),
        ("AVOID", "medium", "AVOID", "매수 보류"),
        ("AVOID", "low", "AVOID", "매수 보류"),
    ],
)
def test_combination_table(market: str, level: str, expected: str, label: str) -> None:
    result = combine(_decision(market), _fit(level))

    assert result.verdict == expected
    assert result.label == label
    assert result.market_verdict == market


def test_correction_is_never_upward_for_any_input() -> None:
    """성질 테스트 — 어떤 (시장 판단 × 적합도) 조합에서도 판단이 상향되지 않는다."""
    for market, level in product(_VERDICTS, _LEVELS):
        result = combine(_decision(market), _fit(level))

        assert _CONSERVATISM[result.verdict] >= _CONSERVATISM[market], (
            f"{market} + 적합도 {level} → {result.verdict} 로 상향됐다"
        )


def test_correction_is_never_upward_for_real_computed_profiles() -> None:
    """표가 아니라 `compute_fit` 이 실제로 내는 등급으로도 같은 성질을 확인한다."""
    extremes = (0, 50, 100)
    metric_sets = (
        StockMetrics(),
        StockMetrics(latest_close=100.0),
        StockMetrics(latest_close=100.0, volatility_20d_pct=45.0, week52_position_pct=97.0),
        StockMetrics(
            latest_close=100.0,
            volatility_20d_pct=8.0,
            week52_position_pct=15.0,
            sma5=110.0,
            sma20=100.0,
            trend="상승 우위",
            day_change_pct=0.4,
            volume_ratio_20d=1.0,
        ),
    )

    for risk, patience, decisiveness, loss, herd in product(*([extremes] * 5)):
        profile = InvestorProfile(
            risk_appetite=risk,
            patience=patience,
            decisiveness=decisiveness,
            loss_aversion=loss,
            herd_tendency=herd,
        )
        for metrics, market in product(metric_sets, _VERDICTS):
            result = combine(_decision(market), compute_fit(profile, metrics))

            assert _CONSERVATISM[result.verdict] >= _CONSERVATISM[market]


def test_high_fit_never_turns_avoid_into_buy() -> None:
    """가장 자주 받게 될 질문 — "사주가 매수를 추천하나요?" 에 대한 코드상의 답."""
    result = combine(_decision("AVOID"), _fit("high", score=100))

    assert result.verdict == "AVOID"
    assert result.adjusted is False


def test_low_fit_downgrades_and_marks_the_adjustment() -> None:
    result = combine(_decision("BUY", confidence=74), _fit("low", score=38))

    assert result.verdict == "WATCH"
    assert result.adjusted is True
    assert result.market_verdict == "BUY"
    assert result.market_confidence == 74
    assert result.fit_score == 38


def test_insufficient_data_passes_the_market_verdict_through_untouched() -> None:
    """지표가 없어 나온 100 점을 '잘 맞는다'로 읽지 않는다."""
    fit = FitScore(score=100, level="high", insufficient_data=True)

    result = combine(_decision("BUY"), fit)

    assert result.verdict == "BUY"
    assert result.label == "매수 가능"  # 시장 판단의 라벨 그대로
    assert result.adjusted is False
    assert result.concerns == []
    assert result.guardrails == []


def test_guardrails_are_generated_from_the_concern_axes() -> None:
    concerns = [
        FitConcern(axis=AXIS_VOLATILITY, severity="high", message="변동성이 큽니다."),
        FitConcern(axis=AXIS_TIMING, severity="medium", message="급등 당일입니다."),
    ]

    result = combine(_decision("BUY"), _fit("low", score=30, concerns=concerns))

    assert len(result.guardrails) == 2
    assert any("1/3" in line for line in result.guardrails)
    assert any("다음 거래일" in line for line in result.guardrails)


def test_guardrails_are_empty_without_concerns() -> None:
    assert combine(_decision("BUY"), _fit("high", score=95)).guardrails == []
