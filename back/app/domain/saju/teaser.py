"""규칙 기반 무료 요약(티저). 결제 전에 보이므로 결정론적이고 비용이 0이어야 한다 —
이미 만들어진 `SajuChart`/`StrengthVerdict` 위의 순수 계산이고, **LLM 호출이 없다.**

세 가지 표현 보증이 하중을 받는다(각각 원본 프로젝트의 리뷰에서 강제된 것이다).
모든 차트에 대해 성립해야 한다.

1. **여섯 글자 대 여덟 글자.** 출생 시각을 모르면 시주가 없어 **여섯 글자**뿐이다.
   요약은 "여섯 글자"라고 말해야 하고 "여덟 글자"라고 말해서는 안 되며, 빠진 기둥이
   시주임을 밝혀야 한다. 시각을 알면 여덟이다.
2. **빈도는 강약이 아니다.** `chart.visible_wuxing` 은 가중치 없는 단순 집계이며
   (`ganzhi.count_visible_wuxing` 주석) 신강/신약 판정으로 제시되어서는 안 된다.
   그래서 빈도 문장과 강약 문장을 **따로** 만든다 — 빈도 문장에는 신강/신약/중화가
   절대 들어가지 않는다.
3. **용신 없음.** 제품 범위 밖이며(`strength.py` 주석) 티저 어디에도 나오지 않는다.

강약의 **판정**은 인용해도 되지만 그 **근거**(`StrengthVerdict.basis.detail`)는
유료 리포트의 내용이라 이 모듈이 일부러 읽지 않는다.

원본: `SajuService/src/lib/saju/teaser.ts`.
"""

from dataclasses import dataclass
from typing import Literal

from app.domain.saju.engine import SajuChart
from app.domain.saju.ganzhi import WUXING_ORDER
from app.domain.saju.strength import StrengthVerdict


@dataclass(frozen=True)
class Teaser:
    #: 존재하는 기둥의 한글 독음. 년·월·일(·시) 순서.
    pillars_hangul: list[str]
    char_count: Literal[6, 8]
    day_master_hangul: str
    visible_wuxing: dict[str, int]
    strength_verdict: str
    #: 문장은 마침표로 끝난다 — 호출부·테스트가 빈도 문장과 강약 문장을 분리해
    #: 검사할 수 있게 하기 위해서다(위 보증 2).
    summary: str


def _pillars_sentence(chart: SajuChart, has_hour: bool) -> str:
    year, month, day = chart.year.hangul, chart.month.hangul, chart.day.hangul
    if has_hour:
        hour = chart.hour.hangul  # type: ignore[union-attr]  # has_hour 가 보장한다
        return (
            f"연주 {year}, 월주 {month}, 일주 {day}, 시주 {hour}까지 모두 확인되어 "
            "총 여덟 글자로 사주를 구성합니다."
        )
    return (
        f"연주 {year}, 월주 {month}, 일주 {day}까지 확인되며, "
        "태어난 시각 정보가 없어 시주를 제외한 여섯 글자로 사주를 구성합니다."
    )


def _day_master_sentence(chart: SajuChart) -> str:
    return f"일간(日干)은 '{chart.day_master_hangul}'입니다."


def _frequency_sentence(visible_wuxing: dict[str, int]) -> str:
    """드러난 글자의 단순 집계. **강약 어휘를 쓰지 않는다**(보증 2)."""
    parts = ", ".join(f"{key} {visible_wuxing.get(key, 0)}개" for key in WUXING_ORDER)
    return f"이번 사주에 나타난 오행 글자 빈도는 {parts}입니다."


def _strength_sentence(verdict: str) -> str:
    """강약 **판정만**. 그 근거는 절대 넣지 않는다(유료 리포트의 내용이다)."""
    return f"일간의 힘을 종합적으로 살펴본 결과 이번 사주는 '{verdict}'으로 판단됩니다."


def _closing_sentence() -> str:
    return "보다 자세한 원인 분석과 십신 풀이는 정밀 리포트에서 확인하실 수 있습니다."


def build_teaser(chart: SajuChart, strength: StrengthVerdict) -> Teaser:
    has_hour = chart.hour is not None
    pillars_hangul = [chart.year.hangul, chart.month.hangul, chart.day.hangul]
    if has_hour:
        pillars_hangul.append(chart.hour.hangul)  # type: ignore[union-attr]

    summary = " ".join(
        (
            _pillars_sentence(chart, has_hour),
            _day_master_sentence(chart),
            _frequency_sentence(chart.visible_wuxing),
            _strength_sentence(strength.verdict),
            _closing_sentence(),
        )
    )

    return Teaser(
        pillars_hangul=pillars_hangul,
        char_count=8 if has_hour else 6,
        day_master_hangul=chart.day_master_hangul,
        visible_wuxing=chart.visible_wuxing,
        strength_verdict=strength.verdict,
        summary=summary,
    )
