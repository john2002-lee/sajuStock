"use client";

import Link from "next/link";
import { decimal, price as fmtPrice } from "@/lib/format";
import { Delta, Icon, Sparkline } from "@/shared/ui";
import {
  isOverseas,
  returnPercent,
  type Holding,
  type RowAiStatus,
  type WatchItem,
} from "../model/types";
import { AlertToggle } from "./AlertToggle";
import { HoldingCell } from "./HoldingCell";
import { SelectOrDrag } from "./SelectOrDrag";
import { useWatchRowDrag } from "./useWatchRowDrag";
import { VerdictCell } from "./VerdictCell";

/**
 * 모바일 2단 카드 행.
 * 1단 = 이름·스파크·가격, 2단 = 보유·알림·AI 판단 (README 5절).
 */
export function WatchCard({
  item,
  reordering,
  selected,
  aiStatus,
  onSelect,
  onToggleAlert,
  onChangeHolding,
}: {
  item: WatchItem;
  reordering: boolean;
  selected: boolean;
  aiStatus?: RowAiStatus;
  onSelect: (next: boolean) => void;
  onToggleAlert: () => void;
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
      style={style}
      className={`flex gap-2.5 border-b border-dotted border-line-22 py-3 ${
        isDragging ? "relative z-10 bg-surface-hover" : ""
      } ${selected ? "bg-surface" : ""}`}
    >
      {/* 13px 상자를 44px 정사각형으로 감싼다 — 상자 크기는 그대로 두고 누를 수
          있는 영역만 넓힌다. 카드는 2단이라 위쪽에 붙여야 이름 줄과 눈높이가 맞는다. */}
      <SelectOrDrag
        reordering={reordering}
        selected={selected}
        onSelect={onSelect}
        label={item.name}
        handleProps={handleProps}
        className="-my-2 flex min-h-[var(--tap)] min-w-[var(--tap)] flex-none items-start justify-center pt-3"
        iconSize={16}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2.5">
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <Link
              href={`/stocks/${item.code}`}
              className="-my-2 flex min-h-[var(--tap)] items-center font-display font-medium text-16"
            >
              {item.name}
            </Link>
            <span className="font-mono text-muted-50 text-10">
              {item.symbol} · {item.group}
            </span>
          </span>
          <Sparkline
            points={item.spark}
            changePercent={item.changePercent}
            w={104}
            h={28}
          />
          <span className="num flex flex-none flex-col items-end gap-0.5">
            <span className="font-medium text-14">
              {overseas ? `$${decimal(item.price, 2)}` : fmtPrice(item.price)}
            </span>
            <Delta changePercent={item.changePercent} arrow={false} size={12} />
          </span>
        </div>

        {/* 2단은 flex-wrap 이었다 — 내용 길이에 따라 행마다 다른 자리에서 접혀
            카드 높이와 요소 위치가 제각각이었다. 두 줄로 고정한다:
            (a) 보유·평가손익 ↔ AI 판단, (b) 알림 토글 + 조건 칩. */}
        <div className="flex items-center justify-between gap-3">
          {/* 데스크탑 표와 같은 편집 셀이다. 모바일에는 표 보기가 없어서, 여기에
              두지 않으면 폰에서는 보유·평단을 넣을 방법이 아예 없다. */}
          <span className="min-w-0 flex-1">
            <HoldingCell
              holding={item.holding}
              overseas={overseas}
              gain={gain}
              label={item.name}
              onChange={onChangeHolding}
              align="start"
            />
          </span>

          <span className="flex flex-none items-center gap-3">
            <VerdictCell
              verdict={item.verdict}
              changePercent={item.changePercent}
              status={aiStatus}
            />
          </span>
        </div>

        {/* 알림 조건은 테두리 칩 + 벨 (디자인 4b 모바일 2단).
            평문으로 두면 옆의 보유·평가손익과 같은 무게로 읽혀 행이 뭉갠다. */}
        <div className="flex items-center gap-2">
          <AlertToggle
            enabled={item.alert.enabled}
            label={item.name}
            onToggle={onToggleAlert}
          />
          <span
            className={`flex min-w-0 items-center gap-1 border border-line-22 px-[7px] py-0.5 font-mono ${
              item.alert.enabled ? "text-muted-60" : "text-muted-35"
            } text-10`}
          >
            <Icon
              name={item.alert.enabled ? "bell" : "bell-off"}
              size={12}
              className="flex-none"
            />
            <span className="truncate">{item.alert.condition}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
