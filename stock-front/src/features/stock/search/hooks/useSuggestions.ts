"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { bff } from "@/lib/http/browser";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { queryKeys } from "@/shared/query";
import type { ParsedQuery } from "../model/match";
import type { SuggestionResponse } from "../model/types";

const DEBOUNCE_MS = 200;

const EMPTY: SuggestionResponse = {
  query: "",
  mode: "name",
  groups: [],
  total: 0,
  elapsedMs: 0,
};

/**
 * 자동완성. 호출을 줄이는 장치가 세 겹이다.
 *
 * 1. 디바운스 200ms — 타이핑 중간 글자에 대한 요청 자체를 만들지 않는다.
 * 2. React Query 캐시 — 같은 (검색어, 범위, 모드)면 네트워크가 나가지 않는다.
 *    "삼성전자"까지 쳤다가 지우고 다시 치는 흔한 패턴에서 요청이 0회가 된다.
 *    종목 목록은 하루 단위로도 거의 안 바뀌므로 staleTime 을 5분으로 길게 잡는다.
 * 3. 중복 제거 — 같은 키의 요청이 이미 떠 있으면 새로 만들지 않는다.
 *
 * placeholderData 로 이전 결과를 유지해, 새 결과가 올 때까지 목록이 비었다가
 * 다시 차는 깜빡임이 없다 (요청 수와는 별개로 체감 품질).
 */
export function useSuggestions({
  parsed,
  recentCodes,
}: {
  parsed: ParsedQuery;
  recentCodes: string[];
}) {
  const debounced = useDebouncedValue(parsed.query, DEBOUNCE_MS);
  const recentKey = recentCodes.join(",");
  const { scope, mode } = parsed;

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.suggestions(debounced, scope, mode, recentKey),
    queryFn: ({ signal }) =>
      bff.get<SuggestionResponse>("/api/stocks/suggestions", {
        // 클라이언트가 직렬화한다 — undefined·빈 값은 알아서 빠진다.
        query: { q: debounced, scope, mode, recent: recentKey || undefined },
        signal,
      }),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });

  return { result: data ?? EMPTY, loading: isFetching };
}
