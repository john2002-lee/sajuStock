"""사주 → 투자 성향 6축 매핑. 순수 함수 — I/O·LLM·네트워크 없음.

**이 파일이 두 프로젝트가 만나는 지점이다.** 통합 기획 5.2 절이 동료(사주 쪽)에게
요구하는 계약은 `InvestorProfile` 의 0~100 숫자 6개뿐이고, 사주 → 숫자 매핑은
사주 도메인의 몫이라고 못박았다. 그 매핑이 여기다.

## 왜 규칙이고 LLM 이 아닌가

`domain/fit.py`·`domain/verdict.py` 와 같은 이유다 — **재현·감사·무비용**.
같은 생년월일시면 언제나 같은 프로파일이 나와야 한다. 심사에서 "이 숫자가 어디서
나왔냐"는 질문을 받으면 규칙을 그대로 펼쳐 보일 수 있어야 하고(기획 5.2:
"매핑 규칙은 반드시 문서로 남긴다. 심사에서 확실히 질문받는 항목이다"),
LLM 을 끼우는 순간 그 답이 "모델이 그렇게 말했습니다"가 된다.

## 이 매핑이 주장하지 않는 것

**사주가 주가를 예측한다고 주장하지 않는다.** 이 함수의 출력은 종목에 대한 정보가
아니라 사람에 대한 **초안**이고, 사용자가 화면에서 고칠 수 있다(기획 3.4). 고치는
순간 `source` 가 `user_edited` 가 되어 근거가 사용자 본인에게 넘어간다.
그리고 어느 쪽이든 프로파일은 `domain/verdict.combine` 의 단방향 보정을 통해서만
판단에 닿으므로 **매수를 만들어내지 못하고 보류시킬 수만 있다**(기획 5.5).

즉 이 매핑이 틀려도 제품은 깨지지 않는다. 그것이 이 설계를 고른 이유다.

## 매핑 근거

명리의 통설적 해석을 그대로 옮기되, **각 축에 기여하는 요소를 하나로 몰지 않는다** —
한 요소가 축을 지배하면 그 요소의 해석이 틀렸을 때 축 전체가 틀린다.

| 축 | 올리는 것 | 내리는 것 |
|---|---|---|
| `risk_appetite` 위험 감수도 | 신강, 화·목 우세, 식상·재성 | 신약, 수·금 우세, 인성 |
| `patience` 보유기간 선호 | 토·금 우세, 인성, 신강 | 화 우세, 식상, 신약 |
| `decisiveness` 결정 속도 | 화 우세, 양간 일간, 식상 | 수·토 우세, 음간 일간, 인성 |
| `loss_aversion` 손실 회피 | 신약, 수 우세, 인성·관살 | 신강, 화 우세, 식상 |
| `herd_tendency` 군중 추종 | 신약, 인성·관살, 음간 일간 | 신강, 비겁, 양간 일간 |

세로로 읽으면 축들이 서로 독립이 아니라는 것이 보인다 — 신강은 위험 감수를 올리고
손실 회피를 내린다. 그것이 의도다. 명리에서 일간의 강약은 실제로 그 두 가지를 같은
방향으로 설명하고, 억지로 직교하게 만들면 원 해석과 멀어진다.

원본 SajuService 에는 이 매핑이 없었다 — 그쪽은 리포트를 팔았지 프로파일을 만들지
않았다. 이 파일은 통합을 위해 **새로 쓴 것**이며, 그래서 여기 근거를 길게 적는다.
"""

from dataclasses import dataclass

from app.domain.saju.engine import SajuChart
from app.domain.saju.ganzhi import GAN_YINYANG, WUXING_ORDER
from app.domain.saju.strength import StrengthVerdict

#: 모든 축의 중립값. 근거가 하나도 없을 때 돌아가는 자리다.
_BASE = 50

# --- 강약 기여 ------------------------------------------------------------
#: 신강/신약이 각 축을 미는 폭. 세 요소 중 **가장 큰 하나**다 — 일간의 강약이
#: 명리 해석에서 실제로 가장 무겁게 쓰이기 때문이다. 다만 단독으로 축을 0 이나 100
#: 으로 보내지는 못하도록 아래 오행·십신 기여와 합쳐도 상한 안에 들게 잡았다.
_STRENGTH_WEIGHT = 18

