"use client";

import type { WatchGroup } from "../model/types";

/**
 * 그룹 필터 칩. 시안에는 활성 상태가 그려져 있지 않아, 이 디자인 시스템에서
 * '선택됨'을 뜻하는 반전(solid) 표기를 그대로 쓴다 (Chip solid · 검색 모드 칩과 동일).
 */
export function GroupTabs({
  groups,
  active,
  onChange,
}: {
  groups: WatchGroup[];
  active: string;
  onChange: (name: string) => void;
}) {
  return (
    <div role="tablist" aria-label="그룹 필터" className="flex flex-wrap gap-1.5">
      {groups.map((group) => {
        const selected = group.name === active;
        return (
          <button
            key={group.name}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(group.name)}
            className={`flex min-h-[var(--tap)] items-center gap-1.5 border px-[13px] py-[7px] font-medium md:min-h-0 md:items-baseline ${
              selected
                ? "border-ink bg-ink text-on-ink"
                : "border-line-28 hover:bg-surface"
            } text-13`}
          >
            <span>{group.name}</span>
            <span
              className={`num font-normal ${selected ? "text-on-ink-55" : "text-muted-50"} text-10`}
            >
              {group.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
