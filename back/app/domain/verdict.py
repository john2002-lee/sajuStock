"""시장 판단 × 적합도 결합 (사주 통합 계획 5.5). 순수 함수 — I/O 없음.

**단방향 보정 원칙: 적합도는 판단을 보수적인 방향으로만 움직인다.**

이 결합을 LLM에 맡기지 않는 이유가 넷 있다. 같은 입력이면 같은 출력이라 시연에서
다시 돌려 보일 수 있고("재현"), "이 답이 왜 나왔나"에 규칙을 그대로 제시할 수 있고
("감사"), 네트워크 없이 테스트할 수 있고, 호출 비용이 0이다.

세로로 읽으면 원칙이 보인다 — 적합도가 아무리 높아도 `AVOID` 가 `BUY` 로 올라가지
않는다. 프로파일은 브레이크지 액셀이 아니다.

|  | 적합도 높음 | 적합도 보통 | 적합도 낮음 |
|---|---|---|---|
| `BUY` | 매수 검토 | 분할 매수 | **관망** |
| `WATCH` | 관망 | 관망 | **비대상** |
| `AVOID` | 매수 보류 | 매수 보류 | 매수 보류 |

보유자용 축(`ADD`/`HOLD`/`TRIM`/`EXIT`)은 요청 스키마에 `position` 이 생긴 뒤에
같은 표에 붙인다 (계획 6절). 지금은 매수 판단 3종만 다룬다.
"""

from app.domain.fit import AXIS_CHASE, AXIS_HORIZON, AXIS_TIMING, AXIS_VOLATILITY
from app.schemas.advice import InvestmentDecision, PersonalVerdict, Verdict
from app.schemas.profile import FitLevel, FitScore

# 보수성 순위 — 클수록 보수적. 단방향 보정의 판정 기준이다.
_CONSERVATISM: dict[Verdict, int] = {"BUY": 0, "WATCH": 1, "AVOID": 2}

# (시장 판단, 적합도 등급) → (최종 판단, 화면 라벨).
_COMBINED: dict[tuple[Verdict, FitLevel], tuple[Verdict, str]] = {
    ("BUY", "high"): ("BUY", "매수 검토"),
    ("BUY", "medium"): ("BUY", "분할 매수"),
    ("BUY", "low"): ("WATCH", "관망"),
    ("WATCH", "high"): ("WATCH", "관망"),
    ("WATCH", "medium"): ("WATCH", "관망"),
    ("WATCH", "low"): ("AVOID", "비대상"),
    ("AVOID", "high"): ("AVOID", "매수 보류"),
    ("AVOID", "medium"): ("AVOID", "매수 보류"),
    ("AVOID", "low"): ("AVOID", "매수 보류"),
}

# 우려 축 → "그래도 사겠다면" 문장. 막지 않고 방법을 준다 (계획 5.6).
_GUARDRAILS: dict[str, str] = {
    AXIS_VOLATILITY: "평소 넣던 금액의 1/3로 시작하고, 손절선을 진입 전에 정해 두세요.",
    AXIS_CHASE: "지금 전량 담지 말고 눌림목을 기다려 2~3회로 나눠 진입하세요.",
    AXIS_HORIZON: "보유 기간을 미리 정하고, 그 기간 안에서만 판단하세요.",
    AXIS_TIMING: "급등 당일 진입을 피하고 다음 거래일 흐름을 확인한 뒤 들어가세요.",
}


def combine(market: InvestmentDecision, fit: FitScore) -> PersonalVerdict:
    """시장 판단을 적합도로 보정한다. 결과는 절대 더 공격적이지 않다.

    적합도를 계산할 지표가 없었으면(`insufficient_data`) 보정하지 않고 시장 판단을
    그대로 통과시킨다. 근거 없이 내린 100점으로 "잘 맞습니다"를 만들어내면, 데이터가
    없다는 사실이 오히려 긍정 신호로 뒤집힌다.
    """
    if fit.insufficient_data:
        return PersonalVerdict(
            market_verdict=market.verdict,
            market_confidence=market.confidence,
            fit_score=fit.score,
            fit_level=fit.level,
            verdict=market.verdict,
            label=market.decision_label,
            adjusted=False,
            concerns=[],
            guardrails=[],
        )

    verdict, label = _COMBINED[(market.verdict, fit.level)]

    # 표를 잘못 고쳐 상향이 생기면 여기서 즉시 걸린다. 표와 원칙을 한곳에서 묶어
    # 두지 않으면, 나중에 한 칸만 바꿔도 원칙이 조용히 깨진다.
    if _CONSERVATISM[verdict] < _CONSERVATISM[market.verdict]:
        raise ValueError(f"단방향 보정 위반: {market.verdict} → {verdict} (적합도 {fit.level})")

    adjusted = verdict != market.verdict
    return PersonalVerdict(
        market_verdict=market.verdict,
        market_confidence=market.confidence,
        fit_score=fit.score,
        fit_level=fit.level,
        verdict=verdict,
        label=label,
        adjusted=adjusted,
        concerns=fit.concerns,
        guardrails=_guardrails_for(fit),
    )


def _guardrails_for(fit: FitScore) -> list[str]:
    """우려가 있는 축에 대해서만, 축 순서를 유지해 중복 없이 만든다."""
    lines: list[str] = []
    for concern in fit.concerns:
        line = _GUARDRAILS.get(concern.axis)
        if line and line not in lines:
            lines.append(line)
    return lines
