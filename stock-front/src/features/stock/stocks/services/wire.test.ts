import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toFundamentals, type WireStockFundamentals } from "./wire";

/**
 * 백엔드 StockFundamentals → 도메인 Fundamentals 변환.
 *
 * 이 어댑터가 하는 일은 이름 바꾸기뿐이다 — 단위 변환은 백엔드가 이미 끝냈다.
 * 여기서 값을 만지기 시작하면 백엔드와 프런트 두 곳에 규약이 생긴다.
 */

const FULL: WireStockFundamentals = {
  symbol: "005930.KS",
  currency: "KRW",
  per: 21.06,
  pbr: 3.64,
  eps: 11039.89,
  bps: 63873.63,
  roe_pct: 30.79,
  market_cap: 1526725984911360,
  dividend_yield_pct: 0.57,
  dividend_per_share: 1496,
  ex_dividend_date: "2026-06-29",
  next_earnings_date: "2026-10-28",
  annual: [
    {
      fiscal_year: 2025,
      revenue: 333605938000000,
      operating_income: 43601051000000,
      net_income: 44260956000000,
    },
    {
      fiscal_year: 2024,
      revenue: 300870903000000,
      operating_income: 32725961000000,
      net_income: null,
    },
  ],
};

const EMPTY: WireStockFundamentals = {
  symbol: "999999.KQ",
  currency: null,
  per: null,
  pbr: null,
  eps: null,
  bps: null,
  roe_pct: null,
  market_cap: null,
  dividend_yield_pct: null,
  dividend_per_share: null,
  ex_dividend_date: null,
  next_earnings_date: null,
  annual: [],
};

describe("wire · toFundamentals", () => {
  it("snake_case 를 camelCase 로 옮긴다", () => {
    const result = toFundamentals(FULL);

    assert.equal(result.per, 21.06);
    assert.equal(result.pbr, 3.64);
    assert.equal(result.eps, 11039.89);
    assert.equal(result.bps, 63873.63);
    assert.equal(result.roePercent, 30.79);
    assert.equal(result.marketCap, 1526725984911360);
    assert.equal(result.dividendYieldPercent, 0.57);
    assert.equal(result.dividendPerShare, 1496);
    assert.equal(result.exDividendDate, "2026-06-29");
    assert.equal(result.nextEarningsDate, "2026-10-28");
  });

  it("값을 다시 계산하지 않는다 — 단위 규약의 소유자는 백엔드다", () => {
    const result = toFundamentals(FULL);

    // roe_pct 는 이미 ×100 된 값, dividend_yield_pct 는 공급자가 준 백분율.
    // 여기서 한 번 더 곱하면 화면에 3079% / 57% 가 뜬다.
    assert.equal(result.roePercent, FULL.roe_pct);
    assert.equal(result.dividendYieldPercent, FULL.dividend_yield_pct);
  });

  it("연간 실적은 최신 우선 순서를 그대로 유지한다", () => {
    const result = toFundamentals(FULL);

    assert.deepEqual(
      result.annual.map((row) => row.year),
      [2025, 2024],
    );
    assert.equal(result.annual[0].revenue, 333605938000000);
    assert.equal(result.annual[0].operatingIncome, 43601051000000);
  });

  it("전 필드가 null 이어도 던지지 않는다", () => {
    const result = toFundamentals(EMPTY);

    assert.equal(result.per, null);
    assert.equal(result.roePercent, null);
    assert.deepEqual(result.annual, []);
  });

  it("빈 문자열 날짜는 null 로 접는다 (toNews 와 같은 규칙)", () => {
    const result = toFundamentals({ ...FULL, ex_dividend_date: "", next_earnings_date: "" });

    assert.equal(result.exDividendDate, null);
    assert.equal(result.nextEarningsDate, null);
  });
});
