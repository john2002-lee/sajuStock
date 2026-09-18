import type { Draw } from "./types.ts";

/**
 * `_data/draws.json` 을 읽어 성한 회차만 골라낸다.
 *
 * ## 왜 검증하나
 *
 * 이 파일은 매주 GitHub Actions 가 동행복권 응답으로 갱신한다. 응답 형식이
 * 바뀌거나 갱신이 중간에 끊기면 내용이 이상해질 수 있다. 그때 **빌드가 터지는
 * 대신 성한 회차만 가지고 돌아가야** 한다 — 번호 생성은 데이터가 아예 비어도
 * 유효한 조합을 내도록 만들어 두었다(`generate.ts`).
 *
 * 그래서 여기서는 던지지 않는다. 깨진 항목은 버리고 넘어간다. 진짜 검증은
 * **쓰기 직전**, 갱신 스크립트에서 한다 — 거기서는 검증에 실패하면 파일을 쓰지
 * 않고 종료하므로 직전 스냅샷이 그대로 살아 있다.
 *
 * ## 무엇을 확인하나
 *
 * 로또 티켓으로 성립하는지만 본다: 번호 6개가 **오름차순**, **중복 없음**,
 * **1~45**, 보너스가 범위 안이고 당첨번호와 겹치지 않는 것. 오름차순 검사가
 * 특히 중요하다 — 자리별 집계(`stats.ts`)가 "오름차순 i번째" 를 전제로 하므로,
 * 순서가 틀린 회차 하나가 분포 전체를 오염시킨다.
 */

const NUMBER_MAX = 45;
const PICK = 6;

/** `{ draws: [...] }` 모양에서 유효한 회차만, 회차 오름차순으로 꺼낸다. */
export function parseDraws(raw: unknown): Draw[] {
  if (typeof raw !== "object" || raw === null) return [];

  const list = (raw as { draws?: unknown }).draws;
  if (!Array.isArray(list)) return [];

  const draws: Draw[] = [];
  for (const item of list) {
    const draw = toDraw(item);
    if (draw) draws.push(draw);
  }

  return draws.sort((a, b) => a.round - b.round);
}

/** 한 항목을 검증한다. 티켓으로 성립하지 않으면 `null`. */
function toDraw(item: unknown): Draw | null {
  if (typeof item !== "object" || item === null) return null;

  const { round, date, numbers, bonus } = item as Record<string, unknown>;

  if (!Number.isInteger(round) || (round as number) < 1) return null;
  if (typeof date !== "string" || !/^\d{8}$/.test(date)) return null;
  if (!Array.isArray(numbers) || numbers.length !== PICK) return null;

  for (let i = 0; i < PICK; i++) {
    const number = numbers[i];
    if (!Number.isInteger(number) || number < 1 || number > NUMBER_MAX) return null;
    // 오름차순이면서 겹치지 않는다 — 두 조건을 한 번에 본다.
    if (i > 0 && number <= numbers[i - 1]) return null;
  }

  if (!Number.isInteger(bonus) || (bonus as number) < 1 || (bonus as number) > NUMBER_MAX) {
    return null;
  }
  if (numbers.includes(bonus)) return null;

  return {
    round: round as number,
    date,
    numbers: numbers as number[],
    bonus: bonus as number,
  };
}
