"use client";

/**
 * 26×15 pill. README 가 명시한 radius 0 예외라 .pill 유틸을 쓴다.
 *
 * 26×15 는 손가락으로 누르기엔 너무 작아 버튼(히트 영역)과 pill(그림)을 나눈다 —
 * 보이는 크기는 그대로 두고 누를 수 있는 영역만 44×44 로 넓힌다.
 * 표 안에서 줄 높이를 밀지 않도록 데스크탑에서는 원래대로 돌린다.
 */
export function AlertToggle({
  enabled,
  label,
  onToggle,
}: {
  enabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`${label} 알림`}
      onClick={onToggle}
      className="-m-2 flex min-h-[var(--tap)] min-w-[var(--tap)] flex-none items-center justify-center p-2 md:m-0 md:min-h-0 md:min-w-0 md:p-0"
    >
      <span
        aria-hidden
        className={`pill flex h-[15px] w-[26px] flex-none items-center p-0.5 ${
          enabled ? "bg-ink" : "bg-line-30"
        }`}
      >
        <span
          className={`dot block h-[11px] w-[11px] bg-paper ${enabled ? "ml-auto" : ""}`}
        />
      </span>
    </button>
  );
}
