/**
 * 목록 페이지네이션. 랭킹(`/stocks`)과 조건 검색(`/stocks/screener`)이 함께 쓴다.
 *
 * ## 왜 필요했나
 *
 * 두 화면 다 50행에서 끝나 있었다. 조건 검색은 모집단이 2,800종목이 넘는데
 * **51위 이하는 도달할 방법이 아예 없었다** — `getScreener` 는 처음부터 `offset` 을
 * 받았고 백엔드도 지원했는데 페이지가 넘기지 않았을 뿐이다. 화면 하단에 "잘렸다"는
 * 안내만 있고 넘길 수단이 없는 상태였다.
 *
 * ## `page` 를 필터 객체에 넣지 않는다
 *
 * `RankingQuery`·`ScreenerQuery` 는 **조건**이고 페이지는 그 조건을 훑는 위치라
 * 성질이 다르다. 분리해 두면 조건 칩이 만드는 링크(`rankingHref`·`screenerHref`)가
 * 페이지를 들고 다니지 않아서, **조건을 바꾸면 자동으로 1페이지로 돌아간다** —
 * "PER 10 이하" 3페이지에서 "PER 20 이하"로 바꿨을 때 3페이지에 남아 있으면
 * 사용자가 보고 있는 것이 무엇인지 알 수 없다.
 */

/**
 * 백엔드가 받는 `offset` 상한 (`app/api/v1/endpoints/markets.py`).
 * 넘겨 보내면 422 라 여기서 먼저 막는다.
 */
export const RANKING_MAX_OFFSET = 2000;
export const SCREENER_MAX_OFFSET = 5000;

/**
 * `?page=` 를 1 이상 정수로 좁힌다.
 *
 * 모르는 값은 조용히 1 로 떨어뜨린다 — 오래된 북마크나 잘못 누른 링크에 오류
 * 화면을 주는 것보다 첫 페이지를 보여주는 편이 낫다 (`parseSort` 와 같은 자세).
 */
export function parsePage(value: string | undefined): number {
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1) return 1;
  return page;
}

/** 전체 건수와 페이지 크기로 마지막 페이지 번호를 낸다. 최소 1. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * 이 페이지가 요청할 `offset`. 상한을 넘지 않도록 잘라 준다.
 *
 * 잘린 경우 화면은 마지막으로 볼 수 있는 구간을 보여준다 — 주소를 손으로 고쳐
 * `?page=999` 로 들어와도 오류가 아니라 목록이 나온다.
 */
export function offsetOf(page: number, pageSize: number, maxOffset: number): number {
  return Math.min((page - 1) * pageSize, maxOffset);
}

/**
 * 실제로 넘길 수 있는 마지막 페이지.
 *
 * 전체 건수로 계산한 페이지 수와 백엔드 offset 상한 중 **작은 쪽**이다. 상한
 * 때문에 못 가는 페이지 번호를 링크로 띄우면 눌렀을 때 같은 화면이 다시 나온다.
 */
export function lastReachablePage(
  total: number,
  pageSize: number,
  maxOffset: number,
): number {
  return Math.min(
    pageCount(total, pageSize),
    Math.floor(maxOffset / pageSize) + 1,
  );
}
