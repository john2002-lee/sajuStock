import type { AdviceStreamEvent } from "@/features/stock/advice";
import {
  mockAdviceEvents,
  toAdviceEvent,
  type WireAdviceEvent,
} from "@/features/stock/advice/server";
import { apiPostStream, ApiError, consumeRateLimit } from "@/lib/api";
import { ADVICE_API_KEY, AI_TIMEOUT_MS, USE_MOCK } from "@/lib/config/env";
import { isResolvableSymbol } from "@/lib/stocks/symbol";
import { adviceOwnerKey } from "@/app/_data/advice";

/**
 * AI 판단 스트리밍 (BFF). 브라우저는 FastAPI 를 직접 부르지 않는다.
 *
 * 실 모드에서는 백엔드 `POST /stocks/advice/stream` 의 SSE 를 그대로 흘려보내고,
 * 이벤트 스키마만 프런트 타입으로 맞춘다 (snake_case → camelCase).
 * `USE_MOCK=1` 이면 고정 타이밍 목 시퀀스를 낸다 — 백엔드 없이 화면을 확인할 때 쓴다.
 */

export const revalidate = 0;

const encoder = new TextEncoder();
const frame = (event: AdviceStreamEvent) =>
  encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

/**
 * SSE 주석 프레임. 백엔드가 조용한 구간에 보내는 것을 **그대로 되뿜는다.**
 *
 * 여기서 버리면 백엔드↔Next 구간만 지켜지고 브라우저↔Next 구간은 무방비가 된다 —
 * 이 라우트 앞에도 프록시·로드밸런서가 설 수 있고 그쪽 유휴 타임아웃은 대개 60초다.
 *
 * **빈 줄까지가 한 프레임이다.** 줄을 하나 줄이면 브라우저 파서가 프레임 단위로
 * `data:` 를 보기 때문에 바로 다음 프레임이 통째로 버려진다 — 그게 최종 판단이면
 * 사용자는 90초를 기다린 끝에 아무것도 못 받는다.
 */
const KEEP_ALIVE = encoder.encode(": keep-alive\n\n");

/** 스트림을 열기도 전에 끝나는 실패를 단일 에러 프레임으로 낸다 — 드로어는
 * SSE 프레임만 파싱하므로 여기서도 평범한 4xx 본문 대신 이 형태를 쓴다. */
function errorStream(message: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(frame({ stage: 0, error: message }));
      controller.close();
    },
  });
}

/**
 * 종목당 LLM 4회다. 한 소유자가 짧은 시간에 너무 많이 돌리면 막는다 — 클라이언트의
 * `MAX_CONCURRENT`·`MAX_BULK_SYMBOLS`(features/advice/model/cache.ts)는 이 라우트를
 * 직접 두드리면 우회된다. 전체 AI 분석 한 번(최대 10종목)을 넉넉히 담는 값으로 잡는다.
 */
const ADVICE_RATE_LIMIT_MAX = 15;
const ADVICE_RATE_LIMIT_WINDOW_MS = 5 * 60_000;

/** 목 시퀀스는 feature 가 소유한다 — 여기서는 SSE 로 감싸기만 한다. */
function mockStream(fallback: boolean, signal: AbortSignal): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of mockAdviceEvents(fallback, signal)) {
          controller.enqueue(frame(event));
        }
      } catch {
        // 중단은 정상 종료다 (sleep 이 signal.reason 으로 reject 한다).
      }
      controller.close();
    },
  });
}


/** 백엔드 SSE 를 읽어 프런트 이벤트로 다시 내보낸다 */
function proxyStream(upstream: Response, signal: AbortSignal): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      const reader = upstream
        .body!.pipeThrough(new TextDecoderStream())
        .getReader();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;

          let cut = buffer.indexOf("\n\n");
          while (cut !== -1) {
            const raw = buffer.slice(0, cut).trim();
            buffer = buffer.slice(cut + 2);
            cut = buffer.indexOf("\n\n");
            if (!raw.startsWith("data:")) {
              // 주석 프레임(하트비트)이다. 브라우저 쪽 `streamAdvice` 도 같은
              // 규칙으로 건너뛰므로 클라이언트는 손댈 것이 없다.
              controller.enqueue(KEEP_ALIVE);
              continue;
            }
            controller.enqueue(
              frame(toAdviceEvent(JSON.parse(raw.slice(5).trim()) as WireAdviceEvent)),
            );
          }
        }
        controller.close();
      } catch (error) {
        // 사용자가 끊은 것(signal.aborted)은 실패가 아니다 — 아무것도 안 보낸다.
        if (!signal.aborted) {
          const failure = error as { name?: string; message?: string };
          // `AbortSignal.timeout` 이 만든 것은 영어 DOMException 이라 그대로 흘리면
          // 사용자가 읽을 수 없는 문장이 뜬다. 그리고 이 분기가 도는 것 자체가
          // **시간 계층이 뒤집혔다는 신호**다 — 백엔드 예산이 먼저 터졌다면 규칙
          // 기반 착지가 stage 4 로 도착했어야 한다 (`lib/config/env` 의 부등식).
          controller.enqueue(
            frame({
              stage: 0,
              error:
                failure.name === "TimeoutError"
                  ? "분석이 시간 안에 끝나지 않았습니다."
                  : (failure.message ?? "AI 분석을 불러오지 못했습니다."),
            }),
          );
        }
        controller.close();
      } finally {
        void reader.cancel().catch(() => {});
      }
    },
    cancel() {
      void upstream.body?.cancel().catch(() => {});
    },
  });
}

