/**
 * 종목 탐색 화면의 공유 토큰.
 *
 * 표가 조각(머리 행 · 본문 행)으로 갈라져 있어도 열이 한 픽셀도 어긋나면 안 된다.
 * 그리드 템플릿을 각 파일에 복사하면 열 하나를 넓히는 순간 두 곳이 어긋난다 —
 * 콘솔 화면의 tokens.ts 와 같은 이유로 한 곳에서 소유한다.
 */

/**
 * 데스크탑 표의 6열: 순위 · 종목 · 3개월 · 현재가 · 등락률 · 시가총액.
 *
 * 종목만 `1.6fr` 로 남는 폭을 먹는다. 숫자 열을 고정폭으로 두는 것은 tabular-nums
 * 와 짝이다 — 열 폭이 내용에 따라 흔들리면 고정폭 숫자를 쓰는 의미가 없다.
 */
export const RANKING_GRID =
  "grid grid-cols-[40px_1.6fr_92px_112px_92px_124px] items-center gap-3";

export const FILTER_LABEL =
  "flex items-center gap-1.5 font-mono font-medium uppercase tracking-label text-muted-45 text-10";
