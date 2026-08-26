"""사주 엔진의 핵심 도메인 타입. 순수 선언 — I/O 없음.

원본 `SajuService/src/lib/saju/types.ts` 를 옮긴 것이다. TypeScript 의 구조적
인터페이스를 파이썬에서는 `dataclass` 로 둔다 — Pydantic 모델이 아닌 이유는
이 계층이 **스키마 계층을 모르기** 때문이다(`api → services → domain` 방향).
HTTP 경계의 검증은 `schemas/saju.py` 가 하고, 여기 있는 것은 계산의 재료다.
"""

from dataclasses import dataclass
from typing import Literal

Gender = Literal["M", "F"]


@dataclass(frozen=True)
class SajuInput:
    """사용자가 준 출생 정보 원본.

    `year`/`month`/`day` 의 해석은 `is_lunar` 를 따른다 — 참이면 음력 값이고
    (엔진이 양력으로 변환한 뒤 진태양시 보정을 건다), 거짓이면 이미 양력이다.
    변환이 **먼저**여야 하는 이유는 `true_solar_time` 모듈 주석에 있다.
    """

    year: int
    month: int
    day: int
    hour: int | None
    minute: int | None
    is_lunar: bool
    is_leap_month: bool
    gender: Gender
    birth_place_code: str


@dataclass(frozen=True)
class Pillar:
    """천간·지지 한 쌍(기둥)."""

    gan: str
    zhi: str


@dataclass(frozen=True)
class Conventions:
    """이 차트에 실제로 적용된 계산 관례.

    감사·재현을 위해 기록한다 — 같은 생년월일시라도 자시 관례나 표준자오선이
    바뀌면 다른 차트가 나오므로, 결과만 저장하면 나중에 왜 그 값이었는지 알 수 없다.
    """

    zi_hour_sect: Literal[1, 2]
    strength_algorithm_version: str
    standard_meridian: float
    dst_applied: bool
    #: 경도 보정(분). 반올림된 정수 — 표시·감사 전용이고 계산에는 쓰이지 않는다.
    longitude_correction_minutes: int
    #: 균시차(분). 위와 같다.
    equation_of_time_minutes: int
