"""프로파일 × 종목 지표 적합도 계산 (사주 통합 계획 5.4). 순수 함수 — I/O 없음.

새 데이터를 받지 않는다. 네 축 모두 [`StockMetrics`](../schemas/stock.py)에 이미
있는 값만 쓴다 — 그래서 LLM 호출도, 추가 조회도 늘지 않는다.

| 축 | 종목 입력 | 프로파일 입력 |
|---|---|---|
| 변동성 부담 | `volatility_20d_pct` | `risk_appetite`, `loss_aversion` |
| 고점 추격 위험 | `week52_position_pct` | `herd_tendency` |
| 보유기간 정합 | `trend`, `recent_cross_signal` | `patience` |
| 진입 타이밍 규율 | `day_change_pct`, `volume_ratio_20d` | `decisiveness` |

값이 없는 축은 `fallback_decision` 의 점수 계산과 같은 규칙으로 **건너뛴다**.
없는 지표를 0으로 읽으면 "변동성 0% — 아주 안전"처럼 정반대 결론이 나온다.
"""

from app.schemas.profile import FitConcern, FitLevel, FitScore, InvestorProfile, Severity
from app.schemas.stock import StockMetrics
from app.utils.numbers import is_number

# 축별 감점 상한. 한 축이 단독으로 점수를 무너뜨리지 않게 하되, 둘 이상 겹치면
# 확실히 '낮음' 구간으로 떨어지도록 잡았다 (합계 상한 105).
_MAX_VOLATILITY_PENALTY = 40.0
_MAX_CHASE_PENALTY = 25.0
_MAX_HORIZON_PENALTY = 20.0
_MAX_TIMING_PENALTY = 20.0

# 적합도 등급 경계. 계획 5.6 의 예시(38점 → 낮음)와 맞춘다.
_HIGH_FIT_MIN = 70
_MEDIUM_FIT_MIN = 45

# 감내 변동성(%) = 기준 + 위험감수도·계수 - 손실회피·계수 (계획 5.4의 예시 공식).
_VOLATILITY_BASE = 10.0
_RISK_APPETITE_COEF = 0.30
_LOSS_AVERSION_COEF = 0.15
# 위험감수 0 · 손실회피 100 이면 음수가 된다. 어떤 성향이든 최소한의 감내 구간은
# 있다고 보고 바닥을 둔다 — 0 이면 모든 종목이 무한대 초과가 된다.
_MIN_VOLATILITY_TOLERANCE = 5.0

# 52주 위치 임계. 군중 추종이 강할수록 낮은 위치에서도 고점 추격으로 본다.
_CHASE_BASE = 100.0
_HERD_COEF = 0.35

# 보유기간 성향 경계.
_SHORT_TERM_PATIENCE = 40

# 당일 급등 임계(%). 결정이 빠를수록 낮은 상승률에서도 추격 위험으로 본다.
_SURGE_BASE = 8.0
_DECISIVENESS_COEF = 0.05
_MIN_SURGE_THRESHOLD = 2.0
# 거래량이 20일 평균의 몇 배부터 과열로 볼지, 그리고 그 판정을 적용할 성향 하한.
_VOLUME_SPIKE_RATIO = 2.0
_IMPULSIVE_DECISIVENESS = 60

AXIS_VOLATILITY = "변동성 부담"
AXIS_CHASE = "고점 추격 위험"
AXIS_HORIZON = "보유기간 정합"
AXIS_TIMING = "진입 타이밍 규율"


def _severity(ratio: float) -> Severity:
    """초과 정도를 심각도로. ratio 는 임계 대비 초과 비율."""
    if ratio >= 0.5:
        return "high"
    if ratio >= 0.2:
        return "medium"
    return "low"