# --- 오행 편중 기여 --------------------------------------------------------
#: 오행 하나가 "우세"로 인정되는 최소 개수. 여덟 글자(시각 미상이면 여섯) 중
#: 이보다 많이 차지하면 편중으로 본다. 3 인 이유: 8글자 균등이면 축당 1.6개이므로
#: 3개는 이미 평균의 두 배에 가깝고, 2 로 낮추면 거의 모든 사주가 어딘가 "우세"가 된다.
_DOMINANT_MIN_COUNT = 3
#: 우세 오행 하나가 축을 미는 폭.
_WUXING_WEIGHT = 8

# --- 십신 기여 -------------------------------------------------------------
#: 십신 그룹 하나가 원국에 나타난 **횟수당** 축을 미는 폭. 낱개라 가중치가 작다.
_SHISHEN_WEIGHT = 4
#: 십신 기여의 축당 상한. 한 그룹이 많이 나왔다고 축을 혼자 결정하지 못하게 한다.
_SHISHEN_CAP = 12

# --- 일간 음양 기여 --------------------------------------------------------
#: 양간/음간이 결단·군중추종 축을 미는 폭. 가장 거친 신호라 가장 작다.
_YINYANG_WEIGHT = 6

#: 십신을 다섯 그룹으로 묶는다. `strength.py` 의 `_classify_wuxing` 과 같은 구획이되
#: 이쪽은 이미 한글로 계산된 `PillarDetail.shi_shen_gan`/`shi_shen_zhi` 를 읽는다.
_SHISHEN_GROUP: dict[str, str] = {
    "비견": "비겁", "겁재": "비겁",
    "식신": "식상", "상관": "식상",
    "편재": "재성", "정재": "재성",
    "편관": "관살", "정관": "관살",
    "편인": "인성", "정인": "인성",
    # 일간 자신은 그룹에 넣지 않는다 — 측정 대상이지 세력이 아니다.
}


@dataclass(frozen=True)
class ProfileAxes:
    """0~100 으로 정규화된 투자 성향 6축(사실상 5축 + 요약 문장).

    `schemas/profile.InvestorProfile` 과 같은 모양이지만 **여기서 Pydantic 을 쓰지
    않는다** — `domain/` 은 스키마 계층을 모른다(`api → services → domain`).
    변환은 `integrations/saju/mapper.py` 가 한 지점에서 한다.
    """

    risk_appetite: int
    patience: int
    decisiveness: int
    loss_aversion: int
    herd_tendency: int
    saju_summary: str


def _clamp(value: float) -> int:
    """0~100 으로 자르고 정수로. 축은 모두 이 범위여야 한다(Pydantic 이 다시 검증한다)."""
    return max(0, min(100, round(value)))


def _dominant_wuxing(chart: SajuChart) -> list[str]:
    """`_DOMINANT_MIN_COUNT` 이상 나타난 오행. 표시 순서를 유지한다."""
    return [wx for wx in WUXING_ORDER if chart.visible_wuxing.get(wx, 0) >= _DOMINANT_MIN_COUNT]


def _shishen_counts(chart: SajuChart) -> dict[str, int]:
    """원국에 드러난 십신을 그룹별로 센다.

    천간의 십신과 지지(지장간)의 십신을 모두 센다. 지장간까지 세는 이유: 천간만으로는
    한 사주에 십신이 서너 개뿐이라 표본이 너무 얇아 축이 거의 움직이지 않는다.
    """
    counts = dict.fromkeys({"비겁", "식상", "재성", "관살", "인성"}, 0)
    for pillar in (chart.year, chart.month, chart.day, chart.hour):
        if pillar is None:
            continue
        for name in (pillar.shi_shen_gan, *pillar.shi_shen_zhi):
            group = _SHISHEN_GROUP.get(name)
            if group is not None:
                counts[group] += 1
    return counts


