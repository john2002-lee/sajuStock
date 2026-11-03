// 백엔드 없이 화면을 확인하기 위한 고정 타이밍 시퀀스 (README 프로토타입 값).
//
// BFF 라우트 안에 있던 것을 feature 로 내렸다. 어떤 단계가 몇 초에 오는지는
// **advice 도메인 지식**이고, 라우트가 알아야 할 것은 그것을 SSE 로 감싸는 방법뿐이다.
//
// 이벤트를 SSE 문자열이 아니라 **도메인 이벤트로 흘려보낸다.** 프레이밍(`data: …`)은
// 전송 계층의 일이라 라우트에 남는다 — 그래야 이 시퀀스를 테스트에서 SSE 파싱 없이
// 그대로 소비할 수 있다.

import {
  MOCK_AGENTS,
  MOCK_DECISION,
  MOCK_FALLBACK_DECISION,
  MOCK_TIMINGS,
} from "./mock";
import type { AdviceStreamEvent } from "./types";

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * 목 모드의 분석 진행을 실제 타이밍대로 흘려준다.
 *
 * `fallback` 은 **일부러 실패를 재현하는** 개발용 경로다 — 에이전트 3인이 전부
 * 실패하고 규칙 기반 판단이 내려오는 화면을 확인할 때 쓴다.
 *
 * 중단(`signal`)은 `sleep` 이 reject 하는 형태로 전파된다. 호출부는 그 예외를
 * 정상 종료로 받으면 된다.
 */
export async function* mockAdviceEvents(
  fallback: boolean,
  signal: AbortSignal,
): AsyncGenerator<AdviceStreamEvent> {
  let elapsed = 0;
  const waitUntil = async (at: number) => {
    await sleep(at - elapsed, signal);
    elapsed = at;
  };

  await waitUntil(MOCK_TIMINGS.stage1);
  yield { stage: 1 };
  await waitUntil(MOCK_TIMINGS.stage2);
  yield { stage: 2 };

  for (let i = 0; i < MOCK_AGENTS.length; i += 1) {
    await waitUntil(MOCK_TIMINGS.agents[i]);
    yield {
      stage: 3,
      agent: fallback
        ? {
            ...MOCK_AGENTS[i],
            status: "fallback" as const,
            summary: "에이전트 호출에 실패했습니다.",
            error: "llm_unavailable",
          }
        : MOCK_AGENTS[i],
    };
  }

  await waitUntil(MOCK_TIMINGS.decision);
  yield {
    stage: 4,
    decision: fallback ? MOCK_FALLBACK_DECISION : MOCK_DECISION,
  };
}