def _volatility_concern(
    profile: InvestorProfile, metrics: StockMetrics
) -> tuple[float, FitConcern | None]:
    """감내 구간을 넘는 변동성만 감점한다."""
    if not is_number(metrics.volatility_20d_pct):
        return 0.0, None

    tolerance = max(
        _MIN_VOLATILITY_TOLERANCE,
        _VOLATILITY_BASE
        + profile.risk_appetite * _RISK_APPETITE_COEF
        - profile.loss_aversion * _LOSS_AVERSION_COEF,
    )
    volatility = metrics.volatility_20d_pct
    if volatility <= tolerance:
        return 0.0, None

    excess = (volatility - tolerance) / tolerance
    penalty = min(_MAX_VOLATILITY_PENALTY, excess * 60.0)
    return penalty, FitConcern(
        axis=AXIS_VOLATILITY,
        severity=_severity(excess),
        message=(
            f"20일 변동성 {volatility:.1f}%가 당신의 감내 구간(약 {tolerance:.1f}%)을 넘습니다."
        ),
    )


def _chase_concern(
    profile: InvestorProfile, metrics: StockMetrics
) -> tuple[float, FitConcern | None]:
    """군중 추종 성향이 강한 사람이 52주 고점 부근을 잡는 경우를 감점한다."""
    if not is_number(metrics.week52_position_pct):
        return 0.0, None

    threshold = _CHASE_BASE - profile.herd_tendency * _HERD_COEF
    position = metrics.week52_position_pct
    if position <= threshold:
        return 0.0, None

    # 임계~100 구간에서 얼마나 올라와 있는지. 남은 구간이 0 이면 곧바로 최대 초과다.
    headroom = max(1.0, _CHASE_BASE - threshold)
    excess = (position - threshold) / headroom
    penalty = min(_MAX_CHASE_PENALTY, excess * _MAX_CHASE_PENALTY)
    return penalty, FitConcern(
        axis=AXIS_CHASE,
        severity=_severity(excess),
        message=(
            f"52주 구간에서 상위 {position:.0f}% 지점입니다. "
            "군중을 따라가는 성향이 강한 편이라 고점 추격이 되기 쉽습니다."
        ),
    )


def _horizon_concern(
    profile: InvestorProfile, metrics: StockMetrics
) -> tuple[float, FitConcern | None]:
    """짧게 보유하는 유형에만 건다.

    길게 보유하는 유형은 단기 추세가 흔들려도 견딜 수 있다고 보고 감점하지 않는다 —
    양쪽 모두에 감점을 걸면 어떤 프로파일이든 이 축에서 깎여 축이 무의미해진다.
    """
    if profile.patience >= _SHORT_TERM_PATIENCE:
        return 0.0, None

    # `trend` 는 기본값이 있는 필드라 "중립/약세"만 보고는 약세인지 계산할 근거가
    # 없었는지 구분할 수 없다. 추세의 출처인 이동평균이나 교차 신호가 실제로 있을
    # 때만 이 축을 채점한다.
    has_trend_evidence = (
        metrics.sma5 is not None and metrics.sma20 is not None
    ) or metrics.recent_cross_signal is not None
    if not has_trend_evidence:
        return 0.0, None

    if metrics.trend == "상승 우위" and metrics.recent_cross_signal != "dead":
        return 0.0, None

    dead_cross = metrics.recent_cross_signal == "dead"
    penalty = _MAX_HORIZON_PENALTY if dead_cross else _MAX_HORIZON_PENALTY * 0.7
    reason = "최근 데드크로스가 나왔습니다" if dead_cross else f"추세가 {metrics.trend}입니다"
    return penalty, FitConcern(
        axis=AXIS_HORIZON,
        severity="high" if dead_cross else "medium",
        message=(
            f"짧게 보유하는 편인데 이 종목은 {reason}. "
            "단기간에 수익을 내려면 상승 추세가 확인된 구간이 유리합니다."
        ),
    )


