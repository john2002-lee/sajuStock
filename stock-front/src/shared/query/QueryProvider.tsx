"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * 클라이언트 쪽 서버 호출의 캐시 계층.
 *
 * **서버 컴포넌트의 fetch 는 여기로 옮기지 않는다.** 상세·홈은 이미
 * `lib/api/client.ts` 가 Next 의 데이터 캐시(`next: { revalidate: 60 }`)를 쓰고 있어
 * 60초에 한 번만 백엔드를 친다. 그걸 React Query 로 바꾸면 같은 데이터를 JS 번들로
 * 한 번 더 실어 보내는 셈이라 호출 수는 그대로면서 페이로드만 커진다.
 *
 * React Query 가 실제로 호출을 줄이는 곳은 **브라우저에서 반복 호출하는 경로**다:
 *   - 자동완성: 같은 검색어를 다시 치면 네트워크 0회 (queryKey 캐시 적중)
 *   - 상장사 준비 상태: 여러 컴포넌트가 구독해도 요청은 1개 (자동 중복 제거)
 */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 이 시간 안에는 같은 키를 다시 요청하지 않는다. 화면 전환·재마운트에도
        // 네트워크가 나가지 않는 핵심 설정이다.
        staleTime: 60_000,
        // 화면에서 사라진 뒤에도 캐시를 5분 유지 — 뒤로가기 후 즉시 표시된다.
        gcTime: 5 * 60_000,
        // 탭을 다시 볼 때마다 시세를 새로 부르지 않는다. 장중 실시간성이 필요하면
        // 해당 쿼리에서만 켠다.
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        // 4xx 는 재시도해도 결과가 같다. 5xx·네트워크 오류만 한 번 더.
        retry: (failureCount, error) => {
          const status = (error as { status?: number })?.status;
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 1;
        },
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // useState 로 만들어야 요청마다/리렌더마다 새 클라이언트가 생기지 않는다.
  // 모듈 최상단에 두면 서버에서 모든 사용자가 캐시를 공유하게 된다.
  const [client] = useState(createQueryClient);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
