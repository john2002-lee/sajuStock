import Link from "next/link";
import {
  deltaColorClass,
  percent as fmtPercent,
  price as fmtPrice,
  marketCapKR,
} from "@/lib/format";
import { Sparkline } from "@/shared/ui";
import { ROW_LINK, StockNameCell } from "../table";
import type { RankedStock } from "../../services/getStockRanking";
import { RANKING_GRID } from "./tokens";

export interface RankingRowProps {
  row: RankedStock;
}

/**
 * 데스크탑 표의 본문 행 하나. 행 전체가 종목 상세로 가는 링크다.
 *
 * 열 순서·폭은 머리 행과 같은 토큰(RANKING_GRID)에서 온다 — 여기서 따로 적으면
 * 열 하나를 넓히는 순간 머리와 본문이 어긋난다. 그리드를 뺀 나머지(선·여백·hover)는
 * 조건 검색 행과 같아야 하므로 공용 `ROW_LINK` 가 소유한다.
 */
export function RankingRow({ row }: RankingRowProps) {
  return (
    <Link
      role="row"
      href={`/stocks/${row.code}`}
      className={`${RANKING_GRID} ${ROW_LINK}`}
    >
      <span role="cell" className="num text-right text-muted-35 text-12">
        {row.rank}
      </span>

      <StockNameCell asCell name={row.name} meta={`${row.code} · ${row.board}`} />

      <span role="cell" className="flex justify-end">
        <Sparkline points={row.spark} changePercent={row.changePercent} w={76} h={24} />
      </span>

      <span role="cell" className="num text-right font-medium text-13">
        {fmtPrice(row.price)}
      </span>

      <span
        role="cell"
        className={`num text-right font-medium ${deltaColorClass(row.changePercent)} text-13`}
      >
        {fmtPercent(row.changePercent)}
      </span>

      {/* 시총 미수집은 대시로 남긴다 — 목록에서는 행을 뺄 수 없으니 빈칸이 정직하다 */}
      <span role="cell" className="num text-right text-muted-60 text-13">
        {row.marketCap === null ? "—" : marketCapKR(row.marketCap)}
      </span>
    </Link>
  );
}
