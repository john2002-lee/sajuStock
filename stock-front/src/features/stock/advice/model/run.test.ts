import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  ADVICE_BUDGET_MS,
  ADVICE_STALE_MS,
  ADVICE_WARN_RATIO,
  adviceQueryKey,
  MAX_BULK_SYMBOLS,
} from "./cache.ts";
import { AI_TIMEOUT_MS } from "../../../../lib/config/env.ts";
import { runAdvice } from "./run.ts";
import { toAdviceEvent } from "./wire.ts";

/**
 * AI 판단은 종목당 LLM 4회다 — 이 프로젝트에서 유일하게 돈이 나가는 경로다.
 * 그래서 여기서 지키는 것은 화면 모양이 아니라 **무엇이 캐시에 들어가는가** 다.
 * 실패한 판단이 성공으로 접히면 그게 캐시에 굳어 다음 요청까지 조용히 재생된다.
 */

const encoder = new TextEncoder();
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** BFF 가 흘려보내는 SSE 를 그대로 흉내 낸다 */
function serve(frames: unknown[], { ok = true } = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      }
      controller.close();
    },
  });
  globalThis.fetch = (async () =>
    new Response(body, { status: ok ? 200 : 500 })) as typeof fetch;
}

/** 백엔드가 조용한 구간에 끼워 넣는 SSE 주석 프레임까지 섞어서 흘린다 */
function serveWithHeartbeats(frames: unknown[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      }
      controller.enqueue(encoder.encode(": keep-alive\n\n"));
      controller.close();
    },
  });
  globalThis.fetch = (async () => new Response(body, { status: 200 })) as typeof fetch;
}

const AGENT = (name: string) => ({
  agent: name,
  status: "done" as const,
  summary: "분석",
  stance: "긍정" as const,
});

const DECISION = {
  verdict: "BUY" as const,
  decisionLabel: "매수 가능",
  confidence: 71,
  answer: "BUY. 참고용.",
  buyConditions: [],
  riskNotes: [],
  source: "llm" as const,
  updatedAt: "2026-08-05T00:00:00Z",
};

function run() {
  return runAdvice({ symbol: "005930", signal: new AbortController().signal });
}

describe("runAdvice · 스트림을 캐시할 결과물로 접는다", () => {
  test("에이전트는 도착 순서대로 모으고 판단은 마지막 것을 쓴다", async () => {
    serve([
      { stage: 1 },
      { stage: 2 },
      { stage: 3, agent: AGENT("AI 저널리스트") },
      { stage: 3, agent: AGENT("AI 경제학자") },
      { stage: 3, agent: AGENT("AI 애널리스트") },
      { stage: 4, decision: DECISION },
    ]);

    const result = await run();

    assert.deepEqual(
      result.agents.map((opinion) => opinion.agent),
      ["AI 저널리스트", "AI 경제학자", "AI 애널리스트"],
    );
    assert.equal(result.decision.verdict, "BUY");
  });

  test("stage 0 에러는 성공으로 접히지 않는다", async () => {
    // 스트림은 **정상 종료**하면서 에러만 싣고 올 수 있다(상류 429 등). 이걸 성공으로
    // 처리하면 실패가 캐시에 들어가 staleTime 동안 계속 재생된다.
    serve([{ stage: 0, error: "Too Many Requests. Rate limited." }]);

    await assert.rejects(run(), /Rate limited/);
  });

  test("판단 없이 끝난 스트림도 거부한다", async () => {
    // 에이전트만 오고 종합이 없는 경우. 캐시에 '판단 없는 판단'이 들어가면
    // 화면은 영원히 빈 최종 블록을 그린다.
    serve([{ stage: 1 }, { stage: 3, agent: AGENT("AI 저널리스트") }]);

    await assert.rejects(run(), /판단을 받지 못했습니다/);
  });

  test("HTTP 실패는 그대로 올린다", async () => {
    serve([], { ok: false });

    await assert.rejects(run(), /advice stream failed: 500/);
  });
});

