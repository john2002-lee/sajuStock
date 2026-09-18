import { combi } from "./combi.ts";
import type { Draw, PositionStats } from "./types.ts";

/**
 * 자리별 분포 — 화면의 "출현비율" 과 생성 가중치의 근거.
 *
 * ## 이 파일이 답하는 질문
 *
 * "1번공에 28 이 한 번도 안 나왔는데, 이제 나올 차례인가?"
 *
 * 아니다. 1번공은 **오름차순 6개 중 최솟값** 이다. 1번공이 28 이려면 나머지 5개가
 * 전부 29~45(17개) 안에서 나와야 하므로 확률이
 * `C(17,5)/C(45,6) = 0.076%` 이고, 1241회를 돌려도 기대 출현이 0.94회다. 실측
 * 0회는 **정상값** 이지 밀린 것이 아니다.
 *
 * 실제로 1241회 데이터를 6개 자리 전부 카이제곱 적합도 검정에 넣으면 p 값이
 * 0.27~0.95 로 나온다. 어느 자리에서도 편향이 검출되지 않는다.
 *
 * 그래서 이 파일은 "무엇이 밀렸는지" 를 계산하지 않는다. **이론이 말하는 기대치와
 * 실제 관측치를 나란히** 놓기만 한다. 둘을 어떻게 쓸지는 `generate.ts` 가 정한다.
 *
 * ## 이론 분포
 *
 * 오름차순 `i` 번째 공이 `k` 이려면 앞의 `i-1` 개가 `1..k-1` 에서, 뒤의 `6-i` 개가
 * `k+1..45` 에서 나와야 한다.
 *
 * ```
 * P(X_i = k) = C(k-1, i-1) · C(45-k, 6-i) / C(45, 6)
 * ```
 *
 * 1번공은 1 쪽으로, 6번공은 45 쪽으로 몰린다. 두 분포는 서로 거울상이다.
 */

const NUMBER_MAX = 45;
const PICK = 6;
const TOTAL = combi(NUMBER_MAX, PICK);

/** 오름차순 `position` 번째(1-based) 공이 `number` 일 이론 확률. */
export function positionProbability(position: number, number: number): number {
  if (position < 1 || position > PICK) return 0;
  if (number < 1 || number > NUMBER_MAX) return 0;

  const before = combi(number - 1, position - 1);
  const after = combi(NUMBER_MAX - number, PICK - position);
  return (before * after) / TOTAL;
}

/** 길이 46 의 0 배열 — 번호를 1부터 그대로 색인하기 위해 0번을 비워 둔다. */
function emptyCounts(): number[] {
  return new Array<number>(NUMBER_MAX + 1).fill(0);
}

/** 회차 목록을 자리별 분포로 집계한다. 순수 함수다 — 입력을 고치지 않는다. */
export function buildStats(draws: readonly Draw[]): PositionStats {
  const observed = Array.from({ length: PICK }, emptyCounts);
  const expected = Array.from({ length: PICK }, emptyCounts);

  let latestRound = 0;
  for (const item of draws) {
    if (item.round > latestRound) latestRound = item.round;
    for (let i = 0; i < PICK; i++) {
      const number = item.numbers[i];
      if (number >= 1 && number <= NUMBER_MAX) observed[i][number] += 1;
    }
  }

  const rounds = draws.length;
  for (let i = 0; i < PICK; i++) {
    for (let number = 1; number <= NUMBER_MAX; number++) {
      expected[i][number] = positionProbability(i + 1, number) * rounds;
    }
  }

  return { rounds, latestRound, observed, expected };
}
