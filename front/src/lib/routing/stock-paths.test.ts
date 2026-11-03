import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { stockRedirect } from "./stock-paths.ts";

/**
 * 주식은 별도 프로젝트(`stock-front`)로 갈라져 나갔다. 여기서 지키는 것은 둘이다.
 *
 * 1. **옛 주식 주소는 종목·쿼리를 살려서 새 도메인으로 간다.** 공유된
 *    `/stocks/005930?ai=1` 이 시장 현황 첫 화면으로 떨어지면 받은 사람은 링크가
 *    가리키던 종목을 다시 찾아야 한다.
 * 2. **사주 주소는 절대 건드리지 않는다.** 판정이 접두 문자열로 번지면 이름이
 *    비슷한 주소까지 남의 도메인으로 나간다.
 */

const SITE = "https://stock.example.com";

describe("stockRedirect — 새 도메인으로 보내는 것", () => {
  for (const [path, search, expected] of [
    ["/stock", "", `${SITE}/stock`],
    ["/stocks", "?sort=change", `${SITE}/stocks?sort=change`],
    ["/stocks/005930", "?ai=1&view=console", `${SITE}/stocks/005930?ai=1&view=console`],
    ["/stocks/screener", "", `${SITE}/stocks/screener`],
    ["/dashboard", "", `${SITE}/dashboard`],
    ["/dashboard/005930", "", `${SITE}/dashboard/005930`],
    ["/watchlist/005930", "", `${SITE}/watchlist/005930`],
    ["/verdict/x7Kq2mP9abcDEF-_", "", `${SITE}/verdict/x7Kq2mP9abcDEF-_`],
  ] as const) {
    test(`${path}${search}`, () => {
      assert.equal(stockRedirect(path, search, SITE), expected);
    });
  }

  test("주소 끝의 슬래시는 떼고 붙인다", () => {
    assert.equal(stockRedirect("/stocks/005930", "", `${SITE}/`), `${SITE}/stocks/005930`);
  });
});

describe("stockRedirect — 건드리지 않는 것", () => {
  for (const path of [
    "/",
    "/saju/intro",
    "/saju/reports/Zm9vYmFyYmF6",
    "/talisman",
    "/lotto",
    "/admin",
    "/login",
    // 이름이 주식 경로로 시작할 뿐인 주소 — 경로 조각 단위로만 본다
    "/stockholm",
    "/stocksx",
    "/dashboards",
    "/verdicts",
  ]) {
    test(path, () => {
      assert.equal(stockRedirect(path, "", SITE), null);
    });
  }
});

describe("stockRedirect — 목적지가 없으면 보내지 않는다", () => {
  test("미설정", () => {
    assert.equal(stockRedirect("/stocks/005930", "", undefined), null);
  });

  test("빈 문자열 — 템플릿을 그대로 복사한 경우", () => {
    assert.equal(stockRedirect("/stocks/005930", "", ""), null);
  });

  test("URL 이 아닌 값 — proxy 를 죽이지 않는다", () => {
    assert.equal(stockRedirect("/stocks/005930", "", "stock.example.com"), null);
  });

  test("http(s) 가 아닌 스킴", () => {
    assert.equal(stockRedirect("/stocks/005930", "", "javascript:alert(1)"), null);
  });
});
