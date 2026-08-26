/**
 * 표 조각이 화면과 무관하게 공유하는 조판.
 *
 * 열 구성(그리드 템플릿)은 여기 오지 않는다 — 랭킹 표와 조건 검색 표는 보여주는
 * 것이 달라서 열이 다르고, 그 판단은 각 폴더의 `tokens.ts` 가 근거와 함께 소유한다.
 * 여기 있는 것은 **어느 표에서도 같아야 하는 것**뿐이다.
 */

/** 표 머리 글자 (mono · 대문자 · 넓은 자간) */
export const TABLE_HEAD = "font-mono font-medium uppercase tracking-label-wide";

/**
 * 데스크탑 머리 행의 **그리드를 뺀 나머지** — 고정·경계·여백.
 *
 * 스크롤을 따라오는 성질(`sticky top-0`)과 그 아래 행이 비쳐 글자가 겹치지 않게
 * 하는 `bg-paper` 가 한 벌이다. 둘 중 하나만 복사해 가면 조용히 깨진다.
 * z-10 은 검색 팔레트(z-50)·모바일 탭바(z-30) 아래다.
 */
export const HEAD_ROW =
  "sticky top-0 z-10 border-b border-line-20 bg-paper pb-2 pt-3 text-10";

/** 데스크탑 본문 행의 그리드를 뺀 나머지. 행 전체가 링크라 hover 가 붙는다. */
export const ROW_LINK =
  "border-b border-dotted border-line-22 py-2.5 hover:bg-surface-hover";

/**
 * 좁은 목록 한 줄(`StockListRow`)의 링크. 44px 최소 높이는 터치 히트 영역이다
 * (WCAG 2.5.5). 마우스에는 그 높이가 필요 없어 md 이상에서 푼다.
 */
export const CARD_LINK =
  "flex min-h-[var(--tap)] items-center gap-3 border-b border-dotted border-line-22 py-2.5 hover:bg-surface-hover md:min-h-0";
