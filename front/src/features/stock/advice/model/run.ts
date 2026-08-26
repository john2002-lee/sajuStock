import { streamAdvice } from "./stream";
import type { AdviceResult } from "./cache";
import type { AdviceStreamEvent, AgentOpinion, Decision } from "./types";

/**
 * 스트림을 끝까지 돌려 **캐시에 넣을 결과물 하나**로 접는다.
 *
 * `streamAdvice` 는 이벤트를 흘려보낼 뿐 무엇도 남기지 않는다. 진행 표시에는 그게
 * 맞지만 캐시에는 "이 종목의 판단은 이것" 이라는 값 하나가 필요하다. 그 접는 일을
 * 훅마다 따로 하면 단일 드로어와 일괄 분석이 서로 다른 모양을 캐시에 넣게 된다.
 *
 * 진행 이벤트가 필요한 호출부는 `onEvent` 로 그대로 받아 본다 — 접는 것과 흘리는
 * 것을 겸한다.
 */
export async function runAdvice({
  symbol,
  fallback = false,
  signal,
  onEvent,
}: {
  symbol: string;
  fallback?: boolean;
  signal: AbortSignal;
  onEvent?: (event: AdviceStreamEvent) => void;
}): Promise<AdviceResult> {
  // 콜백 안에서 채우는 값을 `let` 으로 두면 TS 제어 흐름 분석이 "콜백은 안 돌 수도
  // 있다" 고 보아 아래에서 계속 null 로 좁힌다. 객체 속성은 그 좁히기를 받지 않는다.
  const collected: { decision?: Decision; error?: string } = {};
  const agents: AgentOpinion[] = [];

  await streamAdvice({
    symbol,
    fallback,
    signal,
    onEvent: (event) => {
      if (event.agent) agents.push(event.agent);
      if (event.decision) collected.decision = event.decision;
      if (event.error) collected.error = event.error;
      onEvent?.(event);
    },
  });

  // 스트림은 정상 종료하면서 에러 이벤트만 싣고 올 수 있다(stage 0). 그걸 성공으로
  // 접으면 실패한 판단이 캐시에 굳어 다음 요청까지 조용히 재생된다.
  if (collected.error) throw new Error(collected.error);
  if (!collected.decision) throw new Error("판단을 받지 못했습니다.");

  return { agents, decision: collected.decision };
}
