import {
  boardOptions,
  sortOptions,
  type RankingBoard,
  type RankingQuery,
  type RankingSort,
} from "../../model/ranking";
import { FilterGroup } from "./FilterGroup";

export interface RankingFilterBarProps {
  /** 현재 URL 이 들고 있는 필터 상태 */
  query: RankingQuery;
}

/**
 * 종목 탐색의 필터 바 — 목록을 자르는 축(시장)과 순서를 바꾸는 축(정렬).
 *
 * **여기에 검색은 없다.** 한동안 검색 필드를 이 줄 왼쪽에 두었는데 두 가지가 걸렸다:
 * 넓은 화면에서 필드와 칩 사이에 큰 빈 공간이 남았고, 무엇보다 필터 옆에 선 입력
 * 상자는 "타이핑하면 이 표가 걸러진다" 고 읽힌다 — 실제로는 팔레트가 열려 **다른
 * 종목으로 이동**한다. 전역 컨트롤이므로 제호 우측 덩어리로 보냈다 (Masthead 주석).
 * 덕분에 이 줄은 "지금 보고 있는 목록을 바꾸는 것" 만 남아 뜻이 하나가 됐다.
 *
 * **반응형 2단.** 축이 둘(각각 라벨 + 칩)이라 한 줄에 들어가는 폭이 768px 부터다.
 *  - `< 768`  세로. 시장·정렬이 한 줄씩. 칩은 44px 히트 영역을 갖는다.
 *  - `≥ 768`  한 줄. 시장은 왼쪽(제목과 같은 축), 정렬은 오른쪽 끝
 *             (마스트헤드 우측 컨트롤과 같은 축)에 정렬한다.
 *
 * 서버 컴포넌트다. 칩은 링크고 옵션 계산은 순수 함수(model/ranking)라 이 바에서
 * 브라우저로 내려가는 JS 는 없다.
 */
export function RankingFilterBar({ query }: RankingFilterBarProps) {
  return (
    <section
      aria-label="목록 조건"
      className="flex flex-col gap-2.5 border-t border-line-20 pt-3.5 md:flex-row md:items-center md:justify-between md:gap-6"
    >
      <FilterGroup<RankingBoard>
        label="시장"
        icon="filter"
        options={boardOptions(query)}
      />
      <FilterGroup<RankingSort>
        label="정렬"
        icon="sort-desc"
        options={sortOptions(query)}
      />
    </section>
  );
}
