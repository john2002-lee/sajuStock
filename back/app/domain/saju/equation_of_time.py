"""균시차(분). 순수 계산 — I/O 없음, 현재 시각에 의존하지 않는다.

NOAA 정밀식이 아니라 널리 쓰이는 조화 근사식이다.

    EoT = 9.87·sin(2B) − 7.53·cos(B) − 1.5·sin(B),   B = 2π(n−81)/364

`n` 은 1부터 세는 연중 일수다. 분모 364 는 **윤년 항이 아니라 이 근사식 자체의
상수**다 — 윤년은 `day_of_year` 가 따로 처리한다. 연중 오차는 대략 ±0.5분이고
이 제품에는 충분하다.

출처: https://en.wikipedia.org/wiki/Equation_of_time (approximation 절)
"""

import math

_DAYS_IN_MONTH = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)


def _is_leap_year(year: int) -> bool:
    return (year % 4 == 0 and year % 100 != 0) or year % 400 == 0


def day_of_year(year: int, month: int, day: int) -> int:
    """1부터 세는 연중 일수(1 = 1월 1일). 윤년을 반영한다."""
    total = day
    for index in range(month - 1):
        total += 29 if (index == 1 and _is_leap_year(year)) else _DAYS_IN_MONTH[index]
    return total


def equation_of_time(year: int, month: int, day: int) -> float:
    n = day_of_year(year, month, day)
    b = (2 * math.pi * (n - 81)) / 364
    return 9.87 * math.sin(2 * b) - 7.53 * math.cos(b) - 1.5 * math.sin(b)
