/**
 * 관심종목 feature 의 공개 경계 — **브라우저에 실려도 되는 것만.**
 *
 * 서버 전용 조회(`getWatchlist`)는 여기 없다. `./server.ts` 에 있고, 그 파일 주석에
 * 왜 갈랐는지 적어 두었다 — 요약하면 클라이언트 컴포넌트가 이 배럴을 부르는 것만으로
 * 서버 API 계층(axios)이 번들에 실렸기 때문이다.
 */
export {
  useWatchlistMutations,
  type WatchlistMutations,
} from "./hooks/useWatchlistMutations";

/** 종목 상세에서 목록에 담는 유일한 통로. 이 버튼이 없어서 목록이 늘 비어 있었다 */
export { WatchToggle, type WatchToggleProps } from "./components/WatchToggle";

export { WatchlistHeader } from "./components/WatchlistHeader";
export { GroupTabs } from "./components/GroupTabs";
export { SortControl } from "./components/SortControl";
export { TableHeader } from "./components/TableHeader";
export { WatchRow } from "./components/WatchRow";
export { WatchCard } from "./components/WatchCard";
export { WatchRowCompact } from "./components/WatchRowCompact";
export { BulkActionBar } from "./components/BulkActionBar";
/** 표 머리·행·로딩 골격이 같은 컬럼을 써야 하므로 경계 밖으로 연다 */
export { WATCH_GRID } from "./components/grid";

export { returnPercent, SORT_LABELS } from "./model/types";
export { ALL_GROUP, visibleItems } from "./model/sort";
export type {
  AlertRule,
  Holding,
  RowAiStatus,
  SortKey,
  WatchGroup,
  WatchItem,
  Watchlist,
} from "./model/types";
