import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { legacyRedirect } from "./legacy-paths.ts";

/**
 * 여기서 지키는 것은 **접두 일치로 번지지 않는가** 다.
 *
 * `/saju` 는 이제 루트로 옮겨 갔지만 그 **아래** 화면들(`/saju/teaser` ·
 * `/saju/report` · `/saju/reports/{token}` · `/saju/pay/*`)은 그대로 살아 있다.
 * 판정을 `startsWith("/saju")` 로 적는 순간 결제하고 받은 리포트 주소까지 루트로
 * 튕기고, **그 사람은 산 것을 잃는다.** 화면에는 오류가 없고 그냥 입력 화면이
 * 뜨기 때문에 알아차릴 방법도 없다.
 *
 * 그래서 통과시키지 않아야 할 주소를 하나씩 이름 붙여 박아 둔다.
 */

describe("legacyRedirect — 루트로 보내는 것", () => {
  test("`/saju` 정확히 일치", () => {
    assert.equal(legacyRedirect("/saju"), "/");
  });

  test("끝의 슬래시 하나는 같은 주소로 본다", () => {
    assert.equal(legacyRedirect("/saju/"), "/");
  });
});

describe("legacyRedirect — 건드리지 않는 것", () => {
  /**
   * 이 넷이 이 파일의 존재 이유다. 전부 `/saju` 로 시작하지만 전부 살아 있어야 한다.
   */
  for (const path of [
    "/saju/teaser",
    "/saju/report",
    "/saju/intro",
    "/saju/pay/success",
    "/saju/pay/fail",
  ]) {
    test(`하위 화면은 그대로 — ${path}`, () => {
      assert.equal(legacyRedirect(path), null);
    });
  }

  test("구매한 리포트 주소는 절대 튕기지 않는다 — 튕기면 산 것을 잃는다", () => {
    assert.equal(legacyRedirect("/saju/reports/Zm9vYmFyYmF6"), null);
  });

  test("루트 자신", () => {
    assert.equal(legacyRedirect("/"), null);
  });

  test("이름이 `/saju` 로 시작할 뿐인 주소", () => {
    assert.equal(legacyRedirect("/sajustock"), null);
  });

  test("다른 서비스", () => {
    assert.equal(legacyRedirect("/stock"), null);
  });
});
