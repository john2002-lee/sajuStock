import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cyrb53, mulberry32 } from "./random.ts";

/**
 * 여기서 지키는 것은 **결정성** 이다.
 *
 * 같은 회차에 같은 사람이 들어오면 같은 번호가 나와야 한다. 새로고침마다 번호가
 * 바뀌면 "내 번호" 라는 감각이 사라지고, 맘에 드는 조합이 나올 때까지 돌리는
 * 화면이 된다. 그래서 `Math.random()` 을 쓸 수 없다 — 시드를 받지 못한다.
 *
 * 범위 테스트가 있는 이유는 `generate.ts` 가 `u * total` 로 누적합을 훑기
 * 때문이다. `u` 가 1 이 되는 순간 마지막 후보를 넘겨 `undefined` 를 집는다.
 */

describe("cyrb53", () => {
  test("같은 문자열은 같은 해시 — 결정성의 뿌리", () => {
    assert.equal(cyrb53("1241:abc:0"), cyrb53("1241:abc:0"));
  });

  test("회차가 다르면 해시가 다르다 — 매주 새 번호가 나오는 근거", () => {
    assert.notEqual(cyrb53("1241:abc:0"), cyrb53("1242:abc:0"));
  });

  test("사용자가 다르면 해시가 다르다", () => {
    assert.notEqual(cyrb53("1241:abc:0"), cyrb53("1241:xyz:0"));
  });

  test("세트 번호가 다르면 해시가 다르다 — 3세트가 서로 달라야 한다", () => {
    const seeds = [0, 1, 2].map((i) => cyrb53(`1241:abc:${i}`));
    assert.equal(new Set(seeds).size, 3);
  });

  test("빈 문자열도 처리한다", () => {
    assert.ok(Number.isSafeInteger(cyrb53("")));
  });

  test("안전 정수를 낸다 — 시드가 NaN 이면 PRNG 전체가 죽는다", () => {
    for (const s of ["", "a", "1241:abc:0", "한글도 들어온다", "x".repeat(500)]) {
      assert.ok(Number.isSafeInteger(cyrb53(s)), s);
    }
  });
});

describe("mulberry32", () => {
  test("같은 시드는 같은 수열", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const left = [a(), a(), a(), a(), a()];
    const right = [b(), b(), b(), b(), b()];
    assert.deepEqual(left, right);
  });

  test("다른 시드는 다른 수열", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    assert.notEqual(a(), b());
  });

  test("출력이 [0, 1) 안에 있다 — 1 이 나오면 누적합 훑기가 범위를 넘는다", () => {
    const rand = mulberry32(cyrb53("범위 확인"));
    for (let i = 0; i < 20000; i++) {
      const u = rand();
      assert.ok(u >= 0 && u < 1, `${i}번째: ${u}`);
    }
  });

  test("시드 0 에서도 계속 흐른다 — 같은 값을 반복하지 않는다", () => {
    const rand = mulberry32(0);
    const values = new Set([rand(), rand(), rand(), rand(), rand()]);
    assert.equal(values.size, 5);
  });

  test("대략 균등하다 — 평균이 0.5 근처", () => {
    const rand = mulberry32(cyrb53("균등 확인"));
    let sum = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) sum += rand();
    const mean = sum / n;
    assert.ok(Math.abs(mean - 0.5) < 0.01, `평균 ${mean}`);
  });
});
