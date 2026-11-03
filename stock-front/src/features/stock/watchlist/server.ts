/**
 * 관심종목 feature 의 **서버 전용 공개 경계.**
 *
 * ## 왜 `index.ts` 와 갈랐나
 *
 * `getWatchlist` 는 `@/lib/api` 를 타고 axios 인스턴스를 끌고 온다(서버 → FastAPI
 * 전송 수단). 그런데 이것이 `index.ts` 에 함께 실려 있어서, **클라이언트 컴포넌트가
 * 배럴 하나를 import 하는 것만으로 서버 API 계층 전체가 브라우저 번들에 실렸다** —
 * `DashboardBoard`("use client")가 `WatchRow`·`useWatchlistMutations` 를 가져오려고
 * `@/features/stock/watchlist` 를 부르는 것이 그 경로였고, 실측으로 `/dashboard` 첫 로드에
 * axios 청크 56KB 가 들어 있었다.
 *
 * 배럴은 그대로 **하나의 공개 경계**라는 규칙(CONVENTIONS 4)을 지키되, 런타임이
 * 다른 두 문으로 나눈다. 사이드이펙트가 있는 모듈(axios 인스턴스 생성)은 번들러가
 * 함부로 버릴 수 없어서, 트리셰이킹에 기대는 대신 애초에 안 닿게 한다.
 *
 * 서버 컴포넌트·라우트 핸들러는 여기서, 나머지는 `index.ts` 에서 가져간다.
 */
export { getWatchlist } from "./services/getWatchlist";
