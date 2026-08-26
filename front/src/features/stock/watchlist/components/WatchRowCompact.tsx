"use client";

import Link from "next/link";
import { decimal, price as fmtPrice } from "@/lib/format";
import { Delta, Sparkline } from "@/shared/ui";
import { isOverseas, type RowAiStatus, type WatchItem } from "../model/types";
import { SelectOrDrag } from "./SelectOrDrag";
import { useWatchRowDrag } from "./useWatchRowDrag";
import { VerdictCell } from "./VerdictCell";

/**
 * 작업대(분할 보기) 왼쪽 목록의 행.
 *
 * ## 왜 `WatchRow` 를 그대로 쓰지 않는가
 *
 * `WatchRow` 는 1180px 전체 폭을 전제로 한 줄에 열 개를 담는다(선택·종목·현재가·
 * 등락률·스파크·보유·알림 토글·알림 조건·AI 판단). 작업대에서 목록에 주어지는 폭은
 * **340px** 다 — 같은 행을 넣으면 전부 잘린다.
 *
 * 그래서 훑는 데 필요한 것만 남기고 2줄로 접었다:
 *   1줄  [선택] 종목명 ......... 현재가
 *   2줄        코드·그룹  스파크  등락률 · AI 판단
 *
 * 덜어낸 것(보유·평가손익·알림 조건)은 **사라지지 않는다.** 헤더의 '표' 보기로
 * 넘기면 기존 `WatchRow` 가 전체 폭으로 그대로 뜬다. 좁은 칸에 다 우겨넣어 전부
 * 읽기 어렵게 만드는 대신, 목적이 다른 두 보기를 두는 쪽을 골랐다.
 */
export function WatchRowCompact({
  item,
  href,
  active,
  reordering,
  selected,
  aiStatus,
  onSelect,
}: {
  item: WatchItem;
  /** 이 행이 여는 주소. 라우트는 app 계층이 정한다 — 도메인 컴포넌트가 URL 을 알면 라우트가 바뀔 때마다 여기까지 따라온다 */
  href: string;
  /** 오른쪽 상세 칸이 지금 이 종목을 그리고 있는가 */
  active: boolean;
  reordering: boolean;
  selected: boolean;
  aiStatus?: RowAiStatus;
  onSelect: (next: boolean) => void;
}) {
  const { setNodeRef, style, isDragging, handleProps } = useWatchRowDrag(
    item.code,
    reordering,
  );

  const overseas = isOverseas(item);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex gap-1.5 border-b border-dotted border-line-22 px-1.5 ${
        isDragging ? "relative z-10 bg-surface-hover" : ""
      } ${
        // 선택(체크박스)과 활성(상세에 떠 있음)은 다른 상태다. 활성은 왼쪽 굵은
        // 잉크 선으로, 선택은 바탕색으로 나타낸다 — 둘이 동시에 참일 수 있다.
        active ? "border-l-2 border-l-ink bg-surface" : "border-l-2 border-l-transparent"
      } ${selected && !active ? "bg-surface" : ""}`}
    >
      {/* 24px 폭에 세로 가운데. 44px 은 누를 수 있는 높이지 상자 크기가 아니다. */}
      <SelectOrDrag
        reordering={reordering}
        selected={selected}
        onSelect={onSelect}
        label={item.name}
        handleProps={handleProps}
        className="flex min-h-[var(--tap)] w-6 flex-none items-center justify-center"
        iconSize={14}
      />

      {/* 행 전체가 링크다 — 340px 안에서 종목명 글자만 표적이면 놓치기 쉽다.
          체크박스는 링크 밖에 있어 선택과 이동이 서로를 먹지 않는다. */}
      <Link
        href={href}
        aria-current={active ? "true" : undefined}
        className="flex min-w-0 flex-1 flex-col gap-0.5 py-2"
        // 목록은 그대로 두고 오른쪽만 바뀌므로 스크롤을 위로 올리지 않는다.
        scroll={false}
      >
        <span className="flex items-baseline gap-2">
          <span
            className={`min-w-0 flex-1 truncate font-display ${
              active ? "font-bold" : "font-medium"
            } text-14`}
          >
            {item.name}
          </span>
          <span className="num flex-none font-medium text-13">
            {overseas ? `$${decimal(item.price, 2)}` : fmtPrice(item.price)}
          </span>
        </span>

        <span className="flex items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate font-mono text-muted-50 text-10"
          >
            {item.symbol} · {item.group}
          </span>
          <Sparkline
            points={item.spark}
            changePercent={item.changePercent}
            w={52}
            h={16}
          />
          <Delta changePercent={item.changePercent} arrow={false} size={11} />
        </span>

        {/* 분석 전에는 아무것도 그리지 않는다 — 종목마다 행 높이가 달라지지 않게
            VerdictCell 이 빈 상태를 스스로 처리한다. */}
        <span className="flex items-center">
          <VerdictCell
            verdict={item.verdict}
            changePercent={item.changePercent}
            status={aiStatus}
          />
        </span>
      </Link>
    </div>
  );
}
