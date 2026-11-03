import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { marketCapKR, multiple, percent, ratio, unsignedPercent } from "./number";

/**
 * 이 파일이 지키는 것 두 가지.
 *
 * 1. marketCapKR 이 음수를 조·억으로 접는다. 재무 탭의 영업이익은 적자가 될 수
 *    있는데, 크기 비교만 하면 음수가 두 분기를 모두 빠져나가 혼자 원 단위로 찍힌다.
 * 2. 비율 포맷의 부호 규약. 등락(percent)은 부호를 붙이고 수준(ROE·배당수익률)은
 *    붙이지 않는다. 둘을 섞으면 화면에 "ROE +30.79%" 같은 값이 나온다.
 */

describe("number · marketCapKR", () => {
  it("조·억 단위로 접는다", () => {
    assert.equal(marketCapKR(1_526_725_984_911_360), "1526.7조");
    assert.equal(marketCapKR(9_713_981_849_600), "9.7조");
    assert.equal(marketCapKR(824_000_000_000), "8,240억");
  });

  it("음수도 같은 단위로 접는다", () => {
    // 에코프로비엠 FY2024 영업손실. 고치기 전에는 "-34,109,363,660" 이 나왔다.
    assert.equal(marketCapKR(-34_109_363_660), "-341억");
    assert.equal(marketCapKR(-7_730_313_000_000), "-7.7조");
  });

  it("억 미만은 원 단위 그대로", () => {
    assert.equal(marketCapKR(1_234_567), "1,234,567");
    assert.equal(marketCapKR(-1_234_567), "-1,234,567");
  });

  it("0 에 음수 부호를 붙이지 않는다", () => {
    assert.equal(marketCapKR(0), "0");
  });
});

describe("number · 비율 표기", () => {
  it("PER·PBR 은 '배'로 쓴다 (거래량 배율의 x 와 구분)", () => {
    assert.equal(multiple(21.055), "21.06배");
    assert.equal(multiple(176.62), "176.62배");
    assert.equal(ratio(1.82), "1.82x");
  });

  it("수준을 나타내는 비율에는 부호를 붙이지 않는다", () => {
    assert.equal(unsignedPercent(30.792), "30.79%");
    assert.equal(unsignedPercent(0.57), "0.57%");
    assert.equal(unsignedPercent(13.1, 1), "13.1%");
  });

  it("등락률은 계속 부호를 붙인다", () => {
    assert.equal(percent(1.42), "+1.42%");
    assert.equal(percent(-0.29), "-0.29%");
  });
});
