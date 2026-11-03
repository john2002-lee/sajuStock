"use client";

import { useEffect, useRef, useState } from "react";
import { decimal, price as fmtPrice } from "@/lib/format";
import { Delta } from "@/shared/ui";
import type { Holding } from "../model/types";

/**
 * 보유 수량 · 평단 셀. 클릭하면 그 자리에서 입력한다.
 *
 * ## 이 입력이 없어서 표의 세 자리가 늘 비어 있었다
 *
 * `useWatchlistMutations.patch` 는 처음부터 `holding` 을 받았지만 **넘기는 곳이
 * 하나도 없었다.** 그래서 이 칸은 물론이고 정렬의 '평가손익' 키와 헤더의
 * '평가손익 합계' 까지 모든 사용자에게 영구히 비어 있었다 — 기능이 없는 것이
 * 아니라 **입구가 없었다.** `WatchToggle` 이 없어서 목록 자체가 비어 있던 것과
 * 같은 종류의 구멍이다.
 *
 * ## 편집 방식은 알림 조건과 맞춘다
 *
 * 항상 `<input>` 으로 두면 표가 폼처럼 보여 에디토리얼 톤이 무너진다
 * (`AlertCondition` 주석). 평소에는 평문, 누르면 그 자리에서 입력이다.
 *
 * ## 지우면 '관심만' 으로 돌아간다
 *
 * 두 칸을 모두 비우고 확정하면 `null` 을 보내 보유 정보를 지운다 — 숫자를 잘못
 * 넣었을 때 되돌릴 방법이 있어야 하고, 백엔드가 "미전송" 과 "명시적 null" 을
 * 구분하므로(`useWatchlistMutations.patch` 주석) 지우기가 표현 가능하다.
 */
export function HoldingCell({
  holding,
  overseas,
  gain,
  label,
  onChange,
  align = "end",
}: {
  holding?: Holding;
  /** 해외 종목이면 평단을 소수 2자리 달러로 읽고 쓴다 */
  overseas: boolean;
  /** 평가손익률. 보유가 없으면 null */
  gain: number | null;
  /** 종목명 — 스크린리더용 라벨에 들어간다 */
  label: string;
  onChange: (next: Holding | null) => void;
  /**
   * 표(데스크탑)는 숫자 열이라 오른쪽 정렬, 모바일 카드는 줄 왼쪽에서 시작한다.
   * 두 화면이 같은 셀을 쓰되 정렬만 다르다.
   */
  align?: "start" | "end";
}) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState("");
  const [avg, setAvg] = useState("");
  const qtyRef = useRef<HTMLInputElement>(null);
  const side = align === "start" ? "items-start text-left" : "items-end text-right";

  useEffect(() => {
    if (editing) qtyRef.current?.select();
  }, [editing]);

  function open() {
    setQty(holding ? String(holding.quantity) : "");
    setAvg(holding ? String(holding.avgPrice) : "");
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const q = Number(qty.trim());
    const a = Number(avg.trim());

    // 둘 다 비었으면 지우기. 이미 없던 것을 다시 지우는 요청은 보내지 않는다.
    if (!qty.trim() && !avg.trim()) {
      if (holding) onChange(null);
      return;
    }

    // 하나라도 숫자가 아니거나 0 이하면 저장하지 않는다 — 0주·0원 보유는
    // 평가손익을 0 으로 나누는 값이라 표에 넣을 수 없다.
    if (!Number.isFinite(q) || !Number.isFinite(a) || q <= 0 || a <= 0) return;
    if (holding && holding.quantity === q && holding.avgPrice === a) return;

    onChange({ quantity: q, avgPrice: a });
  }

  if (editing) {
    return (
      <span className={`flex w-full flex-col gap-1 ${side}`}>
        <Field
          ref={qtyRef}
          value={qty}
          onChange={setQty}
          onCommit={commit}
          onCancel={() => setEditing(false)}
          ariaLabel={`${label} 보유 수량`}
          placeholder="수량"
        />
        <Field
          value={avg}
          onChange={setAvg}
          onCommit={commit}
          onCancel={() => setEditing(false)}
          ariaLabel={`${label} 평균 단가`}
          placeholder="평단"
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className={`flex w-full flex-col gap-0.5 hover:border-b hover:border-dotted hover:border-line-35 ${side}`}
      title={holding ? "클릭해 수정" : "보유 수량과 평단을 입력합니다"}
      aria-label={
        holding
          ? `${label} 보유 ${holding.quantity}주, 평단 수정`
          : `${label} 보유 수량과 평단 입력`
      }
    >
      {holding ? (
        <>
          <span className="num text-muted-70 text-12">
            {holding.quantity}주 ·{" "}
            {overseas
              ? `$${decimal(holding.avgPrice, 2)}`
              : fmtPrice(holding.avgPrice)}
          </span>
          {/* 색 분기는 Delta 가 소유한다 */}
          <Delta changePercent={gain ?? 0} arrow={false} size={12} />
        </>
      ) : (
        // 보유 없음은 '－ · －' 두 줄로 자리를 채우지 않는다 — 빈 자리에 대시를
        // 채워 넣으면 값이 있는 행과 무게가 같아져 표가 시끄러워진다.
        <span className="text-muted-40 text-12">
          관심만
        </span>
      )}
    </button>
  );
}

/**
 * 숫자 한 칸. `type="number"` 가 아니라 `inputMode` 다 — number 는 브라우저가
 * 스피너를 그리고(122px 칸에서 자리를 뺏는다) 휠 스크롤로 값이 바뀐다.
 */
function Field({
  ref,
  value,
  onChange,
  onCommit,
  onCancel,
  ariaLabel,
  placeholder,
}: {
  ref?: React.Ref<HTMLInputElement>;
  value: string;
  onChange: (next: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  ariaLabel: string;
  placeholder: string;
}) {
  return (
    <input
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => {
        // 같은 셀의 다른 칸으로 옮겨 가는 것은 편집을 끝낸 것이 아니다 —
        // 수량에서 평단으로 Tab 할 때마다 저장되면 반쪽 값이 서버로 간다.
        if (event.currentTarget.parentElement?.contains(event.relatedTarget)) return;
        onCommit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit();
        if (event.key === "Escape") onCancel();
      }}
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      className="num w-full min-w-0 border-b border-ink bg-transparent text-right outline-none placeholder:text-muted-35 text-12"
    />
  );
}
