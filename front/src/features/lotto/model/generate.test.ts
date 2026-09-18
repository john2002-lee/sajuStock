import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { parseDraws } from "./draws.ts";
import { generate, generateSets } from "./generate.ts";
import { buildStats, positionProbability } from "./stats.ts";
import { cyrb53 } from "./random.ts";
import type { Draw, PositionStats } from "./types.ts";

/**
 * 여기서 지키는 것은 **나온 조합을 실제로 살 수 있는가** 다.
 *
 * 이 기능의 첫 설계는 자리마다 "가장 적게 나온 번호" 를 고르는 것이었다. 1241회
 * 데이터로 돌려보니 `[28, 1, 1, 1, 1, 1]` 이 나왔다 — 오름차순이 깨지고 번호가
 * 5개 겹치므로 **복권으로 존재할 수 없는 조합** 이다. 자리별 통계가 서로 독립이
 * 아니기 때문이다(오름차순 제약으로 묶여 있다).
 *
 * 제약을 걸어 보정한 판도 돌려봤는데, 5주 내내 `[28, 35, 41, 43, 44, 45]` 하나만
 * 나왔다. "가장 적게 나온 번호" 는 곧 "이론적으로 가장 안 나오는 극단값" 이라
 * 한 회차 결과로는 순위가 바뀌지 않는다. 매주 같은 번호를 주는 화면은 재방문할
 * 이유가 없다.
 *
 * 그래서 이 테스트의 첫 블록(유효성)은 **그 두 실패가 다시 들어오지 못하게 막는
 * 회귀 방지** 다. 나머지는 결정성·균등성·다양성을 지킨다.
 */

/** 1241회까지의 실제 분포를 흉내 낸 stats — 관측을 이론값으로 채운 것. */
function theoreticalStats(rounds = 1241): PositionStats {
  const draws: Draw[] = [];
  const base = buildStats(draws);
  const observed = base.observed.map((row, i) =>
    row.map((_, number) => positionProbability(i + 1, number) * rounds),
  );
  const expected = observed.map((row) => [...row]);
  return { rounds, latestRound: rounds, observed, expected };
}

/** 특정 자리의 특정 번호만 "한 번도 안 나온" 것으로 만든 stats. */
function withMissing(position: number, number: number, rounds = 1241): PositionStats {
  const stats = theoreticalStats(rounds);
  const observed = stats.observed.map((row) => [...row]);
  observed[position - 1][number] = 0;
  return { ...stats, observed };
}

/**
 * **출시 설정** — 실제 `_data/draws.json` 으로 집계한 stats.
 *
 * `theoreticalStats()` 는 관측을 이론값으로 채우므로 잔차가 0 이고, 그러면
 * `factor()` 가 모든 번호에서 정확히 1 을 반환한다 — `alpha` 를 넘겨도 실질은
 * `alpha = 0` 이다. 270개 셀이 모두 실제 잔차로 흐트러진 상태는 그것으로 확인할
 * 수 없다. 화면이 쓰는 것은 이쪽이므로 이쪽으로도 검사한다.
 */
function realStats(): PositionStats {
  const file = path.join(import.meta.dirname, "..", "_data", "draws.json");
  return buildStats(parseDraws(JSON.parse(readFileSync(file, "utf-8"))));
}

/** 번호 1~45 가 얼마나 고르게 뽑히는지 — max/min 비율. */
function numberSpread(stats: PositionStats, alpha: number, samples: number, tag: string): number {
  const counts = new Array<number>(46).fill(0);
  for (let i = 0; i < samples; i++) {
    for (const number of generate(cyrb53(`${tag}:${i}`), stats, alpha)) counts[number] += 1;
  }
  const used = counts.slice(1);
  return Math.max(...used) / Math.min(...used);
}

function isValidTicket(numbers: readonly number[]): boolean {
  if (numbers.length !== 6) return false;
  if (new Set(numbers).size !== 6) return false;
  for (let i = 0; i < 6; i++) {
    if (!Number.isInteger(numbers[i])) return false;
    if (numbers[i] < 1 || numbers[i] > 45) return false;
    if (i > 0 && numbers[i] <= numbers[i - 1]) return false;
  }
  return true;
}

function overlap(a: readonly number[], b: readonly number[]): number {
  const set = new Set(a);
  return b.filter((n) => set.has(n)).length;
}

