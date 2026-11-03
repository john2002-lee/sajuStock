/**
 * 종목 검색 feature 의 공개 경계 — **브라우저에 실려도 되는 것만.**
 *
 * 서버 전용(자동완성 조회·후보 근사 매칭·목 상태)은 `./server.ts` 에 있다.
 * 그것들은 `@/lib/api` 를 타므로, 여기 함께 두면 검색 팔레트를 쓰는 클라이언트
 * 컴포넌트가 서버 HTTP 계층을 통째로 브라우저로 데려간다.
 */
export { SearchProvider, useSearch } from "./components/SearchProvider";
export { SearchTrigger } from "./components/SearchTrigger";
export { useRecentSearches } from "./hooks/useRecentSearches";

export type {
  ListedCompaniesStatus,
  SearchMode,
  Suggestion,
  SuggestionGroup,
  SuggestionResponse,
} from "./model/types";
