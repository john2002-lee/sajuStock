/**
 * 종목 검색 feature 의 **서버 전용 공개 경계.**
 *
 * BFF 라우트(`app/api/stocks/suggestions`·`listed-companies`)만 쓴다.
 * `index.ts` 와 가른 이유는 `features/watchlist/server.ts` 와 같다 —
 * `searchSuggestions` 는 `@/lib/api` 를 타고 서버 HTTP 계층을 끌고 오므로,
 * 배럴이 하나면 검색 팔레트(클라이언트)가 그것을 브라우저로 데려간다.
 *
 * 예전에는 두 라우트가 `@/features/stock/search/model/...`·`services/...` 를 **깊게
 * 참조**했다. feature 내부 파일을 밖에서 직접 열면 이름을 바꾸는 순간 라우트가
 * 깨진다 (CONVENTIONS 4: 경계는 배럴로만).
 */
export { searchSuggestions } from "./services/searchSuggestions";
export { resolveCandidates } from "./services/resolveCandidates";
export {
  mockListedStatus,
  parseListedSource,
} from "./model/mockStatus";
export type { SearchScope } from "./model/match";
