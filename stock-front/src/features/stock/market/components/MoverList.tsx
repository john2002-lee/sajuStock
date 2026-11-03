import {
  deltaColorClass,
  percent as fmtPercent,
  price as fmtPrice,
} from "@/lib/format";
import { Sparkline } from "@/shared/ui";
import { StockListRow } from "./table";
import type { Mover } from "../model/types";

/**
 * 홈의 등락 상위 목록.
 *
 * 행 조판은 공용 `StockListRow` 가 한다 — 모바일 랭킹 카드·조건 검색 카드와
 * **같은 모양이었다.** 세 벌로 두는 동안 선 색과 아래 여백만 조금씩 갈라져 있었고
 * (`line-20`/`pb-[9px]` vs `line-22`/`py-2.5`), 그 차이에 근거를 댄 주석은 없었다.
 * 공용 조각으로 합치면서 랭킹·조건 검색 쪽 값으로 맞췄다.
 *
 * 코드 줄에 **영문명이 붙는 것은 이 화면뿐**이다. 랭킹·조건 검색은 그 자리에 시장과
 * 시가총액을 쓴다 — 목록의 뜻이 달라서지 조판이 달라서가 아니다.
 */
export function MoverList({
  title,
  scope,
  items,
  headless = false,
}: {
  title: string;
  scope: string;
  items: Mover[];
  /** 모바일 탭 안에서는 제목 줄을 탭이 대신하므로 숨긴다 */
  headless?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      {headless ? null : (
        <div className="flex items-baseline justify-between gap-4 border-b border-line-20 pb-2">
          <h2 className="font-mono font-medium uppercase tracking-label text-11">
            {title}
          </h2>
          <span className="font-mono text-muted-45 text-10">{scope}</span>
        </div>
      )}

      <ol className="flex flex-col">
        {items.map((item, index) => (
          <li key={item.code}>
            <StockListRow
              code={item.code}
              name={item.name}
              rank={index + 1}
              meta={item.nameEn ? `${item.code} · ${item.nameEn}` : item.code}
              chart={
                <Sparkline
                  points={item.spark}
                  changePercent={item.changePercent}
                  w={76}
                  h={24}
                />
              }
              primary={
                <span className="num font-medium text-13">{fmtPrice(item.price)}</span>
              }
              secondary={
                <span
                  className={`num font-medium ${deltaColorClass(item.changePercent)} text-11`}
                >
                  {fmtPercent(item.changePercent)}
                </span>
              }
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
