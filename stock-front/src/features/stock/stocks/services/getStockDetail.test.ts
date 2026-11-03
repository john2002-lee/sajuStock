import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getStockDetail } from "./getStockDetail.ts";

/**
 * **응답이 아니라 상류 호출 횟수를 센다.**
 *
 * 모양 게이트가 사라져도 응답은 그대로 `not-found` 다 — 백엔드가 없는 종목에 404 를
 * 주기 때문이다. 그래서 상태 코드만 단언하는 테스트는 게이트가 빠져도 초록으로
 * 남는다. 지키려는 것은 "그 요청이 야후까지 가지 않았다" 이므로 fetch 가 몇 번
 * 불렸는지를 본다 (백엔드의 LLM 대역 호출 수를 세는 테스트와 같은 자세다).
 */

const realFetch = globalThis.fetch;

function countingFetch() {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ detail: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return () => calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("getStockDetail · 모양 게이트", () => {
  it("종목일 수 없는 문자열은 상류를 부르지 않는다", async () => {
    const calls = countingFetch();

    for (const junk of ["삼성전자", "%", "12345", "../admin", "ABCDEFG"]) {
      const result = await getStockDetail(junk);
      assert.equal(result.status, "not-found", junk);
    }

    assert.equal(calls(), 0);
  });

  it("6자리 코드는 상류로 나간다 — 게이트가 정상 링크를 막지 않는다", async () => {
    const calls = countingFetch();

    const result = await getStockDetail("005930");

    // 대역이 404 를 주므로 결과는 위와 같다. 다른 것은 **나갔다는 사실**이다.
    assert.equal(result.status, "not-found");
    assert.equal(calls(), 1);
  });
});
