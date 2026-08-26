"""두 덤프(TS 원본 · 파이썬 포팅본)를 **구조로** 비교한다.

문자열 비교가 아니라 파싱 후 비교인 이유: JS 의 `Number` 는 정수/실수를 구분하지
않아 `135.0` 을 `135` 로 직렬화한다. 그 차이는 계산 결과가 아니라 표기이므로
`135 == 135.0` 로 흡수하고, **그 밖의 모든 차이는 실패로 보고한다.**

사용: `uv run python tests/compare_dumps.py <ts.json> <py.json>`
"""

import json
import sys
from typing import Any


def _norm(value: Any) -> Any:
    """비교 전 정규화. 수치 표기 차이만 흡수하고 값은 건드리지 않는다."""
    if isinstance(value, bool):  # bool 이 int 의 하위형이라 먼저 걸러야 한다
        return value
    if isinstance(value, (int, float)):
        # 정수와 같은 실수는 정수로 본다 (135.0 -> 135). 소수부가 있으면 그대로 둔다.
        return int(value) if float(value).is_integer() else float(value)
    if isinstance(value, list):
        return [_norm(v) for v in value]
    if isinstance(value, dict):
        return {k: _norm(v) for k, v in value.items()}
    return value


def _diff(left: Any, right: Any, path: str, out: list[str]) -> None:
    if isinstance(left, dict) and isinstance(right, dict):
        for key in sorted(set(left) | set(right)):
            if key not in left:
                out.append(f"{path}.{key}: TS 에만 없음 (PY={right[key]!r})")
            elif key not in right:
                out.append(f"{path}.{key}: PY 에만 없음 (TS={left[key]!r})")
            else:
                _diff(left[key], right[key], f"{path}.{key}", out)
        return

    if isinstance(left, list) and isinstance(right, list):
        if len(left) != len(right):
            out.append(f"{path}: 길이 다름 TS={len(left)} PY={len(right)}")
            return
        # 길이는 바로 위에서 이미 확인했으므로 strict=True 가 추가로 던지는 일은 없다.
        for index, (a, b) in enumerate(zip(left, right, strict=True)):
            _diff(a, b, f"{path}[{index}]", out)
        return

    if left != right:
        out.append(f"{path}: TS={left!r} != PY={right!r}")


def main() -> int:
    ts_path, py_path = sys.argv[1], sys.argv[2]
    ts = _norm(json.loads(open(ts_path, encoding="utf-8-sig").read()))
    py = _norm(json.loads(open(py_path, encoding="utf-8-sig").read()))

    out: list[str] = []
    _diff(ts, py, "$", out)

    if not out:
        cases = len(ts) if isinstance(ts, list) else "?"
        print(f"OK — {cases}개 케이스가 완전히 일치합니다 (수치 표기 차이만 정규화).")
        return 0

    print(f"불일치 {len(out)}건:")
    for line in out[:80]:
        print("  " + line)
    if len(out) > 80:
        print(f"  ... 외 {len(out) - 80}건")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
