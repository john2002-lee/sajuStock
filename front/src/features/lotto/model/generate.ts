import { combi } from "./combi.ts";
import { cyrb53, mulberry32 } from "./random.ts";
import type { PositionStats } from "./types.ts";

/**
 * 번호 조합 생성.
 *
 * ## 왜 자리별로 "가장 적게 나온 번호" 를 고르지 않나
 *
 * 그게 첫 설계였고, 1241회 데이터로 돌려보니 `[28, 1, 1, 1, 1, 1]` 이 나왔다.
 * 오름차순이 깨지고 번호가 겹치므로 **복권으로 존재할 수 없는 조합** 이다. 자리별
 * 통계는 서로 독립이 아니다 — 오름차순 제약으로 묶여 있어서 따로 뽑는 순간
 * 유효한 티켓이 되지 않는다.
 *
 * 제약을 사후에 걸어 보정한 판도 5주 내내 `[28, 35, 41, 43, 44, 45]` 하나만
 * 냈다. "가장 적게 나온 번호" 는 "이론적으로 가장 안 나오는 극단값" 과 같은 말이고,
 * 그 순위는 한 회차로 바뀌지 않는다.
 *
 * ## 그래서 순차 조건부 샘플링
 *
 * 오름차순 조합에서 `i` 번째 값이 `k` 이고 앞이 확정되면, 남은 `r = 6-i` 개는
 * `k+1..45` 중에서 고르므로 경우의 수가 `C(45-k, r)` 이다. 따라서
 *
 * ```
 * P(X_i = k | X_{i-1} = prev)  ∝  C(45-k, 6-i)      k ∈ [prev+1, 45-(6-i)]
 * ```
 *
 * 이 가중치로 앞에서 뒤로 한 번만 훑으면
 *
 * - 결과가 **정확히 `C(45,6)` 균등분포와 같고**,
 * - 오름차순·중복없음·범위가 **구조적으로 보장된다** (후보 범위 자체가 그렇게 잡힌다).
 *
 * 사후 검증도, 조합을 버리고 다시 뽑는 일도 없다.
 *
 * ## alpha 는 무엇인가
 *
 * 사용자가 원한 "덜 나온 번호" 체감을 남기는 손잡이다. 표준화 잔차
 * `(기대 - 관측) / √기대` 에 비례해 가중치를 올린다. `alpha = 0` 이면 완전
 * 균등이다.
 *
 * 크기는 작지만 무시할 정도는 아니다. 출시값 `0.25` 로 실제 회차 통계를 넣고
 * 2만 회를 뽑으면 번호별 출현 빈도가 **max/min 1.67배** 로 갈린다(균등은 1.06배).
 * 개별 번호로는 0.78x~1.30x 다. `generate.test.ts` 가 이 비율이 2배를 넘지 않는지
 * 지킨다 — 넘어가면 "무작위 조합" 이라는 화면의 말이 무색해진다.
 *
 * **이 값이 당첨 확률을 높이지는 않는다.** 백테스트(101~1241회, 1141회차)에서
 * 최저출현 전략의 5등 이상 비율은 2.191% 로 무작위 2.353% 보다 오히려 낮았다.
 * alpha 는 재미와 화면의 이야기를 위한 것이고, 그래서 값을 작게(0.2~0.3) 두고
 * clamp 로 묶는다. 묶지 않으면 기대도수가 0 에 가까운 극단값에서 가중치가 폭주해
 * 매주 같은 번호를 주던 첫 설계로 되돌아간다.
 */

const NUMBER_MAX = 45;
const PICK = 6;

/** 가중 배수의 허용 범위. 폭주(상한)와 소멸(하한)을 모두 막는다. */
const WEIGHT_FACTOR_MIN = 0.1;
const WEIGHT_FACTOR_MAX = 3;

/** 세트끼리 허용하는 최대 겹침. 이보다 많이(4개 이상) 겹치면 다시 뽑는다. */
const MAX_OVERLAP = 3;

export interface GenerateSetsOptions {
  readonly alpha?: number;
  readonly count?: number;
}

/**
 * 오름차순 6개 조합 하나. 언제나 유효한 조합을 낸다.
 *
 * @param seed  `cyrb53` 로 만든 정수 시드
 * @param stats 자리별 분포. `alpha = 0` 이면 쓰이지 않는다
 * @param alpha "덜 나온 번호" 가중 세기. 0 이면 완전 균등
 */
