import { price as fmtPrice } from "@/lib/format";
import { SectionLabel } from "@/shared/ui";
import type { AnalystReport } from "../model/types";

/** 투자의견 색. 등락 색과 무관한 별개 축이므로 Delta 를 재사용하지 않는다. */
const OPINION_COLOR: Record<
  NonNullable<AnalystReport["opinion"]>,
  string
> = {
  매수: "text-up",
  중립: "text-ink",
  매도: "text-down",
};

/**
 * 목표가 변동 한 줄. 백엔드 AnalystReport 에는 목표가가 없어서 실 연결에서는
 * 비어 있다 — 그럴 때는 "커버리지 개시 · － → －" 같은 껍데기를 남기지 않고
 * 줄 자체를 렌더하지 않는다.
 */
function targetLine(report: AnalystReport): string | null {
  const { targetFrom, targetTo } = report;
  if (targetTo === undefined) return null;

  if (targetFrom === undefined) {
    return `커버리지 개시 · ${fmtPrice(targetTo)}`;
  }
  const action =
    targetTo > targetFrom
      ? "목표가 상향"
      : targetTo < targetFrom
        ? "목표가 하향"
        : "등급 유지";
  return `${action} · ${fmtPrice(targetFrom)} → ${fmtPrice(targetTo)}`;
}

export function ReportDigest({ reports }: { reports: AnalystReport[] }) {
  return (
    <section className="flex flex-col gap-2.5">
      <SectionLabel variant="panel" size={11}>
        리포트 요약
      </SectionLabel>
      {reports.map((report) => (
        <div
          key={report.publisher + report.title}
          className="flex flex-col gap-[3px] border-b border-dotted border-line-22 pb-[9px]"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-13">
              {report.publisher}
            </span>
            {report.opinion ? (
              <span
                className={`num font-medium ${OPINION_COLOR[report.opinion]} text-11`}
              >
                {report.opinion}
              </span>
            ) : null}
          </div>
          {targetLine(report) ? (
            <span className="num text-muted-55 text-11">
              {targetLine(report)}
            </span>
          ) : (
            // 목표가가 없으면 제목이라도 보여준다 — 증권사 이름만 남은 행은 정보가 없다.
            <span
              className="truncate text-muted-55 text-11"
              title={report.title}
            >
              {report.title}
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
