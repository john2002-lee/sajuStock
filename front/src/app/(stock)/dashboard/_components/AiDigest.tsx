import Link from "next/link";
import type { WatchItem, Watchlist } from "@/features/stock/watchlist";
import { Delta, SectionLabel, StatRow } from "@/shared/ui";

/** 표시 순서를 고정한다 — 집계 결과에 따라 줄 순서가 흔들리면 매번 다시 읽어야 한다. */
const ORDER: NonNullable<WatchItem["verdict"]>[] = [
  "비중 확대",
  "유지",
  "관망",
  "과열 주의",
];

/**
 * 관심 종목의 **마지막 AI 판단**을 모아 보여 준다.
 *
 * 여기서 분석을 돌리지는 않는다. 종목당 LLM 4회라 화면을 여는 것만으로 시작되면
 * 안 되고(nav 의 일괄 분석에 `MAX_BULK_SYMBOLS` 상한이 있는 이유다), 이 타일의 일은 **이미
 * 나와 있는 판단을 한자리에 놓는 것**이다. 실행은 좌측 nav 에서 종목을 골라 시작한다.
 *
 * 색은 판단 용어가 아니라 그 종목의 등락 색을 따른다 — `VerdictCell` 과 같은 규칙이다.
 */
export function AiDigest({ watchlist }: { watchlist: Watchlist }) {
  const judged = watchlist.items.filter((item) => item.verdict);
  const pending = watchlist.items.length - judged.length;

  const counts = ORDER.map((verdict) => ({
    verdict,
    items: judged.filter((item) => item.verdict === verdict),
  })).filter((row) => row.items.length > 0);

  // 지금 눈이 가야 하는 것. '과열 주의' 는 담아 둔 종목에 대한 경고라 목록으로 편다.
  const warned = judged.filter((item) => item.verdict === "과열 주의");

  return (
    <section className="flex flex-col gap-[11px] bg-surface px-4 pb-[18px] pt-4">
      <SectionLabel variant="panel" size={11}>
        AI 판단 현황
      </SectionLabel>

      {judged.length === 0 ? (
        <p className="text-muted-60 text-12">
          아직 분석한 종목이 없습니다.
        </p>
      ) : (
        counts.map((row) => (
          <StatRow
            key={row.verdict}
            label={row.verdict}
            value={`${row.items.length}종목`}
          />
        ))
      )}

      {pending > 0 ? (
        <StatRow
          label="분석 전"
          value={`${pending}종목`}
        />
      ) : null}

      {warned.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-line-20 pt-2.5">
          <span
            className="font-mono uppercase tracking-label text-muted-45 text-10"
          >
            과열 주의
          </span>
          {warned.map((item) => (
            <Link
              key={item.code}
              href={`/dashboard/${item.code}`}
              className="flex items-baseline justify-between gap-2 hover:text-ink"
            >
              <span className="min-w-0 truncate font-display text-13">
                {item.name}
              </span>
              {/* 부호·색·포맷을 여기서 다시 만들지 않는다 — 상승 빨강/하락 파랑
                  분기는 `Delta` 하나가 소유한다 (lib/format/direction). */}
              <Delta changePercent={item.changePercent} arrow={false} size={12} />
            </Link>
          ))}
        </div>
      ) : null}

      <Link
        href="/dashboard"
        className="mt-0.5 border border-line-30 py-2 text-center font-medium hover:bg-ink hover:text-on-ink text-12"
      >
        선택해서 분석하기
      </Link>
    </section>
  );
}
