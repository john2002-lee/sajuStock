"""진태양시 합성. 순수 계산 — I/O 없음, 현재 시각에 의존하지 않는다.

`year`/`month`/`day` 는 **언제나 양력**이다. 원래 입력이 음력이었다면 양력 변환은
호출자의 책임이고 이 함수를 부르기 **전에** 끝나 있어야 한다 — 그러지 않으면
서머타임·자오선·균시차를 엉뚱한 달력 날짜로 조회하게 된다(`engine.py` 참고).

합성 순서(스펙):

  1. 벽시계 시각(시·분)을 분으로 환산해 시작한다
  2. 그 시각에 서머타임이 걸리면 60분을 뺀다
  3. 경도 보정을 더한다: (경도 − 표준자오선) × 4
  4. 그 날짜의 균시차를 더한다
  5. 0..1439 로 정규화하고, 넘친 만큼을 `day_offset` 으로 낸다

반올림 규칙: 위 합계는 **소수 분** 그대로 누적했다가 **맨 끝에서 한 번만**
반올림한다(이중 반올림 금지 — 경도 보정과 균시차를 각각 반올림해서 더하지 않는다).
다만 `detail` 의 `longitude_minutes`/`equation_minutes` 는 그 두 성분을 반올림한
정수다. 표시·감사 전용이며 계산에 되먹임되지 않는다.

정규화: `day_offset` 을 −1/0/+1 로 clamp 하지 않는다. 한국 경도와 KST 자오선
조합에서는 실제로 그 셋 중 하나만 나오지만, `birth_place_code`/경도가 한국으로
제한되어 있지는 않아 자오선에서 멀리 떨어진 해외 경도는 하루를 넘길 수 있다.
그래서 `divmod` 기반으로 어느 방향 몇 일이든 일관되게 푼다.
"""

from dataclasses import dataclass

from app.domain.saju.equation_of_time import equation_of_time
from app.domain.saju.korean_time import is_dst, standard_meridian

MINUTES_PER_DAY = 1440


@dataclass(frozen=True)
class TrueSolarDetail:
    meridian: float
    dst_applied: bool
    #: 반올림된 경도 보정(분). 표시·감사 전용.
    longitude_minutes: int
    #: 반올림된 균시차(분). 표시·감사 전용.
    equation_minutes: int


@dataclass(frozen=True)
class TrueSolarTime:
    hour: int
    minute: int
    #: 입력 날짜 대비 일 단위 이월(음수 가능). 모듈 주석 참고.
    day_offset: int
    detail: TrueSolarDetail


def _round_half_up(value: float) -> int:
    """JS `Math.round` 와 같은 규칙 — .5 는 항상 위로.

    파이썬 내장 `round` 는 은행가 반올림(.5 를 짝수로)이라 원본과 갈린다.
    `round(0.5)` 는 0, `round(1.5)` 는 2 인데 JS 는 1 과 2 다. 여기서 어긋나면
    보정 결과가 1분씩 달라지고, 자정 근처 출생은 그 1분에 일주가 바뀐다.
    """
    from math import floor

    return floor(value + 0.5)


def to_true_solar_time(
    year: int, month: int, day: int, hour: int, minute: int, longitude: float
) -> TrueSolarTime:
    meridian = standard_meridian(year, month, day)
    dst_applied = is_dst(year, month, day, hour)
    longitude_raw = (longitude - meridian) * 4
    equation_raw = equation_of_time(year, month, day)

    # 하나의 소수 합계로 누적한다 — 성분별로 미리 반올림하지 않는다(모듈 주석).
    total = float(hour * 60 + minute)
    if dst_applied:
        total -= 60
    total += longitude_raw
    total += equation_raw

    # 정확히 한 번 반올림한다. 정규화는 MINUTES_PER_DAY 의 정수배를 더하고 빼는
    # 것뿐이라 반올림과 교환 가능하므로, 반올림 후에 나눠도 결과가 같다.
    rounded = _round_half_up(total)

    # `divmod` 는 음수에서도 몫을 내림(floor)하고 나머지를 음이 아닌 값으로 준다 —
    # JS 의 `%` 가 음수를 그대로 돌려주는 함정을 피하려고 원본이 손으로 짠 계산과
    # 같은 결과다. 1440 정각도 여기서 자연히 day_offset+1, 0분으로 풀린다.
    day_offset, minute_of_day = divmod(rounded, MINUTES_PER_DAY)

    return TrueSolarTime(
        hour=minute_of_day // 60,
        minute=minute_of_day % 60,
        day_offset=day_offset,
        detail=TrueSolarDetail(
            meridian=meridian,
            dst_applied=dst_applied,
            longitude_minutes=_round_half_up(longitude_raw),
            equation_minutes=_round_half_up(equation_raw),
        ),
    )