export function generate(seed: number, stats: PositionStats, alpha = 0): number[] {
  // **유한한 값만 통과시킨다.** `NaN` 이 들어오면 모든 가중치가 `NaN` 이 되고,
  // 누적합 비교(`target < acc`)가 언제나 false 가 되어 부동소수 폴백이 매번
  // 마지막 후보를 집는다. 그러면 어떤 시드를 넣어도 `[40,41,42,43,44,45]` 하나만
  // 나온다 — 오름차순·중복없음·범위를 다 만족하므로 **유효성 검사로는 잡히지
  // 않는 퇴화** 이고, 이 설계가 대체한 "매주 같은 번호" 와 같은 결과다.
  const bias = Number.isFinite(alpha) ? alpha : 0;

  const rand = mulberry32(seed);
  const picked: number[] = [];
  let prev = 0;

  for (let position = 1; position <= PICK; position++) {
    const remaining = PICK - position;
    const lo = prev + 1;
    const hi = NUMBER_MAX - remaining;
    const weights: number[] = [];

    for (let number = lo; number <= hi; number++) {
      let weight = combi(NUMBER_MAX - number, remaining);
      if (bias !== 0 && weight > 0) weight *= factor(stats, position, number, bias);
      weights.push(weight);
    }

    prev = lo + weightedIndex(rand(), weights);
    picked.push(prev);
  }

  return picked;
}

/**
 * 한 번에 보여줄 여러 세트.
 *
 * 시드는 `회차 + 시드 키 + 세트번호` 다. 화면은 시드 키 자리에 **방문 시각(ms)** 을
 * 넣으므로 방문마다 다른 조합이 나오고, 회차가 넘어가면 집계 자체가 바뀐다. 그
 * 결정의 근거는 `components/LottoSection.tsx` 에 있다.
 *
 * @param seedKey 시드에 섞을 임의의 문자열. 화면은 방문 시각(ms)을 넘긴다.
 */
export function generateSets(
  round: number,
  seedKey: string,
  stats: PositionStats,
  options: GenerateSetsOptions = {},
): number[][] {
  const { alpha = 0.25, count = 3 } = options;
  const sets: number[][] = [];

  // 리롤 상한을 둔다. 겹침 때문에 버리는 일은 드물지만(두 조합이 4개 이상 겹칠
  // 확률은 0.139% — `[C(6,4)C(39,2) + C(6,5)·39 + 1] / C(45,6)`), 상한이 없으면
  // 최악의 경우 멈추지 않는다.
  const limit = count + 20;
  for (let index = 0; index < limit && sets.length < count; index++) {
    const next = generate(cyrb53(`${round}:${seedKey}:${index}`), stats, alpha);
    if (sets.some((set) => overlap(set, next) > MAX_OVERLAP)) continue;
    sets.push(next);
  }

  return sets;
}

/**
 * 표준화 잔차로 만든 가중 배수.
 *
 * 기대보다 덜 나온 번호는 1 보다 큰 값을, 더 나온 번호는 1 보다 작은 값을 받는다.
 * 기대도수가 0 에 가까운 극단값에서는 분모를 1 로 바닥 처리해 잔차가 튀지 않게
 * 하고, 마지막에 범위로 묶는다.
 */
function factor(stats: PositionStats, position: number, number: number, alpha: number): number {
  const expected = stats.expected[position - 1][number];
  const observed = stats.observed[position - 1][number];
  const gap = (expected - observed) / Math.max(Math.sqrt(expected), 1);
  return clamp(1 + alpha * gap, WEIGHT_FACTOR_MIN, WEIGHT_FACTOR_MAX);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 누적합을 훑어 `u ∈ [0,1)` 가 가리키는 후보의 인덱스를 찾는다. */
function weightedIndex(u: number, weights: number[]): number {
  let total = 0;
  for (const weight of weights) total += weight;

  // 마지막 후보로 떨어지는 폴백(아래)은 **부동소수 오차만** 흡수해야 한다.
  // 총합이 망가진 경우까지 같은 길로 흘려보내면, 잘못된 계산이 "유효해 보이는
  // 퇴화 출력" 으로 세탁된다. 그건 조용히 틀린 번호를 내는 것이므로 여기서 끊는다.
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error(`가중치 총합이 올바르지 않습니다: ${total}`);
  }

  const target = u * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (target < acc) return i;
  }

  // 부동소수 오차로 누적합이 target 에 못 미치는 경우. 마지막 후보로 떨어뜨린다.
  return weights.length - 1;
}

function overlap(a: readonly number[], b: readonly number[]): number {
  const set = new Set(a);
  let count = 0;
  for (const number of b) if (set.has(number)) count += 1;
  return count;
}
