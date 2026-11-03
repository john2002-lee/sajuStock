import { multiple, unsignedPercent } from "@/lib/format";
import { SectionLabel, StatRow } from "@/shared/ui";
import type { Fundamentals } from "../model/types";

/**
 * 우측 레일의 밸류에이션 3행 (PER · PBR · 배당수익률).
 *
 * 재무 탭에 전부 있는데도 여기 다시 두는 이유: 재무는 세 번째 탭이라 기본으로 가려져
 * 있고, "지금 비싼가 / 얼마 주나"는 클릭 없이 보여야 하는 축이다. 여기는 요약이고
 * 전체는 탭에 있다 — 그래서 3행으로 고정한다.
 *
 * 셋 다 없으면 섹션째 렌더하지 않는다. 빈 패널이 남으면 레일에 구멍이 생긴다.
 */
export function ValuationRail({ fundamentals }: { fundamentals: Fundamentals | null }) {
  if (!fundamentals) return null;

  const rows: { label: string; value: string }[] = [];
  if (fundamentals.per !== null) rows.push({ label: "PER", value: multiple(fundamentals.per) });
  if (fundamentals.pbr !== null) rows.push({ label: "PBR", value: multiple(fundamentals.pbr) });
  if (fundamentals.dividendYieldPercent !== null) {
    rows.push({
      label: "배당수익률",
      // 수준을 나타내는 값이라 부호를 붙이지 않는다.
      value: unsignedPercent(fundamentals.dividendYieldPercent),
    });
  }

  if (rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-[11px] bg-surface px-4 pb-[18px] pt-4">
      <SectionLabel variant="panel" size={11}>
        밸류에이션
      </SectionLabel>
      {rows.map((row) => (
        <StatRow key={row.label} label={row.label} value={row.value} />
      ))}
    </section>
  );
}
