import Link from "next/link";
import { deltaColorClass, percent, ymd } from "@/lib/format";
import { SectionLabel } from "@/shared/ui";
import type { VerdictRecord } from "../model/verdict";

/**
 * 판정 → 색. **등락색을 쓰지 않는다.**
 *
 * BUY 에 `--up`(상승 빨강)을 주면 "이 종목이 올랐다" 로 읽힌다. 판정은 예측이
 * 아니라 평가이고, 바로 옆에 진짜 등락률(`그 뒤 +4.2%`)이 서 있어서 두 색이
 * 같으면 어느 쪽이 시세인지 알 수 없다 — `StanceStrip` 과 같은 판단이다.
 */
const TONE: Record<string, string> = {
  BUY: "text-ma60",
  WATCH: "text-muted-60",
  AVOID: "text-ma20",
};

/**
 * 홈의 **내 판단 기록**. 이 섹션이 이 리뉴얼에서 "다시 올 이유" 를 맡는다.
 *
 * ## 왜 홈 위쪽인가
 *
 * 홈이 주는 것(지수·등락상위·일정)은 전부 다른 데도 있다. **이 앱에만 있는 것은
 * AI 판단인데 그것은 종목 상세에 들어가야만 만났다.** 내가 받은 판단을 홈에
 * 올리면, 첫 화면이 "시장이 어떤가" 에서 "내가 무엇을 물어봤나" 로 바뀐다.
 *
 * ## "그 뒤 +4.2%" — 이 줄이 재방문을 만든다
 *
 * 판정과 날짜만 있으면 이 섹션은 "내가 뭘 물어봤나" 로 끝난다. 그 뒤 얼마나
 * 움직였는지가 붙으면 **판단이 맞았는지 확인하러 오게** 된다.
 *
 * 현재가는 **백엔드가 조회할 때 붙인다.** 종목마다 시세를 따로 부르면 홈 한
 * 화면이 상류 왕복 여섯을 만드는데, `scan_movers` 가 심볼 목록을 한 번의
 * 다운로드로 채우는 벌크 경로를 이미 갖고 있었다 — 관심종목이 쓰는 그
 * 함수다(`advice_verdict_service`). 새 경로를 만들 일이 아니었다.
 *
 * `sincePercent` 가 `null` 이면 **그 조각을 아예 그리지 않는다.** 기준가가 없는
 * 옛 기록이거나 시세 조회가 실패한 경우인데, "그 뒤 0%" 는 "판단 뒤 그대로였다"
 * 는 **틀린 사실**을 말한다.
 *
 * ## 빈 목록이면 아무것도 그리지 않는다
 *
 * 판단을 한 번도 안 받은 사람에게 빈 상자를 보여 주면 홈에 죽은 자리가 생긴다.
 * 그 자리의 온보딩 카드는 호출부(`app/(stock)/stock/page.tsx`)가 정한다 — 이
 * 컴포넌트는 기록을 그리는 일만 안다.
 */
export function VerdictHistory({ records }: { records: VerdictRecord[] }) {
  if (records.length === 0) return null;

  return (
    <section className="flex flex-col gap-2.5" aria-label="내 판단 기록">
      <SectionLabel variant="panel" size={11}>
        내 판단 기록
      </SectionLabel>

      <ol className="flex flex-col">
        {records.map((record) => (
          <li key={record.id}>
            <Link
              href={`/stocks/${record.code}`}
              className="flex min-h-[var(--tap)] items-center gap-3 border-b border-dotted border-line-22 py-2.5 hover:bg-surface-hover md:min-h-0"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-display font-medium text-14">
                  {record.name}
                </span>
                <span className="num truncate text-muted-45 text-10">
                  {ymd(record.createdAt)}
                  {/* 규칙 기반으로 착지한 판단은 목록에서도 구분한다 — 신뢰도만
                      보면 LLM 이 낸 것과 똑같아 보인다. */}
                  {record.source === "llm" ? "" : " · 규칙 기반"}
                  {/* **이 줄이 재방문의 핵심이다.** 판단이 맞았는지 확인하러 오게
                      만든다. `null` 이면 아무것도 그리지 않는다 — 기준가가 없는
                      옛 기록이나 시세 조회가 실패한 경우인데, "그 뒤 0%" 는
                      "판단 뒤 그대로였다" 는 틀린 사실을 말한다. */}
                  {record.sincePercent === null ? null : (
                    <>
                      {" · 그 뒤 "}
                      <span className={deltaColorClass(record.sincePercent)}>
                        {percent(record.sincePercent)}
                      </span>
                    </>
                  )}
                </span>
              </span>

              <span className="flex flex-none flex-col items-end gap-0.5">
                <span
                  className={`font-mono font-medium text-13 ${
                    TONE[record.decision] ?? "text-ink"
                  }`}
                >
                  {record.decision}
                </span>
                <span className="num text-muted-45 text-10">
                  신뢰도 {record.confidence}%
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
