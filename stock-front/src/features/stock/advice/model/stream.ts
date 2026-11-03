import type { AdviceStreamEvent } from "./types";

/**
 * BFF 의 SSE 응답을 이벤트 단위로 흘려준다.
 * 단일 드로어(useAiAdvice)와 관심종목 일괄 분석(useBulkAdvice)이 함께 쓴다.
 */
export async function streamAdvice({
  symbol,
  fallback = false,
  signal,
  onEvent,
}: {
  symbol: string;
  fallback?: boolean;
  signal: AbortSignal;
  onEvent: (event: AdviceStreamEvent) => void;
}): Promise<void> {
  const response = await fetch("/api/stocks/advice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, fallback }),
    signal,
  });
  // 4xx(신원 없음·잘못된 심볼·상한 초과)도 BFF 가 항상 몸통을 SSE 에러 프레임으로
  // 채워 보낸다 — `response.ok` 가 아니라 5xx·빈 몸통만 하드 실패로 다룬다. 그래야
  // "요청이 너무 잦습니다" 같은 안내가 예외 메시지가 아니라 드로어의 에러 상태로
  // 정상적으로 뜬다(route.ts 의 `errorStream`).
  if (response.status >= 500 || !response.body) {
    throw new Error(`advice stream failed: ${response.status}`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;

      // SSE 는 빈 줄 하나로 이벤트를 구분한다.
      let cut = buffer.indexOf("\n\n");
      while (cut !== -1) {
        const raw = buffer.slice(0, cut).trim();
        buffer = buffer.slice(cut + 2);
        cut = buffer.indexOf("\n\n");
        if (!raw.startsWith("data:")) continue;

        // 프레임 하나가 깨져도(잘린 JSON 등) 스트림 전체를 죽이지 않는다 — 그
        // 프레임만 버리고 계속 읽는다.
        try {
          onEvent(JSON.parse(raw.slice(5).trim()) as AdviceStreamEvent);
        } catch {
          continue;
        }
      }
    }
  } finally {
    // 정상 종료·예외·abort 어느 경로로 빠져나가든 reader 를 반드시 놓는다. 놓지
    // 않으면 BFF 가 프록시하고 있는 업스트림 LLM 연결이 계속 열려 있는다
    // (`app/api/stocks/advice/route.ts` 의 `proxyStream` 이 같은 이유로
    // finally 에서 취소한다).
    void reader.cancel().catch(() => {});
  }
}
