/**
 * 쿼리 키 단일 출처.
 *
 * 키를 호출부에 흩어 두면 오타 하나로 캐시가 갈라지고("삼성" 결과가 두 벌 저장됨)
 * 무효화 대상을 찾기도 어려워진다. 여기서만 만든다.
 */
export const queryKeys = {
  suggestions: (query: string, scope: string, mode: string, recent: string) =>
    ["suggestions", query, scope, mode, recent] as const,
  listedCompanies: (source: string | null) =>
    ["listed-companies", source] as const,
  watchlistCodes: () => ["watchlist-codes"] as const,
} as const;
