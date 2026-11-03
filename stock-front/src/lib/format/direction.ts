// 등락 방향 → 색·기호. 국내 관례로 상승 빨강 / 하락 파랑.
//
// 이 파일이 색 분기의 유일한 소유자다. 컴포넌트에서 value > 0 ? "text-up" : ... 를
// 다시 쓰지 말 것 — 글로벌 사용자용 색 반전 토글이 생기면 여기만 고치면 된다.

export type Direction = "up" | "down" | "flat";

export function direction(value: number): Direction {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

/** ▲ / ▼ / — */
export function directionGlyph(value: number): string {
  const d = direction(value);
  return d === "up" ? "▲" : d === "down" ? "▼" : "—";
}

/**
 * 방향 → 색 클래스. `inverted` 는 반전 배경(bg-ink) 위에서 쓴다.
 *
 * 숫자를 손에 들고 있으면 `deltaColorClass` 를 쓴다. 이 함수는 **이미 방향으로
 * 좁혀진 값**(백엔드가 `accent: "up" | "down"` 으로 내려주는 지표 등)을 위한
 * 입구다 — 그런 자리가 `accent === "up" ? "text-up" : ...` 삼항을 각자 다시
 * 쓰면서 이 파일이 색 분기의 유일한 소유자라는 약속이 두 군데서 깨져 있었다
 * (`StatRow` · 콘솔 `MetricGrid`). 게다가 둘의 보합 처리가 서로 달랐다.
 */
export function directionColorClass(d: Direction, inverted = false): string {
  if (d === "flat") return inverted ? "text-on-ink-75" : "text-muted-60";
  if (inverted) return d === "up" ? "text-up-on-ink" : "text-down-on-ink";
  return d === "up" ? "text-up" : "text-down";
}

/**
 * 등락 색 클래스. `inverted` 는 반전 배경(bg-ink) 위에서 쓴다.
 * Delta·StatRow 프리미티브 안에서만 호출한다.
 */
export function deltaColorClass(value: number, inverted = false): string {
  return directionColorClass(direction(value), inverted);
}

// 등락 **배경** 색(deltaBgClass)은 업종 등락 막대가 유일한 사용처였고 그 블록을
// 걷어내면서 함께 지웠다. 면을 칠하는 자리가 다시 생기면 여기에 되살린다 —
// 컴포넌트에서 `value > 0 ? "bg-up" : "bg-down"` 를 직접 쓰면 보합(0)이 하락으로
// 칠해져 바로 옆 숫자(deltaColorClass 는 0 을 muted 로 준다)와 색이 어긋난다.