def _shishen_push(counts: dict[str, int], *, up: tuple[str, ...], down: tuple[str, ...]) -> float:
    """십신 그룹 기여를 한 축의 증감으로 합산한다. 축당 상한을 건다."""
    raw = sum(counts[g] for g in up) - sum(counts[g] for g in down)
    return max(-_SHISHEN_CAP, min(_SHISHEN_CAP, raw * _SHISHEN_WEIGHT))


def _summary(chart: SajuChart, strength: StrengthVerdict, dominant: list[str]) -> str:
    """프로파일 화면 전용 한 문장.

    **판단 계산에 절대 들어가지 않는다**(기획 5.7). `InvestorProfile.saju_summary`
    로 실려 가지만 `domain/fit.py` 도 `domain/verdict.py` 도 이 필드를 읽지 않고,
    판단 LLM 컨텍스트에도 넣지 않는다 — 그 경계가 통합 기획의 방어 논리 전체를
    떠받친다.
    """
    day_master = chart.day_master_hangul
    if dominant:
        wuxing_part = "·".join(dominant) + " 기운이 도드라지고"
    else:
        wuxing_part = "오행이 비교적 고르고"
    return (
        f"일간이 {day_master}({chart.day_master})이며 {wuxing_part}, "
        f"일간의 힘은 {strength.verdict}입니다."
    )


def to_profile_axes(chart: SajuChart, strength: StrengthVerdict) -> ProfileAxes:
    """사주 원국과 강약 판정을 투자 성향 6축 **초안**으로 바꾼다.

    초안이라는 말이 중요하다 — 사용자가 화면에서 고치고, 고친 값이 저장된다
    (`source` 가 `saju` 에서 `user_edited` 로 바뀐다). 모듈 주석 참고.
    """
    counts = _shishen_counts(chart)
    dominant = _dominant_wuxing(chart)
    is_strong = strength.verdict == "신강"
    is_weak = strength.verdict == "신약"

    #: 신강이면 +, 신약이면 −, 중화면 0. 축마다 부호를 뒤집어 쓴다.
    strength_push = _STRENGTH_WEIGHT if is_strong else (-_STRENGTH_WEIGHT if is_weak else 0)

    #: 우세 오행이 각 축을 미는 방향. 표에 없는 오행은 그 축에 기여하지 않는다.
    def wuxing_push(up: tuple[str, ...], down: tuple[str, ...]) -> float:
        score = 0.0
        for wx in dominant:
            if wx in up:
                score += _WUXING_WEIGHT
            elif wx in down:
                score -= _WUXING_WEIGHT
        return score

    yang_day_master = GAN_YINYANG[chart.day_master] == "양"
    yinyang_push = _YINYANG_WEIGHT if yang_day_master else -_YINYANG_WEIGHT

    risk_appetite = _clamp(
        _BASE
        + strength_push
        + wuxing_push(up=("화", "목"), down=("수", "금"))
        + _shishen_push(counts, up=("식상", "재성"), down=("인성",))
    )
    patience = _clamp(
        _BASE
        + strength_push
        + wuxing_push(up=("토", "금"), down=("화",))
        + _shishen_push(counts, up=("인성",), down=("식상",))
    )
    decisiveness = _clamp(
        _BASE
        + yinyang_push
        + wuxing_push(up=("화",), down=("수", "토"))
        + _shishen_push(counts, up=("식상",), down=("인성",))
    )
    loss_aversion = _clamp(
        _BASE
        - strength_push
        + wuxing_push(up=("수",), down=("화",))
        + _shishen_push(counts, up=("인성", "관살"), down=("식상",))
    )
    herd_tendency = _clamp(
        _BASE
        - strength_push
        - yinyang_push
        + _shishen_push(counts, up=("인성", "관살"), down=("비겁",))
    )

    return ProfileAxes(
        risk_appetite=risk_appetite,
        patience=patience,
        decisiveness=decisiveness,
        loss_aversion=loss_aversion,
        herd_tendency=herd_tendency,
        saju_summary=_summary(chart, strength, dominant),
    )
