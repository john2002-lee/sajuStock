import type { SortedColumn } from "../../model/ranking";
import { HeadCell, HEAD_ROW } from "../table";
import { RANKING_GRID } from "./tokens";

export interface RankingHeadRowProps {
  /** 지금 목록의 순서를 만든 열. 여기에만 내림차순 표식이 붙는다 */
  sortedColumn: SortedColumn;
}

/**
 * 데스크탑 표의 머리 행. **스크롤을 따라온다.**
 *
 * 50행이면 5화면이 넘는데, 열 이름 없이 숫자 네 덩어리만 남으면 어느 것이 현재가고
 * 어느 것이 시총인지 알 수 없다. `bg-paper` 가 없으면 밑을 지나는 행이 비쳐 글자가
 * 겹친다. z-10 은 검색 팔레트(z-50)·모바일 탭바(z-30) 아래다.
 *
 * 정렬 기준 열은 잉크색 + 캐럿으로 표시한다. 칩으로 이미 "시가총액순" 을 눌렀더라도
 * 스크롤을 내리면 칩은 화면 밖이고 이 행만 남기 때문에, 순서의 근거가 여기 있어야 한다.
 * 방향은 **항상 내림차순**이라 `"desc"` 를 고정으로 넘긴다 (model/ranking 의
 * SORTED_COLUMN 주석). 조건 검색 표는 축이 방향을 정해서 그쪽만 값이 갈린다.
 */
export function RankingHeadRow({ sortedColumn }: RankingHeadRowProps) {
  return (
    <div
      role="row"
      className={`${RANKING_GRID} ${HEAD_ROW}`}
    >
      <HeadCell label="#" align="right" />
      <HeadCell label="종목" />
      <HeadCell label="3개월" align="right" />
      <HeadCell label="현재가" align="right" />
      <HeadCell
        label="등락률"
        align="right"
        sorted={sortedColumn === "change" ? "desc" : undefined}
      />
      <HeadCell
        label="시가총액"
        align="right"
        sorted={sortedColumn === "marketCap" ? "desc" : undefined}
      />
    </div>
  );
}