export async function POST(request: Request) {
  const { symbol = "", fallback = false } = (await request
    .json()
    .catch(() => ({}))) as { symbol?: string; fallback?: boolean };

  const signal = request.signal;
  const headers = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };

  // **로그인 게이트가 목 분기보다 앞이다.** 목은 LLM 을 부르지 않으므로 비용만 보면
  // 뒤에 둬도 되지만, 그러면 이 라우트의 계약이 환경 변수에 따라 둘로 갈라진다 —
  // 게다가 화면 쪽 게이트(`canUseAdvice`)는 `USE_MOCK` 을 모르므로, 라우트만 열어
  // 두면 "버튼은 없는데 라우트는 응답하는" 어긋난 상태가 된다. 목으로 화면을 볼
  // 때도 로그인한 상태로 본다.
  //
  // 소유자 키는 백엔드가 그 사람의 투자 성향으로 판단을 개인화하는 데도 쓴다
  // (2축 판단 · `personal`). 브라우저는 이 헤더를 직접 만들지 않는다.
  const owner = await adviceOwnerKey();

  // 종목당 LLM 4회짜리 문이다. 익명에게 열어 두면 소유자 단위 상한이 "쿠키를 버리고
  // 다시 온다" 로 우회되므로 계정을 요구한다 — 판단 규칙과 그 예외(로그인이 꺼진
  // 배치)는 `_data/advice` 가 소유한다. 여기서 조건을 다시 적지 않는다.
  if (!owner) {
    return new Response(
      errorStream("AI 분석은 로그인 후 이용할 수 있습니다."),
      { headers, status: 401 },
    );
  }

  if (USE_MOCK) {
    return new Response(mockStream(fallback, signal), { headers });
  }

  // 모양이 종목 심볼이 아니면 백엔드까지 보내지 않는다 — `getStockDetail` 이
  // 상세 조회에 쓰는 것과 같은 게이트다(`isResolvableSymbol` 주석: 임의 문자열이
  // 그대로 상류 호출로 증폭되는 것을 막는다).
  if (!isResolvableSymbol(symbol)) {
    return new Response(errorStream("종목을 특정할 수 없습니다."), {
      headers,
      status: 400,
    });
  }

  // 클라이언트의 `MAX_CONCURRENT`·`MAX_BULK_SYMBOLS` 는 이 라우트를 직접 두드리면
  // 우회된다 — 여기서도 소유자 단위로 한 번 더 막는다.
  if (!consumeRateLimit(`advice:${owner}`, ADVICE_RATE_LIMIT_MAX, ADVICE_RATE_LIMIT_WINDOW_MS)) {
    return new Response(errorStream("요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요."), {
      headers,
      status: 429,
    });
  }

  try {
    const upstream = await apiPostStream(
      "/stocks/advice/stream",
      { symbol },
      {
        signal,
        timeoutMs: AI_TIMEOUT_MS,
        // 공유 비밀키는 **여기서만** 붙는다. 이 라우트 핸들러는 서버에서만 돌므로
        // 브라우저는 이 헤더도, 값도 보지 못한다. 비어 있으면 헤더를 붙이지 않고,
        // 백엔드도 미설정이면 통과시킨다 — 로컬 개발이 키 없이 그대로 돈다.
        // `owner` 는 위에서 이미 빈 값을 걸렀으므로 여기서는 항상 있다.
        headers: {
          ...(ADVICE_API_KEY ? { "X-Advice-Key": ADVICE_API_KEY } : {}),
          "X-Owner-Key": owner,
        },
      },
    );
    return new Response(proxyStream(upstream, signal), { headers });
  } catch (error) {
    // 스트림을 열기도 전에 실패한 경우 — 드로어가 에러 상태를 그리도록 이벤트로 전달한다.
    const message =
      error instanceof ApiError ? error.message : "AI 분석을 시작하지 못했습니다.";
    return new Response(errorStream(message), { headers });
  }
}
