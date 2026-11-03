import { directionColorClass } from "@/lib/format";
import type { Metric } from "../../model/types";
import { CONSOLE_LABEL } from "./tokens";

/** 3열 × 2행 지표 그리드 — 2a 우측 레일(MetricsRail) 6행과 같은 데이터다 */
export function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <section className="grid grid-cols-2 border-t border-line-14 md:grid-cols-3">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="flex flex-col gap-1.5 border-b border-r border-line-14 px-4 py-3.5"
        >
          <span
            className={`${CONSOLE_LABEL} text-10 tracking-[0.14em]`}
          >
            {metric.label}
          </span>
          {/* 색 분기는 `lib/format/direction` 이 소유한다 — 여기서 삼항으로 다시
              쓰면 색 반전 토글이 생겼을 때 이 화면만 옛 색으로 남는다.
              accent 가 없으면 등락값이 아니므로 평범한 본문 색이다 (`StatRow` 와 같다). */}
          <span
            className={`num font-medium ${
              metric.accent ? directionColorClass(metric.accent) : "text-ink"
            } text-16`}
          >
            {metric.value}
          </span>
        </div>
      ))}
    </section>
  );
}
