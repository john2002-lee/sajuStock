import { directionColorClass } from "@/lib/format";
import { TEXT_CLASS, type TextSize } from "./text";

/**
 * 라벨 / 값 2열 행. 투자 지표 · 시장 개요 · AI 근거에서 쓴다.
 *
 * 구분선은 없다 — 2a 우측 레일은 행 간격(gap)으로만 구분한다.
 * accent 는 상승/하락 색을 값에 입힌다. 색 문자열을 직접 넘기지 말 것.
 */
export function StatRow({
  label,
  value,
  accent,
  labelSize = 13,
  valueSize = 13,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  accent?: "up" | "down";
  labelSize?: TextSize;
  valueSize?: TextSize;
}) {
  // accent 가 없으면 등락값이 아니라 그냥 지표다 — 보합(`text-muted-60`)이 아니라
  // 평범한 본문 색이 맞다. 색 분기 자체는 `lib/format/direction` 이 소유한다.
  const valueColor = accent ? directionColorClass(accent) : "text-ink";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-muted-60 ${TEXT_CLASS[labelSize]}`}>{label}</span>
      <span
        className={`num text-right font-medium ${valueColor} ${TEXT_CLASS[valueSize]}`}
      >
        {value}
      </span>
    </div>
  );
}
