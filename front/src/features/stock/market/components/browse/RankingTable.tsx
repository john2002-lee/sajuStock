import { SORTED_COLUMN, type RankingSort } from "../../model/ranking";
import { TableShell } from "../table";
import type { RankedStock } from "../../services/getStockRanking";
import { RankingCard } from "./RankingCard";
import { RankingHeadRow } from "./RankingHeadRow";
import { RankingRow } from "./RankingRow";

export interface RankingTableProps {
  rows: readonly RankedStock[];
  /** 어느 열이 이 순서를 만들었는지 머리 행에 표시하기 위해 받는다 */
  sort: RankingSort;
}

/**
 * 종목 탐색 목록 — 데스크탑 표 / 모바일 행을 조립한다.
 *
 * 껍데기(브레이크포인트로 두 조판을 가르는 일)는 공용 `TableShell` 이 한다.
 * 조건 검색 표와 **같은 방식으로 갈라야 하기 때문**이고, 그 안에 들어가는 행은
 * 열이 달라 각자 남는다.
 *
 * 전체 건수는 더 이상 받지 않는다. 예전에는 목록 끝에 "전체 N종목 중 상위 50종목"
 * 을 붙였는데, 그 줄은 **페이지네이션이 없던 동안의 임시 안내**였다
 * (`ResultSummary` 주석이 그렇게 적고 있었다). 이제 페이지를 넘길 수 있으므로
 * 그 자리는 `Pagination` 이 가져갔고, 둘을 다 두면 같은 숫자를 두 번 말한다.
 * 게다가 3페이지에서 "상위 50종목" 은 틀린 말이 된다.
 *
 * 조각을 나눈 기준은 "같이 바뀌는가" 다. 머리 행과 본문 행은 열 정의를 공유하므로
 * tokens.ts 로 묶었고, 모바일 행은 열 구조 자체가 달라 별도 파일이다.
 */
export function RankingTable({ rows, sort }: RankingTableProps) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-muted-60 text-13">
        표시할 종목이 없습니다.
      </p>
    );
  }

  return (
    <TableShell
      label="종목 순위"
      rowCount={rows.length}
      desktop={
        <>
          <RankingHeadRow sortedColumn={SORTED_COLUMN[sort]} />
          {rows.map((row) => (
            <RankingRow key={row.code} row={row} />
          ))}
        </>
      }
      mobile={rows.map((row) => (
        <li key={row.code}>
          <RankingCard row={row} />
        </li>
      ))}
    />
  );
}
