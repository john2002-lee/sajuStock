import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { legacyRedirect } from "./legacy-paths.ts";

/**
 * 여기서 지키는 것은 **접두 일치로 번지지 않는가** 다.
 *
 * 이 앱의 홈은 `/stock` 이고 `/` 만 그리로 보낸다. 판정이 넓어져 `/stocks/005930`
 * 이나 `/dashboard` 까지 홈으로 튕기면, 공유된 종목 링크를 연 사람이 그 종목 대신
 * 시장 현황을 보고 이유를 알 수 없다. 그래서 통과시키지 않아야 할 주소를 하나씩
 * 이름 붙여 박아 둔다.
 */

describe("legacyRedirect — 홈으로 보내는 것", () => {
  test("루트 `/` 는 시장 현황으로", () => {
    assert.equal(legacyRedirect("/"), "/stock");
  });
});

describe("legacyRedirect — 건드리지 않는 것", () => {
  for (const path of [
    "/stock",
    "/stock/",
    "/stocks",
    "/stocks/005930",
    "/stocks/screener",
    "/dashboard",
    "/dashboard/005930",
    "/login",
    "/verdict/x7Kq2mP9abcDEF-_",
  ]) {
    test(`그대로 — ${path}`, () => {
      assert.equal(legacyRedirect(path), null);
    });
  }
});
