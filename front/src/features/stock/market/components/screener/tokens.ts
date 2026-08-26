/**
 * 조건 검색 표의 공유 토큰.
 *
 * 랭킹 표(browse/tokens.ts)와 **열이 다르다.** 그쪽은 시세(현재가·등락률·스파크라인)를
 * 보여주고 여기는 지표(PER·PBR·ROE·배당수익률)를 보여준다 — 데이터 경로가 아예
 * 다르기 때문이다(`back/app/services/screener_service` 모듈 주석). 그래서 그리드를
 * 재사용하지 않고 따로 소유한다. 억지로 합치면 어느 화면에도 맞지 않는 열 폭이 된다.
 */

/**
 * 데스크탑 표의 7열: 순위 · 종목 · 시가총액 · PER · PBR · ROE · 배당수익률.
 *
 * 지표 다섯이 전부 우측 정렬 숫자라 폭을 고정한다 — tabular-nums 를 쓰는데 열 폭이
 * 내용에 따라 흔들리면 자릿수가 맞아떨어지는 이점이 사라진다.
 */
export const SCREENER_GRID =
  "grid grid-cols-[40px_1.5fr_112px_88px_80px_84px_96px] items-center gap-3";

export const CONDITION_LABEL =
  "font-mono font-medium uppercase tracking-label text-muted-45";
