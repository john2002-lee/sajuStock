import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildStats, positionProbability } from "./stats.ts";
import type { Draw } from "./types.ts";

/**
 * 여기서 지키는 것은 **이론 분포가 맞는가** 다.
 *
 * 이 값이 번호 생성의 기준선이다. 사용자가 화면에서 보는 "출현비율" 이 편향처럼
 * 보이는 이유가 바로 이 분포이기도 하다 — 1번공(오름차순 최솟값)은 1 쪽으로,
 * 6번공(최댓값)은 45 쪽으로 몰리는 것이 **정상** 이다.
 *
 * 실제로 확인된 수치를 못으로 박아 둔다. 1241회까지의 실측에서 1번공이 1 인
 * 회차는 170회였고 이론 기대는 165.5회였다. 이 분포식이 틀어지면 그 일치가
 * 깨진다.
 */

/** 테스트용 회차. 번호는 오름차순이어야 한다. */
function draw(round: number, numbers: number[], bonus = 45): Draw {
  return { round, date: "20260912", numbers, bonus };
}

describe("positionProbability", () => {
  test("1번공이 1 일 확률 — C(44,5)/C(45,6) = 2/15", () => {
    assert.ok(Math.abs(positionProbability(1, 1) - 2 / 15) < 1e-12);
  });

  test("1번공이 28 일 확률은 0.076% — 1241회에서 기대 0.94회, 실측 0회", () => {
    const p = positionProbability(1, 28);
    assert.ok(Math.abs(p - 6188 / 8145060) < 1e-12, `${p}`);
    assert.ok(p * 1241 < 1, `1241회 기대 출현 ${p * 1241}회`);
  });

  test("자리마다 확률의 합이 1 이다", () => {
    for (let position = 1; position <= 6; position++) {
      let sum = 0;
      for (let number = 1; number <= 45; number++) sum += positionProbability(position, number);
      assert.ok(Math.abs(sum - 1) < 1e-9, `${position}번공 합계 ${sum}`);
    }
  });

  test("1번공과 6번공은 거울상이다 — P(1번공=k) = P(6번공=46-k)", () => {
    for (let k = 1; k <= 45; k++) {
      const left = positionProbability(1, k);
      const right = positionProbability(6, 46 - k);
      assert.ok(Math.abs(left - right) < 1e-12, `k=${k}`);
    }
  });

  test("구조적으로 불가능한 자리는 0 이다", () => {
    // 1번공(최솟값)은 41 이상이 될 수 없다 — 뒤에 5개가 더 필요하다.
    assert.equal(positionProbability(1, 41), 0);
    // 6번공(최댓값)은 5 이하가 될 수 없다.
    assert.equal(positionProbability(6, 5), 0);
  });

  test("범위를 벗어난 입력은 0 이다", () => {
    assert.equal(positionProbability(1, 0), 0);
    assert.equal(positionProbability(1, 46), 0);
    assert.equal(positionProbability(0, 10), 0);
    assert.equal(positionProbability(7, 10), 0);
  });
});

describe("buildStats", () => {
  const draws = [
    draw(1, [10, 23, 29, 33, 37, 40], 16),
    draw(2, [9, 13, 21, 25, 32, 42], 2),
    draw(3, [1, 2, 3, 4, 5, 6], 7),
  ];

  test("회차 수와 최신 회차를 담는다", () => {
    const stats = buildStats(draws);
    assert.equal(stats.rounds, 3);
    assert.equal(stats.latestRound, 3);
  });

  test("회차 순서가 뒤섞여 들어와도 최신 회차를 찾는다", () => {
    const stats = buildStats([draws[2], draws[0], draws[1]]);
    assert.equal(stats.latestRound, 3);
  });

  test("자리별 관측 합계가 회차 수와 같다 — 한 회차는 자리마다 정확히 한 번", () => {
    const stats = buildStats(draws);
    for (let i = 0; i < 6; i++) {
      const sum = stats.observed[i].reduce((a, b) => a + b, 0);
      assert.equal(sum, 3, `${i + 1}번공`);
    }
  });

  test("번호를 제자리에 센다", () => {
    const stats = buildStats(draws);
    assert.equal(stats.observed[0][10], 1); // 1회 1번공 = 10
    assert.equal(stats.observed[0][9], 1); // 2회 1번공 = 9
    assert.equal(stats.observed[0][1], 1); // 3회 1번공 = 1
    assert.equal(stats.observed[5][40], 1); // 1회 6번공 = 40
    assert.equal(stats.observed[0][23], 0); // 23 은 1번공으로 나온 적이 없다
  });

  test("번호는 1..45 로 색인된다 — generate 가 [번호] 로 바로 찾는다", () => {
    const stats = buildStats(draws);
    for (let i = 0; i < 6; i++) {
      assert.equal(stats.observed[i].length, 46);
      assert.equal(stats.expected[i].length, 46);
      assert.equal(stats.observed[i][0], 0);
      assert.equal(stats.expected[i][0], 0);
    }
  });

  test("이론 기대 합계도 회차 수와 같다", () => {
    const stats = buildStats(draws);
    for (let i = 0; i < 6; i++) {
      const sum = stats.expected[i].reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 3) < 1e-9, `${i + 1}번공 합계 ${sum}`);
    }
  });

  test("빈 입력에서 터지지 않는다 — 데이터 갱신이 실패한 배포", () => {
    const stats = buildStats([]);
    assert.equal(stats.rounds, 0);
    assert.equal(stats.latestRound, 0);
    assert.equal(stats.observed[0][1], 0);
    assert.equal(stats.expected[0][1], 0);
  });
});
