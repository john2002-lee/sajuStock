// 종목 탐색(/stocks) 정렬·필터 파라미터.
//
// URL 이 곧 상태다 — 필터가 클라이언트 state 가 아니라 searchParams 라, 검증되지 않은
// 문자열이 그대로 백엔드 쿼리에 실릴 수 있다. 그 경계를 여기서 막는다.
//
// 링크 생성·옵션 목록도 전부 여기 있다. 컴포넌트가 `RANKING_BOARDS.map()` 을 돌며
// 라벨을 찾고 href 를 만들면, 같은 조합 로직이 시장·정렬 두 벌로 복사된다. 순수
// 함수로 내려 두면 테스트가 되고(ranking.test.ts) 컴포넌트는 그리기만 남는다.

import type { FilterOption } from "./filters";

export const RANKING_SORTS = ["market_cap", "change"] as const;
export const RANKING_BOARDS = ["ALL", "KOSPI", "KOSDAQ"] as const;

export type RankingSort = (typeof RANKING_SORTS)[number];
export type RankingBoard = (typeof RANKING_BOARDS)[number];

/** 이 화면의 상태 전부. searchParams 와 1:1 이다. */
export interface RankingQuery {
  sort: RankingSort;
  board: RankingBoard;
}

export const SORT_LABELS: Record<RankingSort, string> = {
  market_cap: "시가총액순",
  change: "등락률순",
};

export const BOARD_LABELS: Record<RankingBoard, string> = {
  ALL: "전체",
  KOSPI: "코스피",
  KOSDAQ: "코스닥",
};

/** 탐색 화면 한 페이지 종목 수. 백엔드 상한(100) 안이다. */
export const RANKING_PAGE_SIZE = 50;

/** 표가 가진 열. 정렬 표식을 어디에 찍을지 정하는 데 쓴다. */
export type RankingColumn =
  | "rank"
  | "name"
  | "spark"
  | "price"
  | "change"
  | "marketCap";

/** 정렬이 실제로 만드는 열. 그 외 열은 정렬과 무관하다. */
export type SortedColumn = Extract<RankingColumn, "change" | "marketCap">;

/**
 * 정렬 기준이 어느 열인지.
 *
 * 백엔드는 두 정렬 모두 **내림차순**이다 (`market_service._ranked_rows` — 시총은
 * 내림차순 정렬, 등락률은 스냅샷이 이미 내림차순). 그래서 방향을 값으로 들 필요가
 * 없고, 표는 활성 열에 `aria-sort="descending"` 을 고정으로 붙인다.
 */
export const SORTED_COLUMN: Record<RankingSort, SortedColumn> = {
  market_cap: "marketCap",
  change: "change",
};

/**
 * 필터 칩 하나가 필요로 하는 것 전부. 모양은 `model/filters` 가 소유한다 —
 * 조건 검색의 칩과 같은 네 필드이고, 같은 `FilterChip` 이 그린다.
 *
 * `value` 를 남겨 두는 것은 React key 와 테스트 때문이다 — 라벨은 번역되면 바뀌지만
 * value 는 URL 계약이라 바뀌지 않는다.
 */
export type RankingFilterOption<Value extends string> = FilterOption<Value>;

/**
 * `?sort=` 를 안전한 값으로 좁힌다. 모르는 값은 조용히 기본값으로 떨어뜨린다.
 *
 * 400 을 띄우지 않는 이유: 링크를 잘못 눌렀거나 오래된 북마크로 들어온 사람에게
 * 오류 화면을 주는 것보다 기본 목록을 보여주는 편이 낫다.
 */
export function parseSort(value: string | undefined): RankingSort {
  return RANKING_SORTS.includes(value as RankingSort)
    ? (value as RankingSort)
    : "market_cap";
}

export function parseBoard(value: string | undefined): RankingBoard {
  return RANKING_BOARDS.includes(value as RankingBoard)
    ? (value as RankingBoard)
    : "ALL";
}

/** searchParams 한 벌을 검증된 상태로. 페이지가 파싱을 두 줄로 나눠 쓰지 않게 한다. */
export function parseRankingQuery(params: {
  sort?: string;
  board?: string;
}): RankingQuery {
  return { sort: parseSort(params.sort), board: parseBoard(params.board) };
}

/**
 * 필터 칩이 거는 링크. 현재 조건에서 한 축만 바꾼다.
 *
 * **페이지는 싣지 않는다.** 조건을 바꾸면 1페이지로 돌아가는 것이 맞다 — 3페이지에서
 * 시장을 코스닥으로 바꿨는데 3페이지에 남으면 사용자는 자기가 어디를 보고 있는지
 * 알 수 없다 (`model/paging` 주석).
 */
export function rankingHref(
  current: RankingQuery,
  patch: Partial<RankingQuery>,
): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  // 기본값은 URL 에 싣지 않는다 — /stocks 와 /stocks?sort=market_cap&board=ALL 이
  // 같은 화면인데 주소만 다르면 공유·뒤로가기가 지저분해진다.
  if (next.sort !== "market_cap") params.set("sort", next.sort);
  if (next.board !== "ALL") params.set("board", next.board);

  const query = params.toString();
  return query ? `/stocks?${query}` : "/stocks";
}

/** 조건은 그대로 두고 페이지만 바꾸는 링크. 페이지네이션이 쓴다. */
export function rankingPageHref(current: RankingQuery, page: number): string {
  const base = rankingHref(current, {});
  if (page <= 1) return base;
  return base.includes("?") ? `${base}&page=${page}` : `${base}?page=${page}`;
}

/** 시장 축 칩 목록 (전체·코스피·코스닥). */
export function boardOptions(
  current: RankingQuery,
): RankingFilterOption<RankingBoard>[] {
  return RANKING_BOARDS.map((value) => ({
    value,
    label: BOARD_LABELS[value],
    href: rankingHref(current, { board: value }),
    selected: value === current.board,
  }));
}

/** 정렬 축 칩 목록 (시가총액순·등락률순). */
export function sortOptions(
  current: RankingQuery,
): RankingFilterOption<RankingSort>[] {
  return RANKING_SORTS.map((value) => ({
    value,
    label: SORT_LABELS[value],
    href: rankingHref(current, { sort: value }),
    selected: value === current.sort,
  }));
}
