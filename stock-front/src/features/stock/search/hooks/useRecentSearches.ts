"use client";

import { useRecentSearchStore } from "@/store/recentSearches";

/** 최근 검색 종목. 저장은 store/recentSearches (zustand persist) 가 맡는다. */
export function useRecentSearches() {
  const codes = useRecentSearchStore((s) => s.codes);
  const names = useRecentSearchStore((s) => s.names);
  const push = useRecentSearchStore((s) => s.push);
  const learnNames = useRecentSearchStore((s) => s.learnNames);
  const clear = useRecentSearchStore((s) => s.clear);
  return { codes, names, push, learnNames, clear };
}
