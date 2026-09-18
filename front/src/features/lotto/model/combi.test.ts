import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { combi } from "./combi.ts";

/**
 * 여기서 지키는 것은 **정확한 정수** 다.
 *
 * 이 값이 번호 생성의 가중치가 된다(`generate.ts`). 팩토리얼로 계산하면
 * `45!` 이 `Number` 를 넘겨 `Infinity` 가 되고, 가중치 전체가 `NaN` 으로
 * 무너진다. 그래서 순차 곱셈·나눗셈으로 계산하는데, 그 방식이 정말 정수로
 * 떨어지는지를 확인하는 것이 이 테스트다.
 *
 * 범위를 벗어난 입력이 0 이어야 하는 이유도 생성 쪽에 있다 — 마지막 자리에서
 * `r = 0` 이고, 남은 후보가 없는 자리에서는 가중치가 0 이어야 그 번호가
 * 선택되지 않는다.
 */

describe("combi", () => {
  test("로또 전체 조합 수 — C(45,6) = 8,145,060", () => {
    assert.equal(combi(45, 6), 8145060);
  });

  test("정수로 정확히 떨어진다 — C(44,5) = 1,086,008", () => {
    assert.equal(combi(44, 5), 1086008);
  });

  test("r = 0 이면 1 — 남은 자리가 없는 마지막 공", () => {
    assert.equal(combi(39, 0), 1);
    assert.equal(combi(0, 0), 1);
  });

  test("r = n 이면 1", () => {
    assert.equal(combi(6, 6), 1);
  });

  test("r > n 이면 0 — 남은 자리보다 후보가 적은 경우", () => {
    assert.equal(combi(3, 5), 0);
  });

  test("음수는 0 — 계산이 이상해졌을 때 조용히 퍼지지 않게", () => {
    assert.equal(combi(5, -1), 0);
    assert.equal(combi(-5, 2), 0);
  });

  test("대칭이다 — C(n,r) = C(n,n-r)", () => {
    for (const [n, r] of [
      [45, 6],
      [44, 5],
      [40, 17],
    ]) {
      assert.equal(combi(n, r), combi(n, n - r));
    }
  });

  test("생성에 쓰이는 전 구간이 안전한 정수다", () => {
    // generate 는 C(45-k, 6-i) 를 k=1..45, i=1..6 에서 부른다.
    for (let i = 1; i <= 6; i++) {
      for (let k = 1; k <= 45; k++) {
        const value = combi(45 - k, 6 - i);
        assert.ok(Number.isSafeInteger(value), `C(${45 - k}, ${6 - i}) = ${value}`);
        assert.ok(value >= 0);
      }
    }
  });
});
