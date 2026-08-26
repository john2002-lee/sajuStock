"""대조 검증용 표본을 `saju_cases.json` 에서 읽어 파이썬 쪽 키 이름으로 바꾼다.

JSON 은 원본 TypeScript 의 `SajuInput` 모양(camelCase)을 그대로 쓴다 — 두 엔진이
**같은 파일 하나**를 읽어야 한 쪽에만 케이스를 추가하는 실수가 원천적으로 막힌다.
파이썬 쪽 필드 이름(snake_case)으로의 변환은 여기서 한 번만 한다.
"""

import json
import os
from pathlib import Path

#: 기본은 곁에 있는 경계 케이스 파일이다. `SAJU_CASES_PATH` 로 다른 목록(예:
#: `gen_random_cases.py` 가 만든 무작위 표본)을 가리킬 수 있고, TS 쪽 덤퍼가 **같은
#: 환경변수**를 읽는다 — 두 엔진이 언제나 같은 입력을 본다는 보장이 여기서 나온다.
_PATH = Path(os.environ.get("SAJU_CASES_PATH") or Path(__file__).with_name("saju_cases.json"))

# `utf-8-sig` 는 BOM 이 있으면 벗기고 없으면 그대로 읽는다. Windows PowerShell 의
# `Out-File -Encoding utf8` 이 BOM 을 붙이므로 생성된 표본 파일에서 실제로 걸린다.
_RAW = json.loads(_PATH.read_text(encoding="utf-8-sig"))

NOW_YEAR: int = _RAW["nowYear"]

_KEY_MAP = {
    "year": "year",
    "month": "month",
    "day": "day",
    "hour": "hour",
    "minute": "minute",
    "isLunar": "is_lunar",
    "isLeapMonth": "is_leap_month",
    "gender": "gender",
    "birthPlaceCode": "birth_place_code",
}

#: `SajuInput(**case)` 로 바로 넘길 수 있는 dict 목록. `comment` 는 문서용이라 뺀다.
CASES: list[dict] = [
    {_KEY_MAP[key]: value for key, value in case.items() if key in _KEY_MAP}
    for case in _RAW["cases"]
]
