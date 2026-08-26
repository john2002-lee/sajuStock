"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ADVICE_STALE_MS,
  adviceQueryKey,
  MAX_BULK_SYMBOLS,
  type AdviceResult,
} from "../model/cache";
import { runAdvice } from "../model/run";
import type { AdviceStage, Decision } from "../model/types";

export interface BulkAdviceEntry {
  stage: AdviceStage;
  decision: Decision | null;
  running: boolean;
  error: string | null;
}

export interface BulkTarget {
  code: string;
  symbol: string;
}

const PENDING: BulkAdviceEntry = {
  stage: 0,
  decision: null,
  running: true,
  error: null,
};

const DONE = (decision: Decision): BulkAdviceEntry => ({
  stage: 4,
  decision,
  running: false,
  error: null,
});

/**
 * 동시에 여는 스트림 수 상한.
 *
 * 상한이 없으면 '전체 AI 분석'이 관심종목 수만큼 장시간 SSE POST 를 한꺼번에 연다.
 * 브라우저의 호스트당 연결 한도에 걸려 뒤쪽 요청이 큐에서 굶고, 백엔드는 종목당
 * LLM 4회를 한꺼번에 얻어맞는다. 3이면 사용자는 계속 진행을 보면서도 상류를
 * 밀어붙이지 않는다. 백엔드의 `advice_max_concurrent`(기본 4)가 이 값을 감안한 것이라,
 * 올리려면 그쪽도 함께 봐야 한다.
 */
const MAX_CONCURRENT = 3;

export interface BulkAdviceState {
  entries: Record<string, BulkAdviceEntry>;
  start: (targets: BulkTarget[]) => void;
  cancel: () => void;
  active: boolean;
  remaining: number;
  /** 상한을 넘어 이번에 돌리지 않은 종목 수. 0 이면 전부 돌았다 */
  skipped: number;
}

/**
 * 여러 종목의 AI 판단을 돌리고 종목별 진행 상태를 따로 들고 있는다.
 *
 * 종목당 LLM 4회(에이전트 3 + 종합 1)라 오래 걸린다. 그래서 하나의 전체 진행률이
 * 아니라 행마다 자기 단계를 보여준다 — 먼저 끝난 종목부터 판단이 뜬다.
 *
 * **비용 상한이 둘 붙어 있다.**
 *  1. 이미 받아 둔 판단은 다시 돌리지 않는다. 상세 화면에서 본 종목이나 방금 돌린
 *     종목은 캐시에서 즉시 채워지고 네트워크가 나가지 않는다 — `useAiAdvice` 와
 *     같은 쿼리 키를 쓰므로 두 화면이 하나의 캐시를 공유한다.
 *  2. 남은 종목도 `MAX_BULK_SYMBOLS` 개까지만 돌린다. 잘라낸 수는 `skipped` 로
 *     돌려주고 화면이 밝힌다 — 20개를 골랐는데 10개만 도는 것을 말없이 하면 버그로
 *     읽힌다.
 */
export function useBulkAdvice(): BulkAdviceState {
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<Record<string, BulkAdviceEntry>>({});
  const [skipped, setSkipped] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setEntries({});
    setSkipped(0);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(
    (targets: BulkTarget[]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // ① 캐시에 이미 있는 종목은 요청 없이 채운다. 상한은 **그러고도 남은** 것에만
      //    걸린다 — 캐시 적중분이 상한을 잡아먹으면 방금 본 종목 때문에 새 종목이
      //    밀려나는 이상한 동작이 된다.
      const fresh: Record<string, BulkAdviceEntry> = {};
      const pending: BulkTarget[] = [];

      for (const target of targets) {
        const cached = readFreshAdvice(queryClient, target.symbol);
        if (cached) fresh[target.code] = DONE(cached.decision);
        else pending.push(target);
      }

      // ② 남은 것에 총량 상한.
      const queue = pending.slice(0, MAX_BULK_SYMBOLS);
      setSkipped(pending.length - queue.length);

      setEntries({
        ...fresh,
        ...Object.fromEntries(queue.map(({ code }) => [code, { ...PENDING }])),
      });

      function run({ code, symbol }: BulkTarget) {
        return runAdvice({
          symbol,
          signal: controller.signal,
          onEvent: (event) =>
            setEntries((prev) => ({
              ...prev,
              [code]: {
                // 되감기 방지 — useAiAdvice 와 같은 이유
                stage: Math.max(prev[code]?.stage ?? 0, event.stage) as AdviceStage,
                decision: event.decision ?? prev[code]?.decision ?? null,
                error: event.error ?? prev[code]?.error ?? null,
                running: event.stage < 4 && !event.error,
              },
            })),
        })
          .then((result) => {
            // 단일 드로어와 같은 칸에 넣는다. 일괄로 돌린 종목을 곧바로 상세에서
            // 열면 이미 답이 있다 — 두 경로가 서로의 결과를 재사용한다.
            queryClient.setQueryData<AdviceResult>(adviceQueryKey(symbol), result);
            setEntries((prev) =>
              prev[code] ? { ...prev, [code]: DONE(result.decision) } : prev,
            );
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted) return;
            setEntries((prev) => ({
              ...prev,
              [code]: {
                ...(prev[code] ?? PENDING),
                running: false,
                error: error instanceof Error ? error.message : "unknown_error",
              },
            }));
          });
      }

      // 워커 MAX_CONCURRENT 개가 하나의 큐를 나눠 먹는다. 앞 종목이 끝나야
      // 다음 종목이 시작하므로 열려 있는 스트림 수가 상한을 넘지 않는다.
      const remaining = [...queue];
      const worker = async (): Promise<void> => {
        for (;;) {
          const next = remaining.shift();
          if (!next || controller.signal.aborted) return;
          await run(next);
        }
      };
      void Promise.all(
        Array.from({ length: Math.min(MAX_CONCURRENT, remaining.length) }, worker),
      );
    },
    [queryClient],
  );

  const active = Object.keys(entries).length > 0;
  const remaining = Object.values(entries).filter((e) => e.running).length;

  return { entries, start, cancel, active, remaining, skipped };
}

/**
 * 캐시에 있고 아직 신선한 판단만 돌려준다.
 *
 * `getQueryData` 는 신선도를 보지 않으므로 상태를 따로 조회한다 — 두 시간 전 판단을
 * "이미 있음" 으로 처리하면 사용자가 버튼을 눌렀는데 낡은 답이 그대로 뜬다.
 */
function readFreshAdvice(
  queryClient: ReturnType<typeof useQueryClient>,
  symbol: string,
): AdviceResult | undefined {
  const queryKey = adviceQueryKey(symbol);
  const data = queryClient.getQueryData<AdviceResult>(queryKey);
  if (!data) return undefined;

  const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0;
  return Date.now() - updatedAt < ADVICE_STALE_MS ? data : undefined;
}
