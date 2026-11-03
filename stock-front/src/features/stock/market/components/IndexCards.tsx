import {
  decimal,
  deltaColorClass,
  percent as fmtPercent,
  signedDecimal,
} from "@/lib/format";
import { Sparkline } from "@/shared/ui";
import type { MarketIndex } from "../model/types";

/**
 * 지수 4카드. gap 1px + 그리드 배경으로 1px 헤어라인 구분선을 만든다
 * (보더를 각 카드에 주면 인접 변이 2px로 겹친다).
 */
export function IndexCards({ indices }: { indices: MarketIndex[] }) {
  return (
    <section
      aria-label="지수 스냅샷"
      className="grid grid-cols-2 gap-px bg-line-16 md:grid-cols-4"
    >
      {indices.map((index) => (
        // 모바일은 2열 그리드라 카드 폭이 절반이다 — 패딩·숫자 크기를 줄인다.
        <article
          key={index.name}
          className="flex min-w-0 flex-col gap-2 bg-paper px-3 pb-2.5 pt-3 md:gap-2.5 md:px-[18px] md:pb-3 md:pt-4"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-mono font-medium tracking-[0.12em] text-11 md:text-12">
              {index.name}
            </h2>
            <span className="flex-none text-muted-50 text-10 md:text-11">
              {index.label}
            </span>
          </div>

          <div className="flex flex-col gap-[3px]">
            <span className="num font-medium leading-none text-20 md:text-26">
              {decimal(index.value, index.digits)}
            </span>
            <span
              className={`num font-medium text-11 md:text-12 ${deltaColorClass(index.changePercent)}`}
            >
              {signedDecimal(index.change, index.digits)} (
              {fmtPercent(index.changePercent)})
            </span>
          </div>

          {/* Sparkline 은 max-w-full 이라 카드 폭을 넘지 않는다 */}
          <Sparkline
            points={index.spark}
            changePercent={index.changePercent}
            w={232}
            h={58}
            area
          />

          {/* 왜 이 지표를 보는지. 설명이 필요한 카드에만 붙는다 (`MarketIndex.note`).
              `mt-auto` 로 바닥에 붙여, 해설이 있는 카드와 없는 카드의 스파크라인
              높이가 어긋나지 않게 한다. */}
          {index.note ? (
            <p
              className="mt-auto border-t border-line-16 pt-2 leading-[1.5] text-muted-55 text-11"
            >
              {index.note}
            </p>
          ) : null}
        </article>
      ))}
    </section>
  );
}
