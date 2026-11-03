/**
 * 종목 탐색(/stocks) 화면 조각 묶음의 내부 경계.
 *
 * 페이지가 쓰는 것은 필터 바와 표 둘뿐이다. 행·머리 행은 이 폴더 안에서만 조립되는
 * 구현 세부라 밖으로 내보내지 않는다 — 내보내는 순간 다른 화면이 행 하나만
 * 가져다 쓰기 시작하고, 열 구조를 바꿀 수 없게 된다.
 *
 * 실제로 그 일이 조건 검색에서 일어났다. 칩·꼬리말·머리 셀을 `../browse/FilterChip`
 * 처럼 깊은 경로로 집어가고 있었다 — 이 경계를 우회한 것이다. 규칙이 아니라 **자리**가
 * 틀렸으므로, 두 화면이 같이 쓰는 것은 `../table/` 로 옮겼다. 이제 이 폴더에 남은
 * 것은 전부 랭킹 표만의 것이다.
 */
export {
  RankingFilterBar,
  type RankingFilterBarProps,
} from "./RankingFilterBar";
export { RankingTable, type RankingTableProps } from "./RankingTable";
