"""숫자 정규화 · 포맷 순수 함수. 외부 의존성 없음."""

import math
from typing import Any


def number_or_none(value: Any, digits: int = 2) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    if math.isnan(number):
        return None

    return round(number, digits)


def int_or_none(value: Any) -> int | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    if math.isnan(number):
        return None

    return int(number)


def is_number(value: Any) -> bool:
    # `bool` 은 `int` 의 서브클래스라 `isinstance(True, int | float)` 가 참이다 —
    # 먼저 걸러내지 않으면 True/False 가 숫자로 둔갑해 산술에 0/1 로 섞여 들어간다.
    return (
        value is not None
        and not isinstance(value, bool)
        and isinstance(value, int | float)
        and not math.isnan(value)
    )


def percent_change(start_value: Any, end_value: Any) -> float | None:
    if not is_number(start_value) or not is_number(end_value) or start_value == 0:
        return None

    return round(((end_value - start_value) / start_value) * 100, 2)


def format_compact_number(value: Any) -> str:
    number = number_or_none(value)
    if number is None:
        return "-"

    return f"{number:,.2f}".rstrip("0").rstrip(".")


def format_percent(value: Any) -> str:
    if not is_number(value):
        return "-"

    return f"{value:+.2f}%"
