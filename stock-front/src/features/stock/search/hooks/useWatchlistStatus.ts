"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bff } from "@/lib/http/browser";
import { queryKeys } from "@/shared/query";

interface WatchlistCodesResponse {
  items: { code: string }[];
}

/**
 * 검색 팔레트의 ⇥(관심 추가)가 쓰는 관심종목 코드 집합.
 *
 * 서버(`/api/watchlist`)가 유일한 진실 소스다. 예전에는 localStorage 전용
 * zustand 스토어(`store/watchlist.ts`)를 썼는데, 그 스토어는 서버에 아무것도
 * 쓰지 않았다 — 팔레트에서 ⇥ 로 담아도 대시보드에는 아무것도 나타나지 않았다
 * (대시보드는 `features/watchlist` 의 서버 목록만 읽는다).
 *
 * 종목 상세의 `WatchToggle` 과 원칙은 같다: 낙관적으로 반영하고 실패하면
 * 되돌린다. 다만 여기는 특정 종목 하나가 아니라 **팔레트가 아는 관심 코드
 * 집합 전체**를 다루므로, 로컬 state 대신 React Query 캐시에 낙관적으로
 * 반영한다 — 이 feature 가 자동완성·상장사 상태에 이미 쓰는 것과 같은 스택
 * (`useSuggestions`, `useListedCompaniesStatus`)이라 새 의존성이 없다.
 *
 * 대시보드(`features/watchlist` 의 `useWatchlistMutations`)는 별도의 로컬
 * state 를 쓴다 — 그 화면은 서버 컴포넌트가 이미 첫 목록을 실어 보내므로 새로
 * 조회할 이유가 없다. 두 상태는 각자 서버에 쓰고 각자 읽으므로, 대시보드가
 * 열려 있는 동안 팔레트에서 담은 종목은 다음 조회(재방문·새로고침)에
 * 반영된다.
 */
export function useWatchlistStatus() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: queryKeys.watchlistCodes(),
    queryFn: async ({ signal }) => {
      const wire = await bff.get<WatchlistCodesResponse>("/api/watchlist", { signal });
      return wire?.items.map((item) => item.code) ?? [];
    },
    // 401(비로그인·익명 쿠키 없음)은 다시 물어도 결과가 같다.
    retry: false,
  });

  const codes = data ?? [];

  /**
   * 추가/삭제 여부(`watched`)는 **호출 시점에 한 번만** 정한다.
   *
   * 처음에는 `mutationFn` 안에서 캐시를 다시 읽어 정했는데, React Query 는
   * `onMutate` 를 `mutationFn` 보다 먼저 `await` 한다 — 그래서 `mutationFn` 이
   * 캐시를 읽을 때는 `onMutate` 가 이미 낙관적으로 뒤집어 놓은 값을 보게 되고,
   * 그 값으로 다시 "담겼나" 를 판정하면 정확히 반대 요청(추가해야 할 때 삭제,
   * 삭제해야 할 때 추가)을 서버로 보낸다. 호출부의 `codes`(이 렌더의 실제 상태)
   * 에서 한 번만 정해 `onMutate`·`mutationFn` 양쪽에 그대로 넘기면 이 경쟁이
   * 생길 자리가 없다.
   */
  const mutation = useMutation({
    mutationFn: async (item: { code: string; symbol: string; watched: boolean }) => {
      if (item.watched) {
        await bff.delete(`/api/watchlist/${item.code}`);
      } else {
        await bff.post("/api/watchlist", { symbol: item.symbol });
      }
    },
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.watchlistCodes() });
      const previous =
        queryClient.getQueryData<string[]>(queryKeys.watchlistCodes()) ?? [];
      const next = item.watched
        ? previous.filter((code) => code !== item.code)
        : [...previous, item.code];
      queryClient.setQueryData(queryKeys.watchlistCodes(), next);
      return { previous };
    },
    onError: (_error, _item, context) => {
      if (context) queryClient.setQueryData(queryKeys.watchlistCodes(), context.previous);
    },
  });

  const toggle = (item: { code: string; symbol: string }) => {
    mutation.mutate({ ...item, watched: codes.includes(item.code) });
  };

  return { codes, toggle };
}
