"use client";

import { useQuery } from "@tanstack/react-query";
import { bff } from "@/lib/http/browser";
import { queryKeys } from "@/shared/query";
import type { ListedCompaniesStatus } from "../model/types";

const POLL_MS = 2_000;

/**
 * 상장사 목록 준비 상태.
 *
 * 준비가 끝나면 폴링을 멈춘다(`refetchInterval` 이 false 를 돌려주면 중단).
 * 예전에는 setTimeout 재귀로 직접 돌렸는데, 팔레트를 여닫을 때마다 타이머가
 * 새로 시작돼 실제로는 2초보다 잦게 요청이 나갔다. 이제는 키가 같으면
 * 캐시를 재사용하고, 여러 컴포넌트가 구독해도 요청은 하나다.
 *
 * ready 가 된 뒤에는 staleTime 을 길게 둬 팔레트를 다시 열어도 호출이 없다.
 */
export function useListedCompaniesStatus() {
  // 개발용: ?source=KIND 로 열면 폴백 경고 배너를 확인할 수 있다.
  const forced =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("source");

  const { data } = useQuery({
    queryKey: queryKeys.listedCompanies(forced),
    // 204(백엔드 상태 조회 실패)는 클라이언트가 null 로 돌려준다 — 배너를 숨길 뿐
    // 검색은 그대로 동작한다.
    queryFn: ({ signal }) =>
      bff.get<ListedCompaniesStatus>("/api/stocks/listed-companies", {
        query: { source: forced || undefined },
        signal,
      }),
    refetchInterval: (query) => (query.state.data?.ready ? false : POLL_MS),
    // 준비 완료 후에는 5분 동안 다시 묻지 않는다.
    staleTime: (query) => (query.state.data?.ready ? 5 * 60_000 : 0),
    retry: false,
  });

  return data ?? null;
}
