"""대운(10년 운) · 세운(연운) — 스펙 §8.5.

`engine.py` 의 `build_solar_and_eight_char` 가 이미 만든 `EightChar`/`Yun` 객체
위의 순수 계산이다. I/O 없음, 네트워크 없음, **현재 시각 의존 없음** —
`now_year` 는 매개변수이며 시스템 시계에서 읽지 않는다.

라이브러리 사실(원본 프로젝트가 `lunar-javascript@1.7.7` 로 실측, 파이썬 포팅본
`lunar-python` 도 동일):

- `ec.getYun(gender)` 는 남자 1, 여자 0 을 받는다.
- `yun.getDaYun()` 은 10개를 돌려준다. **첫 항목의 간지는 빈 문자열이다** —
  출생부터 대운 시작 전까지의 구간이지 실제 대운이 아니다. 아래에서 걸러 낸다
  (스펙 §8.5: "첫 항목 제외").
- 세운의 연 경계: `EightChar` 의 년주(그리고 `getLiuNian()` 의 연도별 간지)는 이미
  **입춘**을 경계로 쓴다. 양력 1/1 도, 음력설도 아니다. 라이브러리가 이미 맞게
  하고 있으므로 여기서 보정을 **추가하지 않는다** — 덧붙이면 중복이고, 없던 버그를
  만들 위험만 있다.

원본: `SajuService/src/lib/saju/luck.ts`.
"""

from dataclasses import dataclass
from typing import Any

from app.domain.saju.cnko import SHISHEN_KO, to_ko
from app.domain.saju.ganzhi import (
    GAN_WUXING,
    GAN_YINYANG,
    WUXING_GENERATES,
    WUXING_OVERCOMES,
    ganzhi_to_hangul,
)
from app.domain.saju.types import Gender


@dataclass(frozen=True)
class DaYunEntry:
    """대운 한 구간."""

    #: **세는나이**. 출생 연도가 1살이므로 `start_year - birth_year + 1` 이다 —
    #: 생일 기준이 아니라 달력 연도 차이다. `lunar-python` 의 `DaYun` 에서 그대로
    #: 물려받았고, 한국 사주 독자가 대운 나이에 기대하는 것이 세는나이라 유지한다.
    #:
    #: 따라서 이것은 만 나이가 **아니며** 만 나이로 "고쳐서는" 안 된다: 둘은 생일에
    #: 따라 1~2년 차이가 나고, 그만큼 리포트가 말하는 모든 대운 경계가 밀린다.
    start_age: int
    start_year: int
    gan_zhi: str
    hangul: str
    #: 일간 대비 십신(한글).
    shi_shen: str


@dataclass(frozen=True)
class SeUnEntry:
    year: int
    gan_zhi: str
    hangul: str


@dataclass(frozen=True)
class LuckResult:
    forward: bool
    start_age: int
    da_yun: list[DaYunEntry]
    current_da_yun: DaYunEntry | None
    se_un: list[SeUnEntry]
    #: 이 결과가 "지금"으로 삼은 해 — 넘겨받은 `now_year` 를 그대로 보관한다.
    #:
    #: `current_da_yun` 은 이것이 없으면 근거 없는 주장이 된다: **언제 기준으로**
    #: 현재인가? "올해"를 말해야 하는 모든 소비자가 답을 필요로 하고, 답이 없던
    #: 소비자는 추측했다. 리포트 프롬프트에 연도가 아예 없어서 모델이 학습 분포에서
    #: 연도를 골라 왔고, 2026년 8월에 생성된 리포트에 "올해 2024년은 갑진년"이
    #: 적혔다(출시 전 테스트 리포트에서 발견, 실제 손님은 본 적 없다).
    #:
    #: 소비자가 각자 현재 시각을 읽는 대신 여기 실어 나르는 것이 이 모듈의
    #: "시계 없음" 보장을 지킨다 — 무엇이 "지금"인지는 호출자가 한 번 정한다.
    now_year: int


