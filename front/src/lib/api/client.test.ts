import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { apiGetCached } from "./client.ts";
import { ApiError } from "./errors.ts";

/**
 * apiGetCached 의 타임아웃 규약을 고정한다.
 *
 * 핵심은 세 가지다:
 *   1. 타임아웃은 예외가 아니라 값이다 — 호출부가 화면을 degrade 할 수 있어야 한다.
 *   2. fetch 에 signal 을 넘기지 않는다 — 타임아웃 뒤에도 요청이 계속 진행돼
 *      Next 데이터 캐시가 채워져야 한다.
 *   3. cache: "force-cache" + next.revalidate 가 그대로 실려 캐시 대상으로 남는다.
 */

type Call = { url: string; init: RequestInit & { next?: { revalidate?: number } } };

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** fetch 를 가로채 호출 인자를 기록하고, 주어진 응답 프라미스를 돌려준다. */
function stubFetch(handler: (call: Call) => Promise<Response>) {
  const calls: Call[] = [];
  globalThis.fetch = ((url: string, init: Call["init"]) => {
    const call = { url: String(url), init };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof fetch;
  return calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("apiGetCached — 정상 응답", () => {
  test("제한 시간 안에 오면 { ok: true, data }", async () => {
    stubFetch(async () => json({ symbol: "005930" }));

    const result = await apiGetCached<{ symbol: string }>("/stocks/history", {
      query: { symbol: "005930" },
      revalidate: 60,
    });

    assert.deepEqual(result, { ok: true, data: { symbol: "005930" } });
  });

  test("캐시 옵션이 fetch 에 그대로 실린다", async () => {
    const calls = stubFetch(async () => json({}));

    await apiGetCached("/markets/overview", { query: { category: "home" }, revalidate: 900 });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.cache, "force-cache");
    assert.equal(calls[0].init.next?.revalidate, 900);
    assert.match(calls[0].url, /\/markets\/overview\?category=home$/);
  });
});

describe("apiGetCached — 타임아웃", () => {
  test("상류가 응답하지 않으면 예외가 아니라 { ok: false, reason: 'timeout' }", async () => {
    stubFetch(() => new Promise<Response>(() => {})); // 영원히 안 끝나는 요청

    const started = process.hrtime.bigint();
    const result = await apiGetCached("/stocks/history", {
      query: { symbol: "005930" },
      revalidate: 60,
      timeoutMs: 50,
    });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    assert.deepEqual(result, { ok: false, reason: "timeout" });
    assert.ok(elapsedMs >= 45, `타임아웃 전에 돌아왔다 (${elapsedMs.toFixed(1)}ms)`);
    assert.ok(elapsedMs < 1000, `너무 오래 걸렸다 (${elapsedMs.toFixed(1)}ms)`);
  });

  test("fetch 에 signal 을 넘기지 않는다 — 타임아웃 뒤에도 요청이 살아 캐시를 채운다", async () => {
    let settle: ((response: Response) => void) | undefined;
    let aborted = false;
    const calls = stubFetch((call) => {
      call.init.signal?.addEventListener("abort", () => {
        aborted = true;
      });
      return new Promise<Response>((resolve) => {
        settle = resolve;
      });
    });

    const result = await apiGetCached("/stocks/history", {
      query: { symbol: "005930" },
      revalidate: 60,
      timeoutMs: 30,
    });
    assert.deepEqual(result, { ok: false, reason: "timeout" });

    // 옵션 자체에 signal 이 없어야 한다.
    assert.equal(calls[0].init.signal, undefined);

    // 늦게 도착한 응답이 취소되지 않고 정상 처리된다 (unhandled rejection 도 없다).
    settle?.(json({ symbol: "005930" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(aborted, false);
  });

  test("타임아웃 뒤 늦게 실패해도 프로세스를 깨뜨리지 않는다", async () => {
    let fail: ((error: Error) => void) | undefined;
    stubFetch(
      () =>
        new Promise<Response>((_, reject) => {
          fail = reject;
        }),
    );

    const result = await apiGetCached("/stocks/history", {
      query: { symbol: "005930" },
      revalidate: 60,
      timeoutMs: 30,
    });
    assert.deepEqual(result, { ok: false, reason: "timeout" });

    fail?.(new Error("ECONNRESET"));
    await new Promise((resolve) => setTimeout(resolve, 20)); // unhandled rejection 이면 여기서 죽는다
  });
});

describe("apiGetCached — 오류는 타임아웃과 구분한다", () => {
  test("404 는 ApiError 로 던진다 (호출부가 후보 선택 화면으로 보낸다)", async () => {
    stubFetch(async () => json({ detail: "not found" }, 404));

    await assert.rejects(
      apiGetCached("/stocks/history", { query: { symbol: "없는종목" }, revalidate: 60 }),
      (error: unknown) => error instanceof ApiError && error.isNotFound,
    );
  });

  test("연결 실패는 전송 오류로 던진다", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });

    await assert.rejects(
      apiGetCached("/stocks/history", { query: { symbol: "005930" }, revalidate: 60 }),
      (error: unknown) => error instanceof ApiError,
    );
  });

  test("연결 실패는 isOffline 로 식별된다 — 상류 오류와 다른 화면으로 가야 한다", async () => {
    // 백엔드가 안 떠 있거나 STOCK_API_BASE_URL 의 포트가 틀리면 여기로 온다.
    // 재시도가 소용없으므로 503(isUpstream)·404(isNotFound)와 반드시 갈라져야 한다.
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });

    await assert.rejects(
      apiGetCached("/stocks/history", { query: { symbol: "005930" }, revalidate: 60 }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.isOffline &&
        error.status === 0 &&
        error.code === "network_error" &&
        !error.isNotFound &&
        !error.isUpstream,
    );
  });

  test("503 은 isOffline 이 아니다 — 백엔드는 살아 있고 공급자만 죽은 것이다", async () => {
    stubFetch(async () => json({ error: { code: "provider_unavailable" } }, 503));

    await assert.rejects(
      apiGetCached("/stocks/history", { query: { symbol: "005930" }, revalidate: 60 }),
      (error: unknown) => error instanceof ApiError && error.isUpstream && !error.isOffline,
    );
  });
});
