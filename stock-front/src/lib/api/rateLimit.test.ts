import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { consumeRateLimit } from "./rateLimit.ts";

describe("consumeRateLimit — 키·창(window) 단위 상한", () => {
  test("상한 안에서는 계속 true", () => {
    const key = `k1-${Math.random()}`;
    assert.equal(consumeRateLimit(key, 3, 60_000), true);
    assert.equal(consumeRateLimit(key, 3, 60_000), true);
    assert.equal(consumeRateLimit(key, 3, 60_000), true);
  });

  test("상한을 넘으면 false", () => {
    const key = `k2-${Math.random()}`;
    assert.equal(consumeRateLimit(key, 2, 60_000), true);
    assert.equal(consumeRateLimit(key, 2, 60_000), true);
    assert.equal(consumeRateLimit(key, 2, 60_000), false);
    assert.equal(consumeRateLimit(key, 2, 60_000), false);
  });

  test("키가 다르면 서로 간섭하지 않는다", () => {
    const a = `k3a-${Math.random()}`;
    const b = `k3b-${Math.random()}`;
    assert.equal(consumeRateLimit(a, 1, 60_000), true);
    assert.equal(consumeRateLimit(a, 1, 60_000), false);
    // b 는 a 가 상한을 채운 것과 무관하게 처음 한 번은 통과한다.
    assert.equal(consumeRateLimit(b, 1, 60_000), true);
  });

  test("창이 지나면 다시 통과한다", async () => {
    const key = `k4-${Math.random()}`;
    assert.equal(consumeRateLimit(key, 1, 20), true);
    assert.equal(consumeRateLimit(key, 1, 20), false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(consumeRateLimit(key, 1, 20), true);
  });
});
