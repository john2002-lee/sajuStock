"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import {
  ADVICE_GC_MS,
  ADVICE_STALE_MS,
  adviceQueryKey,
  type AdviceResult,
} from "../model/cache";
import { runAdvice } from "../model/run";
import type { AdviceStage, AgentOpinion, Decision } from "../model/types";

/** 스트림이 도는 동안만 의미가 있는 상태. 결과는 React Query 가 들고 있다. */
interface Progress {
  stage: AdviceStage;
  agents: AgentOpinion[];
  error: string | null;
  /**
   * 이번 실행이 시작된 시각(ms). 진행 표시의 경과 초가 이것만 본다.
   *
   * **`isFetching` 전이를 보고 잡으면 안 된다.** 배경 refetch 와 캐시 적중에서도
   * 타이머가 돌아, 이미 완성된 판단 옆에서 초가 올라간다 — 아직 도는 중으로 읽힌다.
   */
  startedAt: number | null;
  /**
   * 사용자가 멈췄는가. 실패와 **구분해야** 화면이 다른 말을 할 수 있다 —
   * 멈춤은 본인이 알고 한 일이라 사과할 일이 아니고, 실패는 설명이 필요하다.
   */
  stopped: boolean;
  /**
   * 서버가 알려 준 이번 실행의 예산(ms). 진행 표시의 예고 문구가 이것만 본다 —
   * 프런트에 상수로 두면 백엔드 설정이 바뀌는 순간 화면이 거짓말을 한다.
   */
  budgetMs: number | null;
}

const IDLE: Progress = {
  stage: 0,
  agents: [],
  error: null,
  startedAt: null,
  stopped: false,
  budgetMs: null,
};

export interface AiAdviceState {
  stage: AdviceStage;
  agents: AgentOpinion[];
  decision: Decision | null;
  error: string | null;
  running: boolean;
  /** 이번 실행의 시작 시각(ms). 아직 시작 전이면 null */
  startedAt: number | null;
  /** 사용자가 멈춰서 끝났는가 */
  stopped: boolean;
  /** 서버가 알려 준 이번 실행의 예산(ms). 아직 못 받았으면 null */
  budgetMs: number | null;
  /** 캐시를 건너뛰고 다시 요청한다 */
  retry: () => void;
  /** 돌고 있는 분석을 멈춘다. 진행 중이 아니면 아무 일도 하지 않는다 */
  cancel: () => void;
}

/**
 * AI 판단 스트림 구독 + 결과 캐시.
 *
 * 예전에는 `enabled` 가 true 가 될 때마다 무조건 스트림을 열었다. 드로어를 닫았다
 * 다시 열면 같은 종목에 **LLM 4회가 또 나갔다** — 재무 조회에도 15분 캐시가 있는데
 * 정작 제일 비싼 경로만 캐시가 없었다.
 *
 * 이제 결과를 React Query 가 들고 있고, `ADVICE_STALE_MS` 안에는 요청 자체가 나가지
 * 않는다. 그 시간이 지나면 다시 물어보되, 새 기사가 없으면 **서버가** LLM 없이 같은
 * 답을 즉시 돌려준다 (model/cache.ts 의 2층 구조 주석).
 *
 * 상태가 두 갈래인 이유: 진행 단계·중간 에이전트 카드는 이번 실행에만 의미가 있어
 * 캐시하면 안 되고(다음에 열었을 때 남의 진행 바를 보게 된다), 판단 결과는 캐시해야
 * 한다. 그래서 진행은 로컬 state, 결과는 쿼리 캐시다.
 */
