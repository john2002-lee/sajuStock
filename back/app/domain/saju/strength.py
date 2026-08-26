"""강약(일간의 힘) 판정 — 스펙 §8.4. 순수 계산 — I/O·난수·현재시각 의존 없음.

득령(월지 지원) · 득지(지장간 통근) · 득세(우군 대 설기)의 가중 3요소 점수를
신강/중화/신약으로 threshold 한다.

가중치와 임계값은 전부 이름 붙은 상수다(매직 넘버 없음). 각 요소의 판단 근거는
`basis.detail`(한국어)에 쌓여 유료 리포트가 인용할 수 있다 — 블랙박스가 아니다.

**용신은 명시적으로 범위 밖이며 여기서 절대 계산하지 않는다.**

원본: `SajuService/src/lib/saju/strength.ts`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal

from app.domain.saju.ganzhi import GAN_WUXING, ZHI_WUXING
from app.domain.saju.ganzhi import WUXING_GENERATES as GENERATES
from app.domain.saju.ganzhi import WUXING_OVERCOMES as OVERCOMES

if TYPE_CHECKING:  # pragma: no cover - 순환 import 를 피하기 위한 타입 전용 참조
    from app.domain.saju.engine import PillarDetail, SajuChart

#: 모든 차트의 `conventions.strength_algorithm_version` 에 기록되는 버전 식별자.
ALGORITHM_VERSION = "strength-v1"

# ---------------------------------------------------------------------------
# 가중치·임계값 (스펙 §8.4: "가중치·임계값은 상수")
# ---------------------------------------------------------------------------

#: 득령/실령 — 월지가 일간을 생조하는가.
_WEIGHT_DEUK_RYEONG = 30
#: 득지/실지 — 어느 지지의 지장간으로든 일간이 뿌리내렸는가(통근).
_WEIGHT_DEUK_JI = 20
#: 득세 순점수(우군 − 설기) 1점당 가중치.
_WEIGHT_DEUK_SE_PER_POINT = 5

#: 이상이면 신강.
_THRESHOLD_STRONG = 15
#: 이하면 신약. 둘 사이는 중화.
_THRESHOLD_WEAK = -15

WuxingGroup = Literal["비겁", "인성", "식상", "재성", "관살"]

#: 비겁·인성은 우군(일간을 강하게), 식상·재성·관살은 설기.
_ALLY_GROUPS: frozenset[str] = frozenset({"비겁", "인성"})

Verdict = Literal["신강", "중화", "신약"]


def _wuxing_of_gan(gan: str) -> str:
    """조회 실패를 예외로. `ganzhi.py` 의 fail-fast 규약과 같다.

    매핑되지 않은 글자가 `None` 으로 흘러가면 이하의 모든 비교가 (틀린) 거짓이 되어
    조용히 잘못된 판정이 나온다.
    """
    wuxing = GAN_WUXING.get(gan)
    if wuxing is None:
        raise ValueError(f'judge_strength: 매핑되지 않은 천간 "{gan}"')
    return wuxing


def _wuxing_of_zhi(zhi: str) -> str:
    wuxing = ZHI_WUXING.get(zhi)
    if wuxing is None:
        raise ValueError(f'judge_strength: 매핑되지 않은 지지 "{zhi}"')
    return wuxing


def _classify_wuxing(dm_wuxing: str, other_wuxing: str) -> WuxingGroup:
    """일간 오행 기준으로 상대 오행을 다섯 그룹 중 하나로 분류한다.

    십신을 음양까지 갈라 보는 것의 거친(음양 무관) 판이다 — 강약 집계는 그룹만
    보면 되고 비견/겁재 같은 하위 구분은 필요 없다.
    """
    if other_wuxing == dm_wuxing:
        return "비겁"
    if GENERATES[other_wuxing] == dm_wuxing:
        return "인성"  # 상대가 일간을 생함
    if GENERATES[dm_wuxing] == other_wuxing:
        return "식상"  # 일간이 상대를 생함
    if OVERCOMES[dm_wuxing] == other_wuxing:
        return "재성"  # 일간이 상대를 극함
    if OVERCOMES[other_wuxing] == dm_wuxing:
        return "관살"  # 상대가 일간을 극함
    raise ValueError(f'_classify_wuxing: 관계없는 오행 "{dm_wuxing}" / "{other_wuxing}"')


@dataclass(frozen=True)
class StrengthBasis:
    deuk_ryeong: bool
    deuk_ji: bool
    deuk_se: int
    detail: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class StrengthVerdict:
    verdict: Verdict
    score: int
    basis: StrengthBasis
    algorithm_version: str


def _present_pillars(chart: SajuChart) -> list[PillarDetail]:
    """년·월·일·시 순서로, 존재하는 기둥만."""
    return [p for p in (chart.year, chart.month, chart.day, chart.hour) if p is not None]


def _judge_deuk_ryeong(chart: SajuChart, dm_wuxing: str) -> tuple[bool, str]:
    """득령/실령: 월지의 대표 오행이 일간을 생조하는가(같은 오행이거나 생하는 오행)."""
    month_zhi = chart.month.pillar.zhi
    month_zhi_wuxing = _wuxing_of_zhi(month_zhi)
    deuk_ryeong = month_zhi_wuxing == dm_wuxing or GENERATES[month_zhi_wuxing] == dm_wuxing

    if deuk_ryeong:
        detail = f"득령: 월지 '{month_zhi}'({month_zhi_wuxing})가 일간({dm_wuxing})을 생조함"
    else:
        detail = (
            f"실령: 월지 '{month_zhi}'({month_zhi_wuxing})가 일간({dm_wuxing})을 생조하지 않음"
        )
    return deuk_ryeong, detail


def _judge_deuk_ji(chart: SajuChart, dm_wuxing: str) -> tuple[bool, str]:
    """득지/실지(통근): 어느 지지의 **지장간**에 일간을 받쳐 주는 오행이 있는가.

    여기에 버그가 둘 있었고, 둘 다 문장의 문제였다(원본 `strength.ts` 주석).

    통근은 일간이 **자기와 같은 오행**에 뿌리내리는 것을 뜻한다. `deuk_ji` 의 판정은
    생조하는 오행(인성)도 일부러 받아 주지만 — 그것은 설계 결정이고 점수가 바뀌면
    안 된다 — 그 둘은 **같은 것이 아니며 같은 말로 설명해서는 안 된다**.

    ① 예전 메시지는 무조건 "통근함"이라고 적어, 금 일간에 己(토)만 있는 경우까지
       존재하지 않는 뿌리를 단언했다(득지 164건 중 85건, 51.8%).
    ② 두 경우를 한 번의 검색으로 처리해 지지에서 **먼저 나오는** 글자를 집었고,
       진짜 뿌리가 있어도 건너뛸 수 있었다: 일간 己 에 월지 寅(甲丙戊) 이면 戊 가
       아니라 丙 을 인용했다.

    이 문장은 모듈 밖으로 나간다 — 리포트 프롬프트가 `detail` 을 그대로 주입하고
    모델은 주어진 데이터를 말로 옮기라는 지시를 받으므로, 틀린 용어가 손님이 돈을
    내고 받은 리포트에 그대로 재생산됐다.
    """
    labels = {"year": "년지", "month": "월지", "day": "일지", "hour": "시지"}
    branches = [
        ("year", chart.year),
        ("month", chart.month),
        ("day", chart.day),
        ("hour", chart.hour),
    ]

    for key, pillar in branches:
        if pillar is None:
            continue

        rooted = next((s for s in pillar.hide_gan if _wuxing_of_gan(s) == dm_wuxing), None)
        supporting = next(
            (s for s in pillar.hide_gan if GENERATES[_wuxing_of_gan(s)] == dm_wuxing), None
        )
        stem = rooted if rooted is not None else supporting
        if stem is None:
            continue

        wuxing = _wuxing_of_gan(stem)
        # 부정 쪽 문장은 통근이라는 말을 **아예 쓰지 않는다** — 부정하기 위해서도 쓰지
        # 않는다. 그래야 훑어 읽어도 뿌리를 주장하는 것으로 오독되지 않고, 읽는 사람도
        # (그 문장을 인용하는 모델도) 실제로 참인 것만 본다.
        if rooted is not None:
            relation = f"일간({dm_wuxing})이 통근함"
        else:
            relation = f"일간({dm_wuxing})을 생조함 (일간과 같은 오행은 아니므로 뿌리는 아님)"

        detail = (
            f"득지: {labels[key]}('{pillar.pillar.zhi}') 지장간에 "
            f"'{stem}'({wuxing})가 있어 {relation}"
        )
        return True, detail

    return False, f"실지: 지장간 중 일간({dm_wuxing})을 생조하는 오행 없음"


def _judge_deuk_se(chart: SajuChart, dm_wuxing: str) -> tuple[int, str]:
    """득세/실세: **드러난** 천간·지지에서 우군과 설기를 센다.

    지장간은 득지의 관심사라 여기서는 대표 오행만 본다. 일간 자신의 천간은 제외한다
    (측정 대상이지 지원·설기 세력이 아니다). 일지의 대표 오행은 **센다**.
    """
    allies = 0
    drains = 0

    for pillar in _present_pillars(chart):
        if pillar is not chart.day:
            group = _classify_wuxing(dm_wuxing, _wuxing_of_gan(pillar.pillar.gan))
            if group in _ALLY_GROUPS:
                allies += 1
            else:
                drains += 1

        zhi_group = _classify_wuxing(dm_wuxing, _wuxing_of_zhi(pillar.pillar.zhi))
        if zhi_group in _ALLY_GROUPS:
            allies += 1
        else:
            drains += 1

    net = allies - drains
    detail = f"득세: 비겁·인성(우군) {allies}개 vs 식상·재성·관살(설기) {drains}개 -> 순득세 {net}"
    return net, detail


def judge_strength(chart: SajuChart) -> StrengthVerdict:
    """가중 3요소 점수로 일간의 강약(신강/중화/신약)을 판정한다. 용신은 계산하지 않는다."""
    dm_wuxing = _wuxing_of_gan(chart.day_master)

    deuk_ryeong, ryeong_detail = _judge_deuk_ryeong(chart, dm_wuxing)
    deuk_ji, ji_detail = _judge_deuk_ji(chart, dm_wuxing)
    net_se, se_detail = _judge_deuk_se(chart, dm_wuxing)

    score = (
        (_WEIGHT_DEUK_RYEONG if deuk_ryeong else -_WEIGHT_DEUK_RYEONG)
        + (_WEIGHT_DEUK_JI if deuk_ji else -_WEIGHT_DEUK_JI)
        + net_se * _WEIGHT_DEUK_SE_PER_POINT
    )

    if score >= _THRESHOLD_STRONG:
        verdict: Verdict = "신강"
    elif score <= _THRESHOLD_WEAK:
        verdict = "신약"
    else:
        verdict = "중화"

    return StrengthVerdict(
        verdict=verdict,
        score=score,
        basis=StrengthBasis(
            deuk_ryeong=deuk_ryeong,
            deuk_ji=deuk_ji,
            deuk_se=net_se,
            detail=[ryeong_detail, ji_detail, se_detail],
        ),
        algorithm_version=ALGORITHM_VERSION,
    )
