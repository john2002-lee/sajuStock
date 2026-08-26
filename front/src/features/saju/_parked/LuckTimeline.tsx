import type { Luck } from "../model/types";

/**
 * 대운 10년 단위 흐름.
 *
 * 나이는 **세는나이**다 — 백엔드가 `lunar-python` 의 `DaYun` 을 그대로 물려받고
 * 있고(만 나이로 "고치면" 모든 대운 경계가 1~2년 밀린다), 한국 사주 독자가 대운
 * 나이에 기대하는 것이 세는나이다. 화면에서 그 사실을 밝힌다.
 */
export function LuckTimeline({ luck }: { luck: Luck }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-60">
        {luck.forward ? "순행" : "역행"} · 첫 대운 {luck.startAge}세부터
      </p>

      <div className="-mx-1 overflow-x-auto">
        <div className="flex gap-2 px-1 pb-1">
          {luck.daYun.map((entry) => {
            const isCurrent = luck.currentDaYun?.startYear === entry.startYear;
            return (
              <div
                key={entry.startYear}
                className={
                  "min-w-[74px] shrink-0 border px-2 py-2.5 text-center " +
                  (isCurrent
                    ? "border-ink bg-ink text-on-ink"
                    : "border-line-18 bg-surface text-ink")
                }
              >
                <div
                  className={
                    "text-[10px] tabular-nums " +
                    (isCurrent ? "text-on-ink-75" : "text-muted-50")
                  }
                >
                  {entry.startAge}세
                </div>
                <div className="mt-1 text-[14px]">{entry.hangul}</div>
                <div
                  className={
                    "mt-0.5 text-[10px] " + (isCurrent ? "text-on-ink-75" : "text-muted-55")
                  }
                >
                  {entry.shiShen}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-muted-50">
        나이는 세는나이입니다({luck.nowYear}년 기준).
        {luck.currentDaYun === null && " 아직 첫 대운 이전 구간입니다."}
      </p>
    </div>
  );
}
