import type { ScreenerSort } from "../../model/screener";
import { HeadCell, HEAD_ROW } from "../table";
import { SCREENER_GRID } from "./tokens";

export interface ScreenerHeadRowProps {
  /** 지금 목록의 순서를 만든 축 */
  sort: ScreenerSort;
  /** 그 축의 방향. 백엔드가 축마다 정해서 응답에 실어 준다 */
  order: "asc" | "desc";
}

/** 정렬 축 → 표식이 붙는 열. 축 이름과 열 이름이 1:1 이 아니라 표를 따로 둔다. */
const SORTED_COLUMN: Record<ScreenerSort, string> = {
  market_cap: "시가총액",
  per: "PER",
  pbr: "PBR",
  dividend_yield: "배당수익률",
  roe: "ROE",
};

/**
 * 데스크탑 표의 머리 행. **스크롤을 따라온다.**
 *
 * 50행이면 여러 화면인데 열 이름 없이 숫자 다섯 덩어리만 남으면 어느 것이 PER 이고
 * 어느 것이 PBR 인지 알 수 없다. `bg-paper` 가 없으면 밑을 지나는 행이 비쳐 글자가
 * 겹친다. z-10 은 검색 팔레트(z-50)·모바일 탭바(z-30) 아래다.
 *
 * **방향을 축에서 받아 그대로 넘긴다.** 시가총액·배당수익률·ROE 는 큰 값이, PER·PBR 은
 * 작은 값이 위로 오므로 캐럿과 `aria-sort` 가 함께 뒤집혀야 한다 — 그 처리는 공용
 * `table/HeadCell` 이 한다.
 */
export function ScreenerHeadRow({ sort, order }: ScreenerHeadRowProps) {
  const sorted = SORTED_COLUMN[sort];

  return (
    <div
      role="row"
      className={`${SCREENER_GRID} ${HEAD_ROW}`}
    >
      <HeadCell label="#" align="right" />
      <HeadCell label="종목" />
      {["시가총액", "PER", "PBR", "ROE", "배당수익률"].map((label) => (
        <HeadCell
          key={label}
          label={label}
          align="right"
          sorted={label === sorted ? order : undefined}
        />
      ))}
    </div>
  );
}
