import { SectionLabel, StatRow } from "@/shared/ui";
import type { Metric } from "../model/types";

export function MetricsRail({ metrics }: { metrics: Metric[] }) {
  return (
    <section className="flex flex-col gap-[11px] bg-surface px-4 pb-[18px] pt-4">
      <SectionLabel variant="panel" size={11}>
        투자 지표
      </SectionLabel>
      {metrics.map((metric) => (
        <StatRow
          key={metric.label}
          label={metric.label}
          value={metric.value}
          accent={metric.accent}
        />
      ))}
    </section>
  );
}