def _gan_shi_shen(dm_gan: str, other_gan: str) -> str:
    """일간 `dm_gan` 에서 본 천간 `other_gan` 의 십신(한자. `to_ko` 로 번역해 쓴다)."""
    dm_wuxing = GAN_WUXING.get(dm_gan)
    other_wuxing = GAN_WUXING.get(other_gan)
    if dm_wuxing is None:
        raise ValueError(f'_gan_shi_shen: 매핑되지 않은 일간 "{dm_gan}"')
    if other_wuxing is None:
        raise ValueError(f'_gan_shi_shen: 매핑되지 않은 천간 "{other_gan}"')

    same_yin_yang = GAN_YINYANG[dm_gan] == GAN_YINYANG[other_gan]

    if other_wuxing == dm_wuxing:
        return "比肩" if same_yin_yang else "劫财"
    if WUXING_GENERATES[dm_wuxing] == other_wuxing:  # 일간이 상대를 생함
        return "食神" if same_yin_yang else "伤官"
    if WUXING_OVERCOMES[dm_wuxing] == other_wuxing:  # 일간이 상대를 극함
        return "偏财" if same_yin_yang else "正财"
    if WUXING_OVERCOMES[other_wuxing] == dm_wuxing:  # 상대가 일간을 극함
        return "七杀" if same_yin_yang else "正官"
    if WUXING_GENERATES[other_wuxing] == dm_wuxing:  # 상대가 일간을 생함
        return "偏印" if same_yin_yang else "正印"
    raise ValueError(f'_gan_shi_shen: 관계없는 오행 "{dm_wuxing}" / "{other_wuxing}"')


def compute_luck(ec_true_solar: Any, ec_term: Any, gender: Gender, now_year: int) -> LuckResult:
    """차트의 대운·세운을 계산한다.

    **EightChar 두 벌을 일부러 받는다.** `ec_true_solar` 는 일간을 준다(대운 십신을
    그 기준으로 읽고, 일주는 진태양시 값이다). `ec_term` 은 `getYun()` 을 통해 대운
    방향과 대운수를 준다 — 그 계산이 내부적으로 인접한 절까지의 거리를 라이브러리의
    **UTC+8 절기표**에 대고 재기 때문에, 한국 진태양시 객체가 아니라 베이징 프레임
    객체를 줘야 한다. 진태양시 객체를 넘기면 모든 절입 경계가 13~74분 어긋나고,
    입춘을 사이에 둔 출생은 년간의 음양이 뒤집히면서 **10년 운의 순서가 통째로
    역전된다**.
    """
    day_master_gan = ec_true_solar.getDayGan()
    yun = ec_term.getYun(1 if gender == "M" else 0)
    forward = bool(yun.isForward())

    # 첫 항목은 빈 간지("")로, 출생부터 대운 시작 전까지의 구간을 나타낸다 —
    # 실제 대운이 아니므로 제외한다(스펙 §8.5).
    real_da_yun = [d for d in yun.getDaYun() if d.getGanZhi() != ""]
    if not real_da_yun:
        raise ValueError("compute_luck: 빈 항목을 걸러내니 실제 대운이 하나도 남지 않았습니다")

    da_yun: list[DaYunEntry] = []
    for entry in real_da_yun:
        gan_zhi = entry.getGanZhi()
        da_yun.append(
            DaYunEntry(
                start_age=entry.getStartAge(),
                start_year=entry.getStartYear(),
                gan_zhi=gan_zhi,
                hangul=ganzhi_to_hangul(gan_zhi[0], gan_zhi[1]),
                shi_shen=to_ko(SHISHEN_KO, _gan_shi_shen(day_master_gan, gan_zhi[0])),
            )
        )

    # `da_yun` 은 `start_year` 오름차순이다. 지금을 덮는 구간은 **이미 시작한 것 중
    # 마지막**이다. `now_year` 가 첫 실제 대운보다 앞서면 None 이다(걸러 낸 빈 항목이
    # 나타내던 대운 이전 구간에 아직 있다는 뜻).
    current_da_yun: DaYunEntry | None = None
    for entry in da_yun:
        if entry.start_year <= now_year:
            current_da_yun = entry

    se_un: list[SeUnEntry] = []
    for entry in real_da_yun:
        for liu_nian in entry.getLiuNian():
            gan_zhi = liu_nian.getGanZhi()
            se_un.append(
                SeUnEntry(
                    year=liu_nian.getYear(),
                    gan_zhi=gan_zhi,
                    hangul=ganzhi_to_hangul(gan_zhi[0], gan_zhi[1]),
                )
            )

    return LuckResult(
        forward=forward,
        start_age=da_yun[0].start_age,
        da_yun=da_yun,
        current_da_yun=current_da_yun,
        se_un=se_un,
        now_year=now_year,
    )
