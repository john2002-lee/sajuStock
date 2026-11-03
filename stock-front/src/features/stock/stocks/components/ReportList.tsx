import { price as fmtPrice, relative } from "@/lib/format";
import { Chip, DottedRow } from "@/shared/ui";
import type { AnalystReport } from "../model/types";

export function ReportList({
  items,
  now,
}: {
  items: AnalystReport[];
  now: string;
}) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-muted-60 text-13">
        표시할 리포트가 없습니다.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li key={item.publisher + item.title}>
          <DottedRow tone="news" align="start" className="gap-3.5 pb-3">
            <span
              className="num w-4 flex-none text-muted-35 text-13"
            >
              {String(index).padStart(2, "0")}
            </span>
            <span className="flex flex-1 flex-col gap-[5px]">
              <span
                className="font-display font-medium leading-[1.4] text-pretty text-16"
              >
                {item.title}
              </span>
              <span
                className="text-pretty text-ink-2 text-13 leading-[1.65]"
              >
                {item.summary}
              </span>
              <span
                className="font-mono tracking-label-tight text-muted-50 text-11"
              >
                {item.publisher} · {relative(item.publishedAt, now)}
                {item.targetTo
                  ? ` · 목표가 ${fmtPrice(item.targetTo)}`
                  : ""}
              </span>
            </span>
            {item.opinion ? (
              <span className="flex-none">
                <Chip>{item.opinion}</Chip>
              </span>
            ) : null}
          </DottedRow>
        </li>
      ))}
    </ol>
  );
}
