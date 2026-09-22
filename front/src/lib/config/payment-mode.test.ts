import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isTestPaymentKey, TEST_PAYMENT_NOTICE } from "./payment-mode.ts";

/**
 * 여기서 지키는 것은 **화면이 돈에 대해 거짓말하지 않는 것**이다.
 *
 * 이 함수가 참이면 화면은 "실제 돈이 결제되지 않습니다" 라고 말한다. 라이브 키에서
 * 참이 나오는 순간 그 문장은 거짓이 되고, 사람들은 진짜 결제를 무료로 알고 누른다.
 * 반대 방향의 실수(테스트인데 고지가 빠짐)는 불편할 뿐이지만 이쪽은 돈이 걸린다.
 *
 * 그래서 대칭으로 보지 않는다 — **애매하면 거짓**이다.
 */

describe("isTestPaymentKey — 테스트 키로 인정하는 것", () => {
  test("토스 테스트 클라이언트 키", () => {
    assert.equal(isTestPaymentKey("test_ck_nRQoOaPz8LAy1n6Bd9wr8y47BMw6"), true);
  });

  test("테스트 시크릿 키도 같은 접두사를 쓴다", () => {
    assert.equal(isTestPaymentKey("test_sk_abcdefg"), true);
  });

  test("대문자로 적혀 있어도 테스트로 본다 — 놓치면 고지가 빠진다", () => {
    assert.equal(isTestPaymentKey("TEST_CK_ABC"), true);
  });

  test("앞뒤 공백은 환경변수에 흔히 섞인다", () => {
    assert.equal(isTestPaymentKey("  test_ck_abc  "), true);
  });
});

describe("isTestPaymentKey — 테스트가 아닌 것", () => {
  test("라이브 키", () => {
    assert.equal(isTestPaymentKey("live_ck_nRQoOaPz8LAy1n6Bd9wr8y47BMw6"), false);
  });

  test("**키 안에** test_ 가 들어 있는 라이브 키에 속지 않는다", () => {
    assert.equal(isTestPaymentKey("live_ck_test_abc"), false);
  });

  test("미설정 — 모르면 고지하지 않는다", () => {
    assert.equal(isTestPaymentKey(undefined), false);
    assert.equal(isTestPaymentKey(null), false);
    assert.equal(isTestPaymentKey(""), false);
    assert.equal(isTestPaymentKey("   "), false);
  });

  test("우리가 모르는 형식도 테스트로 치지 않는다", () => {
    assert.equal(isTestPaymentKey("ck_live_abc"), false);
    assert.equal(isTestPaymentKey("sandbox_ck_abc"), false);
  });
});

describe("고지 문구", () => {
  test("테스트라는 것과 돈이 나가지 않는다는 것을 **둘 다** 말한다", () => {
    // 하나만 말하면 읽는 사람이 나머지를 추측해야 한다. "테스트 중" 만으로는
    // 돈이 나가는지 알 수 없고, "결제되지 않습니다" 만으로는 고장으로 읽힌다.
    assert.ok(TEST_PAYMENT_NOTICE.includes("테스트"), TEST_PAYMENT_NOTICE);
    assert.ok(TEST_PAYMENT_NOTICE.includes("실제"), TEST_PAYMENT_NOTICE);
  });
});
