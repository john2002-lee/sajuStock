import { TEXT_CLASS, type TextSize } from "./text";

/** 정규화 심볼 / 시장 / 섹터. 섹터 칩만 solid. */
export function Chip({
  children,
  variant = "outline",
  size = 11,
}: {
  children: React.ReactNode;
  variant?: "outline" | "solid";
  size?: TextSize;
}) {
  const base =
    "inline-flex items-center rounded-6 px-2 py-[3px] font-mono font-medium leading-none tracking-label-tight";
  return (
    <span
      className={`${
        variant === "solid"
          ? `${base} bg-ink text-on-ink`
          : `${base} border border-line-25 text-ink`
      } ${TEXT_CLASS[size]}`}
    >
      {children}
    </span>
  );
}
