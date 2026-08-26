"""포팅한 파이썬 엔진으로 표본 차트를 덤프한다 (대조 검증용).

원본 TypeScript 엔진의 같은 표본 덤프(`dump_ts_charts.ts`)와 **바이트 단위로 같은
JSON** 이 나와야 한다. 포팅이 맞다는 것을 사람의 눈이 아니라 diff 가 말하게 하는 것이
목적이다 — 사주 계산은 틀려도 그럴듯해 보이기 때문에 육안 검토로는 잡히지 않는다.

사용: `uv run python tests/dump_python_charts.py > /tmp/py.json`
"""

import json
import sys
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.domain.saju.engine import build_solar_and_eight_char, compute_chart
from app.domain.saju.luck import compute_luck
from app.domain.saju.places import longitude_of
from app.domain.saju.strength import judge_strength
from app.domain.saju.teaser import build_teaser
from app.domain.saju.types import SajuInput
from tests.saju_cases import CASES, NOW_YEAR


def main() -> None:
    out = []
    for case in CASES:
        saju_input = SajuInput(**case)
        longitude = longitude_of(saju_input.birth_place_code)
        assert longitude is not None, case["birth_place_code"]

        chart = compute_chart(saju_input, longitude)
        strength = judge_strength(chart)
        teaser = build_teaser(chart, strength)
        built = build_solar_and_eight_char(saju_input, longitude)
        luck = compute_luck(built.ec, built.ec_term, saju_input.gender, NOW_YEAR)

        out.append(
            {
                "input": case,
                "chart": {
                    "year": asdict(chart.year),
                    "month": asdict(chart.month),
                    "day": asdict(chart.day),
                    "hour": asdict(chart.hour) if chart.hour else None,
                    "dayMaster": chart.day_master,
                    "dayMasterHangul": chart.day_master_hangul,
                    "visibleWuxing": chart.visible_wuxing,
                    "solarDate": list(chart.solar_date),
                    "conventions": asdict(chart.conventions),
                },
                "strength": {
                    "verdict": strength.verdict,
                    "score": strength.score,
                    "basis": asdict(strength.basis),
                    "algorithmVersion": strength.algorithm_version,
                },
                "teaser": asdict(teaser),
                "luck": {
                    "forward": luck.forward,
                    "startAge": luck.start_age,
                    "daYun": [asdict(d) for d in luck.da_yun],
                    "currentDaYun": asdict(luck.current_da_yun) if luck.current_da_yun else None,
                    "seUn": [asdict(s) for s in luck.se_un],
                    "nowYear": luck.now_year,
                },
            }
        )

    json.dump(out, sys.stdout, ensure_ascii=False, indent=1, sort_keys=True)


if __name__ == "__main__":
    main()