describe("advice 캐시 정책", () => {
  test("쿼리 키가 fallback 모드를 분리한다", () => {
    // fallback 은 일부러 실패를 재현하는 개발용 경로다. 정상 결과와 같은 칸에
    // 담기면 서로를 덮어써서, 개발 중 한 번 켠 것이 실제 판단을 지운다.
    assert.notDeepEqual(adviceQueryKey("005930.KS"), adviceQueryKey("005930.KS", true));
    assert.deepEqual(adviceQueryKey("005930.KS"), ["advice", "005930.KS", false]);
  });

  test("클라이언트 staleTime 이 서버 TTL 과 같다", () => {
    // back/app/core/config.py 의 advice_cache_ttl_seconds 기본값(600초).
    // 클라이언트가 더 짧으면 서버 캐시에만 닿는 헛 요청이 늘고, 더 길면 새 기사가
    // 떴는데도 화면이 모르는 구간이 생긴다. 한쪽을 바꾸면 이 테스트가 깨진다.
    assert.equal(ADVICE_STALE_MS, 600 * 1000);
  });

  test("일괄 분석 상한이 LLM 호출 40회 안에 있다", () => {
    // 종목당 4회. 이 숫자를 올릴 때는 그게 곧 비용이라는 것을 알고 올려야 한다.
    assert.ok(MAX_BULK_SYMBOLS * 4 <= 40);
  });
});

describe("실행 예산 — 시간 초과는 실패가 아니라 착지다", () => {
  test('source "timeout" 판단은 성공으로 접힌다', async () => {
    // **이 설계 전체의 급소다.** 백엔드가 예산을 넘겨 규칙 기반으로 착지시킨
    // stage 4 를 여기서 거부하면, 90초를 기다린 사용자에게 남는 것이 없다.
    // `runAdvice` 는 error 를 decision 보다 먼저 보므로, 착지 이벤트에 error 가
    // 한 글자라도 실리면 이 테스트가 깨진다 — 백엔드 계약과 짝을 이룬다.
    serve([
      { stage: 1 },
      { stage: 4, decision: { ...DECISION, source: "timeout" } },
    ]);

    const result = await run();

    assert.equal(result.decision.source, "timeout");
    assert.equal(result.decision.verdict, "BUY");
  });

  test("하트비트 주석 프레임이 이벤트를 삼키지 않는다", async () => {
    // 주석과 data 프레임이 붙어 오면 파서가 프레임 단위로 `data:` 를 보기 때문에
    // 바로 다음 프레임이 통째로 버려질 수 있다 — 그게 stage 4 면 판단이 사라진다.
    serveWithHeartbeats([
      { stage: 1 },
      { stage: 3, agent: AGENT("AI 저널리스트") },
      { stage: 4, decision: DECISION },
    ]);

    const result = await run();

    assert.equal(result.agents.length, 1);
    assert.equal(result.decision.verdict, "BUY");
  });
});

describe("시간 계층 — 숫자 사이의 부등식", () => {
  test("예산은 화면이 상수로 갖지 않고 서버가 알려 준다", () => {
    // 화면 문구의 숫자는 **이 상수가 아니라** 진행 이벤트가 실어 오는 값이다.
    // 그래야 back/.env 의 ADVICE_BUDGET_SECONDS 를 조여도 화면이 거짓말하지 않는다.
    assert.equal(toAdviceEvent({ stage: 1, budget_seconds: 42 }).budgetMs, 42_000);
    assert.equal(toAdviceEvent({ stage: 1 }).budgetMs, undefined);
    assert.ok(ADVICE_WARN_RATIO > 0 && ADVICE_WARN_RATIO < 1);
  });

  test("BFF 타임아웃이 백엔드 예산 기본값보다 넉넉하다", () => {
    // ADVICE_BUDGET_MS 는 화면 문구용이 아니라 **이 부등식의 기준값**이다
    // (cache.ts 주석). back/app/core/config.py 의 기본값 90초를 가정한다.
    assert.equal(ADVICE_BUDGET_MS, 90 * 1000);
    // 이것이 뒤집히면 규칙 기반 착지가 도착하기 **직전에** 스트림이 잘리고,
    // 사용자는 그 자리에서 원인 불명 에러를 본다 — 이번 변경이 없애려던 화면이다.
    //   예산(90) + 스트림 개시 전 조회(resolve_listing ≤ 20) + 여유(10)
    assert.ok(
      AI_TIMEOUT_MS / 1000 >= ADVICE_BUDGET_MS / 1000 + 20 + 10,
      `AI_TIMEOUT_MS(${AI_TIMEOUT_MS}ms)가 예산 + 개시 비용보다 짧다`,
    );
  });
});
