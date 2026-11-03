"use client";

import { button } from "@/shared/ui";
import { ALL_GROUP } from "@/features/stock/watchlist";

/** 데스크탑 보기 — nav+상세 분할 / 표(전체 폭) */
export type BoardLayout = "split" | "table";

/**
 * 데스크탑 보기 전환. 모바일에는 분할이 없으므로 이 컨트롤도 없다.
 *
 * URL 이 아니라 클라이언트 상태다 — 정렬·그룹과 달리 **공유할 가치가 없는**
 * 개인 취향이고, URL 에 실으면 상세 라우트마다 물고 다녀야 한다.
 */
export function LayoutToggle({
  value,
  onChange,
}: {
  value: BoardLayout;
  onChange: (next: BoardLayout) => void;
}) {
  const options: { key: BoardLayout; label: string }[] = [
    { key: "split", label: "분할" },
    { key: "table", label: "표" },
  ];

  return (
    <div className="hidden border border-line-25 md:flex" role="group" aria-label="보기">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={value === option.key}
          onClick={() => onChange(option.key)}
          className={`px-2.5 py-1 font-medium ${
            value === option.key
              ? "bg-ink text-on-ink"
              : "text-muted-60 hover:bg-surface-hover"
          } text-12`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 담아 둔 것이 없을 때.
 *
 * 전체 그룹이 비었을 때와 특정 그룹만 비었을 때가 다른 말이어야 한다 — 후자는
 * 종목을 담으라는 안내가 아니라 "이 그룹에 없다" 이고, 조치가 다르다.
 */
export function EmptyState({
  group,
  onAdd,
}: {
  group: string;
  /** 검색 팔레트를 연다. 안내만 하고 끝내지 않는다 */
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 border-b border-dotted border-line-22 py-12">
      <p
        className="font-mono uppercase tracking-label text-muted-35 text-11"
      >
        empty
      </p>
      {group === ALL_GROUP ? (
        <>
          <p className="text-muted-60 text-13">
            아직 담아 둔 종목이 없습니다.
          </p>
          <button
            type="button"
            onClick={onAdd}
            className={button({ tap: false, className: "mt-0.5" })}
          >
            종목 찾아 담기
          </button>
        </>
      ) : (
        <p className="text-muted-60 text-13">
          {group} 그룹에 종목이 없습니다.
        </p>
      )}
    </div>
  );
}
