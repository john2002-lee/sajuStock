import { TEXT_CLASS, smaller, type TextSize } from "./text";

/**
 * 모든 섹션 머리. mono uppercase 라벨 + 선택적 우측 캡션.
 *
 * variant
 *  - "rule"    상단 헤어라인 위에 얹는 본문 섹션 라벨 (차트·탭)
 *  - "panel"   패널 내부 라벨 — 아래쪽에 구분선 (투자 지표·시장 개요)
 *  - "bare"    선 없음
 *
 * 우측 캡션은 **한 단 아래**다. 예전에는 `size - 1.5` 였는데 스케일이 균일하지
 * 않아 뺄셈으로는 표현할 수 없다 (`text.ts` 의 `smaller` 주석).
 */
export function SectionLabel({
  children,
  right,
  size = 12,
  variant = "rule",
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  size?: TextSize;
  variant?: "rule" | "panel" | "bare";
}) {
  const wrapper =
    variant === "rule"
      ? "flex items-baseline justify-between gap-4 border-t border-line-20 pt-3"
      : variant === "panel"
        ? "flex items-baseline justify-between gap-4 border-b border-line-20 pb-2"
        : "flex items-baseline justify-between gap-4";

  return (
    <div className={wrapper}>
      <span
        className={`font-mono font-medium uppercase tracking-label-wide text-ink ${TEXT_CLASS[size]}`}
      >
        {children}
      </span>
      {right ? (
        <span className={`font-mono text-muted-45 ${TEXT_CLASS[smaller(size)]}`}>
          {right}
        </span>
      ) : null}
    </div>
  );
}