export function useAiAdvice({
  symbol,
  enabled,
  fallback = false,
}: {
  symbol: string;
  enabled: boolean;
  fallback?: boolean;
}): AiAdviceState {
  const queryClient = useQueryClient();
  // useQuery 자체는 키를 해시하므로 매 렌더 새 배열이어도 상관없지만, 아래 retry 의
  // useCallback 의존성에 들어가므로 고정한다 — 안 그러면 retry 가 렌더마다 새 함수가
  // 되어 FinalDecision 의 onRetry prop 이 계속 바뀐다.
  const queryKey = useMemo(
    () => adviceQueryKey(symbol, fallback),
    [symbol, fallback],
  );
  const [progress, setProgress] = useState<Progress>(IDLE);

  // 종목·모드가 바뀌면 진행 상태를 버린다. effect 로 하면 이전 종목의 진행 바가
  // 한 프레임 남으므로 렌더 중 조정 패턴을 쓴다(예전 구현과 같은 이유).
  const runToken = `${symbol}:${fallback}`;
  const [seenToken, setSeenToken] = useState(runToken);
  if (seenToken !== runToken) {
    setSeenToken(runToken);
    setProgress(IDLE);
  }

  const query = useQuery<AdviceResult>({
    queryKey,
    enabled,
    staleTime: ADVICE_STALE_MS,
    gcTime: ADVICE_GC_MS,
    // 전역 기본값은 5xx 를 한 번 더 시도한다. 여기서는 끈다 — 실패한 분석을 자동으로
    // 다시 돌리면 사용자가 아무것도 누르지 않았는데 LLM 4회가 더 나간다.
    retry: false,
    // 같은 이유로 재연결 자동 갱신도 끈다. 전역 기본값이 켜져 있고(QueryProvider),
    // **사용자가 멈춘 분석은 데이터가 없어 언제나 stale** 이라 — 지하철에서
    // 와이파이가 한 번 끊겼다 붙는 것만으로 멈춘 분석이 저절로 다시 돈다.
    refetchOnReconnect: false,
    queryFn: ({ signal }) => {
      // 경과 시간의 기준점은 여기서 잡는다. 스트림이 실제로 시작되는 자리이고,
      // 캐시 적중일 때는 이 함수가 아예 안 불린다.
      setProgress((prev) => ({ ...prev, startedAt: Date.now(), stopped: false }));
      return runAdvice({
        symbol,
        fallback,
        signal,
        onEvent: (event) =>
          setProgress((prev) => ({
            // `startedAt`·`stopped` 는 이벤트가 건드리지 않는다 — 이번 실행의
            // 정체성이지 진행 상황이 아니다.
            ...prev,
            // 진행은 되감기지 않는다. 에러 이벤트는 stage 를 싣지 않아 0 으로
            // 내려오는데, 그대로 반영하면 3/4 까지 찬 진행 바가 0 으로 튄다.
            stage: Math.max(prev.stage, event.stage) as AdviceStage,
            agents: event.agent ? [...prev.agents, event.agent] : prev.agents,
            error: event.error ?? prev.error,
            // 진행 이벤트에만 실려 온다. 한 번 받으면 그대로 들고 간다.
            budgetMs: event.budgetMs ?? prev.budgetMs,
          })),
      });
    },
  });

  const retry = useCallback(() => {
    setProgress(IDLE);
    // refetch 는 staleTime 을 무시한다. 서버 캐시까지 무시하지는 않는데, 그게 맞다 —
    // 재시도가 곧 LLM 4회를 다시 태우는 뜻이면 이 버튼을 누르기 무서워진다.
    // 규칙 기반 폴백은 애초에 서버가 캐시하지 않으므로 이 버튼이 진짜로 다시 돌린다.
    void queryClient.refetchQueries({ queryKey, exact: true });
  }, [queryClient, queryKey]);

  /**
   * 돌고 있는 분석을 멈춘다.
   *
   * `cancelQueries` 가 `queryFn` 에 넘긴 `signal` 을 끊고, 그 signal 은
   * `streamAdvice` 의 fetch 까지 이어져 있다 — 브라우저가 연결을 끊으면 BFF 의
   * `proxyStream` 이 `cancel()` 에서 업스트림을 취소한다. 즉 **취소가 상류의 LLM
   * 호출까지 닿는다.** 진행 상태도 함께 비운다: 3/4 까지 찬 진행 바를 멈춘 채로
   * 두면 아직 도는 것처럼 보인다.
   *
   * 일괄 분석에는 이미 `useBulkAdvice.cancel()` 이 있었는데 부르는 UI 가 없었다.
   * 단건도 같은 이유로 필요하다 — 종목당 LLM 4회를 사용자가 멈출 수 없었다.
   */
  const cancel = useCallback(() => {
    void queryClient.cancelQueries({ queryKey, exact: true });
    // 진행은 비우되 **멈췄다는 사실은 남긴다.** 예전에는 IDLE 로 통째로 지워서
    // 취소한 뒤의 화면이 '막 열린 화면' 과 완전히 같았다 — 무엇을 했는지도,
    // 무엇을 할 수 있는지도(재시도 버튼조차) 알 수 없었다.
    setProgress({ ...IDLE, stopped: true });
  }, [queryClient, queryKey]);

  const cached = query.data ?? null;

  return {
    // 캐시 적중이면 진행 바가 돈 적이 없다 — 완료 상태로 그린다.
    //
    // **`isFetching` 을 함께 보는 것이 중요하다.** 캐시가 있는 상태에서 '다시
    // 시도' 를 누르면 예전에는 진행 바가 4/4 에 굳은 채로 90초가 흘렀다 —
    // 눌러도 아무 일도 안 일어나는 것처럼 보였다.
    stage: cached && !query.isFetching ? 4 : progress.stage,
    // 완료 전에는 도착한 순서대로 쌓인 것을, 완료 뒤에는 캐시된 한 벌을 쓴다.
    // 실패했을 때 progress 쪽이 남아 있어야 이미 받은 카드가 사라지지 않는다.
    agents: cached ? cached.agents : progress.agents,
    decision: cached?.decision ?? null,
    error: query.error ? query.error.message : progress.error,
    running: query.isFetching,
    // 캐시 적중이면 `queryFn` 이 아예 안 불려 이미 null 이다 — 여기서 또 가릴
    // 이유가 없다. 가리면 **재시도가 도는 동안** 경과 초와 예고 문구가 통째로
    // 사라진다. 하필 시간 초과 착지 직후, 그것이 가장 필요한 순간에.
    startedAt: progress.startedAt,
    stopped: progress.stopped,
    budgetMs: progress.budgetMs,
    retry,
    cancel,
  };
}
