/**
 * 랭킹 표(`browse/`)와 조건 검색 표(`screener/`)가 **둘 다** 쓰는 조각.
 * 홈의 등락 상위(`MoverList`)도 좁은 행 하나를 여기서 가져간다.
 *
 * ## 왜 폴더를 하나 더 뒀나
 *
 * 조건 검색이 생기면서 칩·꼬리말·머리 셀을 `../browse/FilterChip` 처럼 **깊은 경로로**
 * 집어가기 시작했다. `browse/index.ts` 는 바로 그것을 막으려고 필터 바와 표만
 * 내보내고 있었는데, 규칙을 우회한 셈이 됐다.
 *
 * 규칙이 틀린 것이 아니라 **공유 조각이 browse 안에 살고 있던 것이 틀렸다.** 두
 * 화면이 같이 쓰는 것은 어느 한쪽의 내부가 아니다. 여기로 옮기고 나면 browse 와
 * screener 는 각자 **자기 열만** 소유한다.
 *
 * ## 여기 오지 않는 것
 *
 * - **그리드 템플릿** — 두 표는 열이 다르다(시세 6열 vs 지표 7열). 억지로 합치면
 *   어느 화면에도 맞지 않는 열 폭이 된다 (각 `tokens.ts` 주석).
 * - **데스크탑 그리드 행** — 열이 다르면 행도 다르다. 다만 그리드를 뺀 나머지
 *   (선·여백·hover)는 같아야 하므로 `ROW_LINK`·`HEAD_ROW` 로 여기 있다.
 * - **빈 상태** — 조건 검색은 "0건" 을 세 갈래로 갈라 설명해야 하고(지표 수집 중 /
 *   조건이 좁다 / 조건이 없는데도 0건), 랭킹에는 그런 구분이 없다.
 * - **`FilterGroup` / `ConditionRow`** — "라벨 + 칩" 이라는 점만 같고 조판이 다르다.
 *   랭킹은 축이 둘이라 한 줄에 눕고, 조건 검색은 여섯이라 2열 격자로 접으며 라벨 폭을
 *   고정한다. 그 차이는 각 필터 바 주석에 근거가 있다 — 프롭으로 갈라 합치면 근거가
 *   사라지고 옵션만 남는다.
 *
 * ## 좁은 행(`StockListRow`)은 왜 여기로 왔나 — 위 규칙의 예외가 아니다
 *
 * 예전에 이 표는 "**행·카드** — 열이 다르면 행도 다르다" 라고 적고 있었다. 그
 * 근거는 **데스크탑 그리드 행**에 대해서만 맞다. 좁은 행은 그리드를 쓰지 않는다 —
 * flex 한 줄이라 열 개념이 없고, 그래서 6열 표든 7열 표든 같은 모양으로 접힌다.
 *
 * 실제로 **세 화면이 같은 것을 각자 그리고 있었다** — 모바일 랭킹 카드 · 모바일
 * 조건 검색 카드 · 홈 등락 상위 행. 세 벌로 두는 동안 선 색과 여백만 조금씩
 * 갈라져 있었고(`line-20`/`pb-[9px]` vs `line-22`/`py-2.5`) 그 차이에 근거를 댄
 * 주석은 없었다. 오른쪽에 무엇을 세울지는 여전히 각 화면이 정한다.
 */
export { FilterChip, type FilterChipProps } from "./FilterChip";
export { HeadCell, type HeadCellProps } from "./HeadCell";
export { StockListRow, type StockListRowProps } from "./StockListRow";
export { StockNameCell, type StockNameCellProps } from "./StockNameCell";
export { TableShell, type TableShellProps } from "./TableShell";
export { HEAD_ROW, ROW_LINK, CARD_LINK, TABLE_HEAD } from "./tokens";
