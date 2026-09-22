import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CHECKOUT_UNAVAILABLE_NOTICE,
  isCheckoutConfigured,
  isTestPaymentKey,
  TEST_PAYMENT_NOTICE,
} from "./payment-mode.ts";

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

/**
 * 이쪽이 지키는 것은 **누를 때마다 반드시 실패하는 버튼을 그리지 않는 것**이다.
 *
 * 실제로 한 번 일어났다: 서버는 팔 수 있다고 답했고 화면은 정상 판매 카드를
 * 그렸는데, 브라우저 번들에 클라이언트 키가 없어 버튼이 조용히 실패했다.
 */
describe("isCheckoutConfigured", () => {
  const KEY = "test_ck_abc";
  const ORIGIN = "http://localhost:3000";

  test("둘 다 있으면 결제창을 열 수 있다", () => {
    assert.equal(isCheckoutConfigured(KEY, ORIGIN), true);
  });

  test("클라이언트 키가 없으면 못 연다", () => {
    assert.equal(isCheckoutConfigured(undefined, ORIGIN), false);
    assert.equal(isCheckoutConfigured(null, ORIGIN), false);
  });

  test("절대 URL 이 없으면 못 연다 — 토스가 상대 경로를 거부한다", () => {
    assert.equal(isCheckoutConfigured(KEY, undefined), false);
    assert.equal(isCheckoutConfigured(KEY, null), false);
  });

  test("`KEY=` 만 적힌 환경변수는 빈 문자열로 인라인된다 — 없는 것으로 본다", () => {
    // 이것을 통과시키면 `loadTossPayments("")` 가 결제창에서야 실패한다.
    assert.equal(isCheckoutConfigured("", ORIGIN), false);
    assert.equal(isCheckoutConfigured("   ", ORIGIN), false);
    assert.equal(isCheckoutConfigured(KEY, ""), false);
    assert.equal(isCheckoutConfigured(KEY, "   "), false);
  });

  test("라이브 키도 당연히 결제창을 연다 — 테스트 여부와 무관한 판정이다", () => {
    assert.equal(isCheckoutConfigured("live_ck_abc", "https://aiot21.com"), true);
  });
});

describe("고지 문구", () => {
  test("테스트라는 것과 돈이 나가지 않는다는 것을 **둘 다** 말한다", () => {
    // 하나만 말하면 읽는 사람이 나머지를 추측해야 한다. "테스트 중" 만으로는
    // 돈이 나가는지 알 수 없고, "결제되지 않습니다" 만으로는 고장으로 읽힌다.
    assert.ok(TEST_PAYMENT_NOTICE.includes("테스트"), TEST_PAYMENT_NOTICE);
    assert.ok(TEST_PAYMENT_NOTICE.includes("실제"), TEST_PAYMENT_NOTICE);
  });

  test("결제 불가 문구는 **재시도를 권하지 않는다** — 눌러도 바뀌지 않는 상태다", () => {
    // "잠시 후 다시 시도해 주세요" 가 이 자리에 있었던 것이 버그였다. 빌드에
    // 박히는 값이라 재시도로는 영원히 해결되지 않는다.
    assert.ok(!CHECKOUT_UNAVAILABLE_NOTICE.includes("다시 시도"), CHECKOUT_UNAVAILABLE_NOTICE);
    assert.ok(!CHECKOUT_UNAVAILABLE_NOTICE.includes("잠시"), CHECKOUT_UNAVAILABLE_NOTICE);
  });

  test("결제 불가 문구는 사용자 잘못이 아님을 말한다", () => {
    // 그러지 않으면 자기 생년월일시를 의심하며 시간을 쓴다.
    assert.ok(CHECKOUT_UNAVAILABLE_NOTICE.includes("문제가 없습니다"), CHECKOUT_UNAVAILABLE_NOTICE);
  });
});
