"""대조 검증용 무작위 표본을 만든다.

`saju_cases.json` 의 손으로 고른 경계 케이스가 **아는 함정**을 덮는다면, 이쪽은
**모르는 함정**을 찾는다. 28건이 맞았다는 것과 엔진이 맞다는 것은 다른 말이라,
넓은 무작위 표본에서도 두 구현이 갈리지 않는지 본다.

씨앗을 고정해 재현 가능하게 둔다 — 실패가 나왔을 때 같은 표본을 다시 만들 수 있어야
한다.

사용: `uv run python tests/gen_random_cases.py 1000 > cases_random.json`
"""

import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.domain.saju.places import BIRTH_PLACES

SEED = 20260825
#: 제품이 받는 하한(EARLIEST_ACCEPTED)과 넉넉한 상한.
MIN_YEAR = 1920
MAX_YEAR = 2024

_DAYS_IN_MONTH = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)


def _is_leap(year: int) -> bool:
    return (year % 4 == 0 and year % 100 != 0) or year % 400 == 0


def _max_day(year: int, month: int) -> int:
    if month == 2 and _is_leap(year):
        return 29
    return _DAYS_IN_MONTH[month - 1]


def main() -> None:
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    rng = random.Random(SEED)
    places = [p.code for p in BIRTH_PLACES]

    cases = []
    for _ in range(count):
        year = rng.randint(MIN_YEAR, MAX_YEAR)
        month = rng.randint(1, 12)
        # 음력은 달의 길이가 달라 29일까지만 쓴다 — 존재하지 않는 날짜를 만들면
        # 라이브러리가 예외를 던지고, 그것은 여기서 보려는 것이 아니다.
        is_lunar = rng.random() < 0.25
        day = rng.randint(1, 29 if is_lunar else _max_day(year, month))

        # 시각 미상을 10% 섞는다 — 시주 없는 경로도 함께 검증한다.
        if rng.random() < 0.10:
            hour = None
            minute = None
        else:
            # 자정·자시 경계에 표본을 더 준다. 날짜 이월과 자시 관례가 갈리는 곳이라
            # 균등 추출만으로는 얇게 덮인다.
            if rng.random() < 0.30:
                hour = rng.choice([22, 23, 0, 1])
            else:
                hour = rng.randint(0, 23)
            minute = rng.randint(0, 59)

        cases.append(
            {
                "year": year,
                "month": month,
                "day": day,
                "hour": hour,
                "minute": minute,
                "isLunar": is_lunar,
                # 윤달은 그 해에 실재해야 하므로 무작위로 켜지 않는다 — 검증하려는
                # 것은 엔진의 일치이지 입력 검증이 아니다(그쪽은 별도 테스트다).
                "isLeapMonth": False,
                "gender": rng.choice(["M", "F"]),
                "birthPlaceCode": rng.choice(places),
            }
        )

    json.dump(
        {"nowYear": 2026, "note": f"무작위 표본 {count}건 (seed={SEED})", "cases": cases},
        sys.stdout,
        ensure_ascii=False,
    )


if __name__ == "__main__":
    main()
