import { decimal, percent as fmtPercent, deltaColorClass } from "@/lib/format";
import { SectionLabel } from "@/shared/ui";
import type { MarketIndex } from "../model/types";

/**
 * 종목 상세 우측 레일의 4행 시장 개요.
 *
 * Delta 프리미티브를 쓰지 않는 이유: 이 행은 [값][등락률] 2열이고 금액 변동을
 * 표시하지 않는다. 색 분기는 deltaColorClass 로 위임해 규칙을 한 곳에 유지한다.
 */
export function MarketOverviewList({ indices }: { indices: MarketIndex[] }) {
  return (
    <section className="flex flex-col gap-2.5">
      <SectionLabel variant="panel" size={11}>
        시장 개요
      </SectionLabel>
      {indices.map((index) => (
        <div
          key={index.name}
          className="flex items-baseline justify-between gap-2"
        >
          <span className="text-13">{index.name}</span>
          <span
            className="num flex gap-[9px] font-medium text-13"
          >
            <span>{decimal(index.value, index.digits)}</span>
            <span className={deltaColorClass(index.changePercent)}>
              {fmtPercent(index.changePercent)}
            </span>
          </span>
        </div>
      ))}
    </section>
  );
}