def _timing_concern(
    profile: InvestorProfile, metrics: StockMetrics
) -> tuple[float, FitConcern | None]:
    """급등 당일·거래량 과열 구간의 추격 매수를 감점한다."""
    surge_threshold = max(
        _MIN_SURGE_THRESHOLD, _SURGE_BASE - profile.decisiveness * _DECISIVENESS_COEF
    )
    surged = is_number(metrics.day_change_pct) and metrics.day_change_pct > surge_threshold
    overheated = (
        profile.decisiveness >= _IMPULSIVE_DECISIVENESS
        and is_number(metrics.volume_ratio_20d)
        and metrics.volume_ratio_20d >= _VOLUME_SPIKE_RATIO
    )

    if not surged and not overheated:
        return 0.0, None

    if surged and overheated:
        penalty, severity = _MAX_TIMING_PENALTY, "high"
        detail = (
            f"오늘 {metrics.day_change_pct:+.1f}% 움직였고 거래량도 20일 평균의 "
            f"{metrics.volume_ratio_20d:.1f}배입니다"
        )
    elif surged:
        penalty, severity = _MAX_TIMING_PENALTY * 0.7, "medium"
        detail = f"오늘 {metrics.day_change_pct:+.1f}% 움직였습니다"
    else:
        penalty, severity = _MAX_TIMING_PENALTY * 0.5, "low"
        detail = f"거래량이 20일 평균의 {metrics.volume_ratio_20d:.1f}배입니다"

    # 성향을 단정하는 문장은 실제로 그 성향일 때만 쓴다. 임계값에 이미 성향이
    # 반영돼 있어 결정이 느린 사람도 큰 급등에서는 걸리는데, 그때 "결정이 빠른
    # 편이라"고 말하면 사용자가 자기 프로파일을 의심하게 된다.
    closing = (
        "결정이 빠른 편이라 급한 진입이 되기 쉬운 구간입니다."
        if profile.decisiveness >= _IMPULSIVE_DECISIVENESS
        else "과열 구간에서의 진입은 되돌림 위험이 큽니다."
    )
    return penalty, FitConcern(axis=AXIS_TIMING, severity=severity, message=f"{detail}. {closing}")


def _level(score: int) -> FitLevel:
    if score >= _HIGH_FIT_MIN:
        return "high"
    if score >= _MEDIUM_FIT_MIN:
        return "medium"
    return "low"


def _has_any_input(metrics: StockMetrics) -> bool:
    """네 축 중 하나라도 계산할 수 있는 입력이 있는지."""
    return (
        is_number(metrics.volatility_20d_pct)
        or is_number(metrics.week52_position_pct)
        or is_number(metrics.day_change_pct)
        or is_number(metrics.volume_ratio_20d)
        or metrics.recent_cross_signal is not None
        or metrics.latest_close is not None
    )


def compute_fit(profile: InvestorProfile, metrics: StockMetrics) -> FitScore:
    """성향과 종목이 얼마나 맞는지 0~100 으로 낸다.

    100 에서 축별로 깎는 구조다. 감점 사유가 곧 화면의 '왜 갈렸나' 문장이 되므로
    점수와 문장이 같은 계산에서 함께 나온다 — 나중에 문장을 따로 지어내면 점수와
    설명이 어긋난다.

    지표가 하나도 없으면 `insufficient_data` 를 세워 돌려준다. 이때의 100 점은
    "잘 맞는다"가 아니라 "판단할 근거가 없었다"이고, 결합 단계가 이를 구분한다.
    """
    if not _has_any_input(metrics):
        return FitScore(score=100, level="high", concerns=[], insufficient_data=True)

    results = (
        _volatility_concern(profile, metrics),
        _chase_concern(profile, metrics),
        _horizon_concern(profile, metrics),
        _timing_concern(profile, metrics),
    )

    penalty = sum(value for value, _ in results)
    concerns = [concern for _, concern in results if concern is not None]

    # 심각한 축이 먼저 읽히게 한다 — 화면은 위에서 두세 줄만 보여준다.
    order = {"high": 0, "medium": 1, "low": 2}
    concerns.sort(key=lambda concern: order[concern.severity])

    score = max(0, min(100, round(100 - penalty)))
    return FitScore(score=score, level=_level(score), concerns=concerns)