/** 카이제곱 상측 확률 (Wilson-Hilferty 근사). */
function chiSquareSf(x: number, df: number): number {
  if (x <= 0) return 1;
  const z = (Math.cbrt(x / df) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  return 0.5 * erfc(z / Math.SQRT2);
}

/** Abramowitz-Stegun 7.1.26 기반 erfc. */
function erfc(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const y =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return sign === 1 ? y : 2 - y;
}

describe("generate — 유효성 (회귀 방지)", () => {
  test("1만 회 생성이 전부 실제로 살 수 있는 조합이다", () => {
    const stats = theoreticalStats();
    for (let i = 0; i < 10000; i++) {
      const numbers = generate(cyrb53(`유효성:${i}`), stats, 0.25);
      assert.ok(isValidTicket(numbers), `${i}번째: ${JSON.stringify(numbers)}`);
    }
  });

  test("alpha 를 0 으로 둬도 유효하다", () => {
    const stats = theoreticalStats();
    for (let i = 0; i < 3000; i++) {
      assert.ok(isValidTicket(generate(cyrb53(`균등:${i}`), stats, 0)));
    }
  });

  test("alpha 가 터무니없이 커도 유효하다 — clamp 가 막는다", () => {
    const stats = withMissing(1, 28);
    for (let i = 0; i < 3000; i++) {
      const numbers = generate(cyrb53(`폭주:${i}`), stats, 50);
      assert.ok(isValidTicket(numbers), `${i}번째: ${JSON.stringify(numbers)}`);
    }
  });

  test("데이터가 비어도 유효한 조합을 낸다 — 갱신이 실패한 배포", () => {
    const stats = buildStats([]);
    for (let i = 0; i < 1000; i++) {
      assert.ok(isValidTicket(generate(cyrb53(`빈데이터:${i}`), stats, 0.25)));
    }
  });

  test("출시 설정(실제 데이터 + alpha=0.25)에서 1만 회 전부 유효하다", () => {
    const stats = realStats();
    for (let i = 0; i < 10000; i++) {
      const numbers = generate(cyrb53(`출시:${i}`), stats, 0.25);
      assert.ok(isValidTicket(numbers), `${i}번째: ${JSON.stringify(numbers)}`);
    }
  });

  test("alpha 가 NaN·Infinity 여도 퇴화하지 않는다", () => {
    // 방어가 없으면 `factor()` 가 NaN 을 내고, 가중치 총합이 NaN 이 되어
    // `target < acc` 가 언제나 false 가 된다. 그러면 부동소수 폴백이 매번 마지막
    // 후보를 집어 **모든 시드가 [40,41,42,43,44,45] 하나**로 무너진다. 그것이
    // 오름차순·중복없음·범위를 다 만족하므로 기존 유효성 테스트로는 잡히지 않는다.
    const stats = realStats();
    for (const alpha of [NaN, Infinity, -Infinity]) {
      const seen = new Set<string>();
      for (let i = 0; i < 300; i++) {
        const numbers = generate(cyrb53(`비정상:${alpha}:${i}`), stats, alpha);
        assert.ok(isValidTicket(numbers), `alpha=${alpha}: ${JSON.stringify(numbers)}`);
        seen.add(numbers.join(","));
      }
      assert.ok(seen.size > 200, `alpha=${alpha} 에서 서로 다른 조합이 ${seen.size}개뿐이다`);
    }
  });

  test("alpha 가 NaN 이어도 요청한 세트 수를 낸다", () => {
    // 퇴화하면 세 세트가 전부 같아져 중복 가드에 걸리고 1세트만 남는다.
    assert.equal(generateSets(1241, "t", realStats(), { alpha: NaN }).length, 3);
  });
});

describe("generate — 가중 세기", () => {
  test("출시값 alpha=0.25 의 편향이 '무작위 조합' 이라 부를 수 있는 범위다", () => {
    // 카피가 "통계 기반 무작위 조합" 이라고 말한다. 그 말이 정직한지는 이 비율에
    // 달려 있다. 누가 alpha 를 크게 올리면 여기서 걸려야 한다.
    const stats = realStats();
    const flat = numberSpread(stats, 0, 20000, "평탄");
    const shipped = numberSpread(stats, 0.25, 20000, "출시");

    assert.ok(shipped < 2, `번호별 출현 max/min = ${shipped.toFixed(2)}배`);
    assert.ok(shipped > flat, `가중이 효과가 없다: ${shipped.toFixed(2)} vs ${flat.toFixed(2)}`);
  });
});

describe("generate — 결정성", () => {
  test("같은 시드는 같은 조합", () => {
    const stats = theoreticalStats();
    const seed = cyrb53("1241:user-a:0");
    assert.deepEqual(generate(seed, stats, 0.25), generate(seed, stats, 0.25));
  });

  test("시드가 다르면 조합이 다르다", () => {
    const stats = theoreticalStats();
    const a = generate(cyrb53("1241:user-a:0"), stats, 0.25);
    const b = generate(cyrb53("1241:user-b:0"), stats, 0.25);
    assert.notDeepEqual(a, b);
  });
});

describe("generate — 균등성", () => {
  test("alpha=0 이면 자리별 분포가 이론과 일치한다", () => {
    const stats = theoreticalStats();
    const samples = 50000;
    const counts = Array.from({ length: 6 }, () => new Array<number>(46).fill(0));

    for (let i = 0; i < samples; i++) {
      const numbers = generate(cyrb53(`분포:${i}`), stats, 0);
      for (let p = 0; p < 6; p++) counts[p][numbers[p]] += 1;
    }

    for (let position = 1; position <= 6; position++) {
      let chi2 = 0;
      let df = 0;
      for (let number = 1; number <= 45; number++) {
        const e = positionProbability(position, number) * samples;
        if (e < 5) continue;
        chi2 += (counts[position - 1][number] - e) ** 2 / e;
        df += 1;
      }
      const p = chiSquareSf(chi2, df - 1);
      assert.ok(p > 0.001, `${position}번공: chi2=${chi2.toFixed(2)} df=${df - 1} p=${p}`);
    }
  });
});

describe("generate — 가중 효과", () => {
  test("덜 나온 번호가 alpha=0 보다 더 자주 뽑힌다", () => {
    const missing = withMissing(1, 12);
    const samples = 20000;
    let weighted = 0;
    let neutral = 0;

    for (let i = 0; i < samples; i++) {
      if (generate(cyrb53(`가중:${i}`), missing, 0.3)[0] === 12) weighted += 1;
      if (generate(cyrb53(`가중:${i}`), missing, 0)[0] === 12) neutral += 1;
    }

    assert.ok(weighted > neutral, `가중 ${weighted}회 vs 균등 ${neutral}회`);
  });

  test("가중을 줘도 분포를 뒤집지는 않는다 — 1번공은 여전히 작은 수가 흔하다", () => {
    const stats = theoreticalStats();
    const samples = 5000;
    let low = 0;

    for (let i = 0; i < samples; i++) {
      if (generate(cyrb53(`기울기:${i}`), stats, 0.3)[0] <= 10) low += 1;
    }

    // 이론상 1번공이 10 이하일 확률은 약 74% 다. 가중이 이것을 반쯤 무너뜨리면
    // "통계 기반" 이라는 말이 무의미해진다.
    assert.ok(low / samples > 0.5, `1번공 ≤ 10 비율 ${low / samples}`);
  });
});

describe("generateSets", () => {
  const stats = theoreticalStats();

  test("요청한 개수를 낸다", () => {
    assert.equal(generateSets(1241, "user-a", stats).length, 3);
    assert.equal(generateSets(1241, "user-a", stats, { count: 5 }).length, 5);
  });

  test("모든 세트가 유효하다", () => {
    for (const key of ["a", "b", "c", "d", "e"]) {
      for (const set of generateSets(1241, key, stats)) {
        assert.ok(isValidTicket(set), JSON.stringify(set));
      }
    }
  });

  test("세트끼리 4개 이상 겹치지 않는다 — 3개를 주는 의미를 지킨다", () => {
    // **넓게 훑어야 가드가 검증된다.** 두 조합이 4개 이상 겹칠 확률은 0.14% 라,
    // 40회차만 보면 위반이 한 번도 안 생겨 가드를 지워도 테스트가 통과한다.
    // 5000회를 돌리면 리롤이 실제로 발동하는 구간이 들어온다.
    for (let round = 1; round <= 5000; round++) {
      const sets = generateSets(round, "nonce", stats);
      for (let i = 0; i < sets.length; i++) {
        for (let j = i + 1; j < sets.length; j++) {
          const shared = overlap(sets[i], sets[j]);
          assert.ok(shared <= 3, `${round}회 ${i}·${j}: ${shared}개 겹침`);
        }
      }
    }
  });

  test("같은 시드 인자면 같은 세트", () => {
    assert.deepEqual(generateSets(1241, "nonce-a", stats), generateSets(1241, "nonce-a", stats));
  });

  test("회차가 다르면 세트가 다르다", () => {
    assert.notDeepEqual(generateSets(1241, "nonce-a", stats), generateSets(1242, "nonce-a", stats));
  });

  test("시드 키가 다르면 세트가 다르다 — 방문 시각이 이 자리에 들어간다", () => {
    assert.notDeepEqual(generateSets(1241, "nonce-a", stats), generateSets(1241, "nonce-b", stats));
  });

  test("같은 회차 안에서도 시드 키만 바뀌면 조합이 흩어진다 — 첫 설계가 무너진 지점", () => {
    const first = new Set<string>();
    for (let i = 0; i < 12; i++) {
      first.add(generateSets(1241, `nonce-${i}`, stats)[0].join(","));
    }
    assert.ok(first.size >= 10, `12개 시드에서 서로 다른 첫 세트 ${first.size}가지`);
  });
});
