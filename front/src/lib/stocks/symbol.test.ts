import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isResolvableSymbol, isTickerLike } from "./symbol";

/**
 * 이 파일이 지키는 것: **주소창이 상류 호출 증폭구가 되지 않는다.**
 *
 * 백엔드는 KRX 목록에 없는 문자열을 그대로 야후 티커로 써서 504봉을 내려받는다.
 * `isResolvableSymbol` 이 느슨해지면 `/stocks/<아무문자열>` 하나가 상류 호출 1~3회가
 * 되고, 그때 죽는 것은 그 페이지가 아니라 **정상 종목 전체의 시세·재무·뉴스**다.
 *
 * 반대로 지나치게 조이면 정상 링크가 후보 화면으로 떨어진다 — 통과해야 하는 모양을
 * 함께 고정해 두는 이유다.
 */

describe("symbol · 통과해야 하는 모양", () => {
  it("KRX 6자리 코드 — 화면의 모든 내부 링크가 이 모양이다", () => {
    assert.ok(isResolvableSymbol("005930"));
    assert.ok(isResolvableSymbol("247540"));
  });

  it("접미사가 붙은 형태 — 자동완성 응답의 symbol 이 그대로 주소에 실린다", () => {
    assert.ok(isResolvableSymbol("005930.KS"));
    assert.ok(isResolvableSymbol("247540.KQ"));
    assert.ok(isResolvableSymbol("005930.ks"));
  });

  it("해외 티커 — 점·하이픈이 섞인 실제 종목까지", () => {
    assert.ok(isResolvableSymbol("AAPL"));
    assert.ok(isResolvableSymbol("BRK.B"));
    assert.ok(isResolvableSymbol("RDS-A"));
  });

  it("앞뒤 공백은 무시한다", () => {
    assert.ok(isResolvableSymbol("  005930  "));
  });
});

describe("symbol · 막아야 하는 모양", () => {
  it("LIKE·URL 메타문자", () => {
    for (const raw of ["%", "_", "%25", "005930%", "*"]) {
      assert.equal(isResolvableSymbol(raw), false, raw);
    }
  });

  it("한글·공백·문장 — 검색어를 주소에 붙인 경우", () => {
    for (const raw of ["삼성전자", "samsung electronics", "삼성 전자"]) {
      assert.equal(isResolvableSymbol(raw), false, raw);
    }
  });

  it("자리수가 어긋난 숫자 — 스캐너가 훑는 모양이다", () => {
    for (const raw of ["12345", "1234567", "0059301", ""]) {
      assert.equal(isResolvableSymbol(raw), false, raw);
    }
  });

  it("경로·프로토콜을 섞은 값", () => {
    for (const raw of ["../admin", "http://x", "005930/../000660"]) {
      assert.equal(isResolvableSymbol(raw), false, raw);
    }
  });

  it("티커 모양이지만 너무 긴 것 (6자 초과)", () => {
    assert.equal(isResolvableSymbol("ABCDEFG"), false);
  });
});

describe("symbol · isTickerLike 는 그대로다", () => {
  it("검색이 '해외 티커로 조회' 행을 띄우는 판정 — 숫자는 통과하지 않는다", () => {
    assert.ok(isTickerLike("AAPL"));
    assert.equal(isTickerLike("005930"), false);
    assert.equal(isTickerLike("삼성"), false);
  });
});
