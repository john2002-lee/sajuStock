"use client";

import { Delta, Icon } from "@/shared/ui";
import { SORT_LABELS, type SortKey } from "../model/types";

const KEYS = Object.keys(SORT_LABELS) as SortKey[];

/**
 * 정렬 기준 + 평가손익 합계.
 *
 * `<select>` 는 브라우저 기본 화살표를 그린다 — OS 마다 모양이 달라 이 테마의
 * mono 캐럿과 어긋난다. appearance-none 으로 끄고 캐럿을 직접 얹는다
 * (디자인 4b: `정렬: 등락률 ▾`).
 */
export function SortControl({
  value,
  totalReturnPercent,
  onChange,
}: {
  value: SortKey;
  totalReturnPercent: number;
  onChange: (next: SortKey) => void;
}) {
  return (
    <div
      className="flex items-center gap-3.5 font-mono text-muted-55 text-11"
    >
      <label className="flex min-h-[var(--tap)] items-center gap-1.5 md:min-h-0">
        정렬:
        <span className="relative flex items-center">
          <select
            value={value}
            onChange={(event) => onChange(event.target.value as SortKey)}
            aria-label="정렬 기준"
            className="min-h-[var(--tap)] cursor-pointer appearance-none border-0 bg-transparent pr-[15px] font-mono text-ink outline-none md:min-h-0 text-11"
          >
            {KEYS.map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
          <Icon
            name="chevron-down"
            size={12}
            className="pointer-events-none absolute right-0 text-muted-45"
          />
        </span>
      </label>

      <span className="flex items-center gap-1.5 border-l border-line-20 pl-3.5">
        평가손익 합계
        {/* 색 분기는 Delta 안에서만 */}
        <Delta changePercent={totalReturnPercent} arrow={false} size={11} />
      </span>
    </div>
  );
}
