"use client";

import Link from "next/link";
import { decimal, price as fmtPrice } from "@/lib/format";
import { Delta, Sparkline } from "@/shared/ui";
import {
  isOverseas,
  returnPercent,
  type Holding,
  type RowAiStatus,
  type WatchItem,
} from "../model/types";
import { AlertCondition } from "./AlertCondition";
import { AlertToggle } from "./AlertToggle";
import { WATCH_GRID } from "./grid";
import { HoldingCell } from "./HoldingCell";
import { SelectOrDrag } from "./SelectOrDrag";
import { useWatchRowDrag } from "./useWatchRowDrag";
import { VerdictCell } from "./VerdictCell";

export function WatchRow({
  item,
  reordering,
  selected,
  aiStatus,
  onSelect,
  onToggleAlert,
  onChangeCondition,
  onChangeHolding,
}: {
  item: WatchItem;
  reordering: boolean;
  selected: boolean;
  aiStatus?: RowAiStatus;
  onSelect: (next: boolean) => void;
  onToggleAlert: () => void;
  onChangeCondition: (next: string) => void;
  onChangeHolding: (next: Holding | null) => void;
}) {
  const { setNodeRef, style, isDragging, handleProps } = useWatchRowDrag(
    item.code,
    reordering,
  );

  const overseas = isOverseas(item);
  const gain = returnPercent(item);

  return (
    <div
      ref={setNodeRef}
      role="row"
      aria-selected={selected}
      style={style}
      className={`${WATCH_GRID} border-b border-dotted border-line-22 py-3 transition-colors duration-150 hover:bg-surface-hover ${
        isDragging ? "relative z-10 bg-surface-hover shadow-tooltip" : ""
      } ${selected ? "bg-surface" : ""}`}
    >
      {/* 26px — 기본은 선택 체크박스, '순서 편집' 중에는 드래그 핸들.
          여기는 그리드 셀이라 히트 영역을 따로 잡지 않는다 (행 전체가 높이를 준다). */}
      <span role="cell">
        <SelectOrDrag
          reordering={reordering}
          selected={selected}
          onSelect={onSelect}
          label={item.name}
          handleProps={handleProps}
          className="flex"
        />
      </span>

      <div role="cell" className="flex min-w-0 flex-col gap-[3px]">
        <span className="flex items-baseline gap-2">
          <Link
            href={`/stocks/${item.code}`}
            className="font-display font-medium hover:text-up text-16"
          >
            {item.name}
          </Link>
          <span
            className="flex-none border border-line-22 px-1.5 py-0.5 font-mono tracking-label-tight text-muted-55 text-10"
          >
            {item.group}
          </span>
        </span>
        <span className="font-mono text-muted-50 text-10">
          {item.symbol} · {item.nameEn}
        </span>
      </div>

      <span
        role="cell"
        className="num text-right font-medium text-14"
      >
        {overseas ? `$${decimal(item.price, 2)}` : fmtPrice(item.price)}
      </span>

      {/* 등락 색은 Delta 가 소유한다 — deltaColorClass 를 여기서 다시 부르지 않는다
          (foundation/00-READ-FIRST "하지 말 것"). */}
      <span role="cell" className="flex justify-end">
        <Delta changePercent={item.changePercent} arrow={false} size={13} />
      </span>

      <span role="cell" className="flex justify-center">
        <Sparkline
          points={item.spark}
          changePercent={item.changePercent}
          w={104}
          h={28}
        />
      </span>

      <span role="cell" className="flex flex-col items-end gap-0.5">
        <HoldingCell
          holding={item.holding}
          overseas={overseas}
          gain={gain}
          label={item.name}
          onChange={onChangeHolding}
        />
      </span>

      <span role="cell" className="flex min-w-0 items-center gap-[9px] pl-[18px]">
        <AlertToggle
          enabled={item.alert.enabled}
          label={item.name}
          onToggle={onToggleAlert}
        />
        <AlertCondition
          value={item.alert.condition}
          disabled={!item.alert.enabled}
          onChange={onChangeCondition}
        />
      </span>

      <span role="cell" className="flex justify-end">
        <VerdictCell
          verdict={item.verdict}
          changePercent={item.changePercent}
          status={aiStatus}
        />
      </span>
    </div>
  );
}
