import Link from "next/link";
import { marketCapKR, multiple, unsignedPercent } from "@/lib/format";
import { ROW_LINK, StockNameCell } from "../table";
import type { ScreenedStock } from "../../services/getScreener";
import { SCREENER_GRID } from "./tokens";

export interface ScreenerRowProps {
  row: ScreenedStock;
}

/**
 * 값이 없으면 대시다 — **0 이 아니다.**
 *
 * 지표는 배치가 며칠에 걸쳐 채우므로 목록 안에 "아직 모르는 값" 이 섞인다. 그걸
 * `?? 0` 으로 뭉개면 배당을 하지 않는 회사와 배당수익률을 아직 못 받은 회사가
 * 화면에서 같아진다. 조건에 걸린 종목은 그 컬럼이 이미 채워져 있으므로(SQL 이
 * NULL 을 걸러낸다) 대시가 뜨는 자리는 조건을 안 건 컬럼뿐이다.
 */
function cell(value: number | null, format: (value: number) => string): string {
  return value === null ? "—" : format(value);
}

/**
 * 데스크탑 표의 본문 행 하나. 행 전체가 종목 상세로 가는 링크다.
 *
 * **시세 열이 없다.** 이 목록의 모집단은 상장 전 종목이고 등락률 스냅샷은 시가총액
 * 상위 200종목뿐이라, 가격 열을 넣으면 대부분의 행이 비어 표가 절반쯤 빈 칸이 된다
 * (`schemas/market.ScreenerRow` 주석). 시세는 종목 상세가 말한다.
 *
 * 열 순서·폭은 머리 행과 같은 토큰(SCREENER_GRID)에서 온다. 그리드를 뺀 나머지는
 * 랭킹 행과 같아야 하므로 공용 `ROW_LINK` 가 소유한다.
 */
export function ScreenerRow({ row }: ScreenerRowProps) {
  return (
    <Link
      role="row"
      href={`/stocks/${row.code}`}
      className={`${SCREENER_GRID} ${ROW_LINK}`}
    >
      <span role="cell" className="num text-right text-muted-35 text-12">
        {row.rank}
      </span>

      <StockNameCell asCell name={row.name} meta={`${row.code} · ${row.board}`} />

      <span role="cell" className="num text-right font-medium text-13">
        {cell(row.marketCap, marketCapKR)}
      </span>
      <span role="cell" className="num text-right text-13">
        {cell(row.per, multiple)}
      </span>
      <span role="cell" className="num text-right text-13">
        {cell(row.pbr, multiple)}
      </span>
      <span role="cell" className="num text-right text-13">
        {cell(row.roePct, unsignedPercent)}
      </span>
      <span role="cell" className="num text-right text-13">
        {cell(row.dividendYieldPct, unsignedPercent)}
      </span>
    </Link>
  );
}
