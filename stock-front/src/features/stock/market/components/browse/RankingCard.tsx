import {
  deltaColorClass,
  percent as fmtPercent,
  price as fmtPrice,
  marketCapKR,
} from "@/lib/format";
import { Sparkline } from "@/shared/ui";
import { StockListRow } from "../table";
import type { RankedStock } from "../../services/getStockRanking";

export interface RankingCardProps {
  row: RankedStock;
}

/**
 * 모바일(<768) 랭킹 목록의 한 줄.
 *
 * 조판은 공용 `StockListRow` 가 한다 — 조건 검색 카드·홈 등락 목록과 **같은
 * 모양이었고**, 세 벌로 두는 동안 여백과 선 색이 조금씩 갈라졌다.
 * 이 파일이 정하는 것은 **무엇을 넣을지**뿐이다.
 *
 * 375px 에 데스크탑 6열을 밀어 넣으면 종목명이 잘리므로 시가총액을 코드 줄로 접고,
 * 가격과 등락률을 오른쪽에 세로로 쌓는다. 데스크탑 표와 조각을 나눈 것도 이 때문이다
 * — 한 마크업을 CSS 로 접으려 하면 두 레이아웃 어느 쪽도 깔끔해지지 않는다.
 */
export function RankingCard({ row }: RankingCardProps) {
  return (
    <StockListRow
      code={row.code}
      name={row.name}
      rank={row.rank}
      meta={`${row.code} · ${row.board}${
        row.marketCap === null ? "" : ` · ${marketCapKR(row.marketCap)}`
      }`}
      chart={
        <Sparkline points={row.spark} changePercent={row.changePercent} w={60} h={22} />
      }
      primary={<span className="num font-medium text-13">{fmtPrice(row.price)}</span>}
      secondary={
        <span
          className={`num font-medium ${deltaColorClass(row.changePercent)} text-11`}
        >
          {fmtPercent(row.changePercent)}
        </span>
      }
    />
  );
}
