import Link from "next/link";
import { plainDate } from "@/lib/format";
import { StockNameCell } from "./table";
import type { CalendarBlock, CalendarEvent } from "../model/types";

const KIND_LABEL: Record<CalendarEvent["kind"], string> = {
  earnings: "실적발표",
  ex_dividend: "배당락",
};

/** D-0 은 "오늘" 이 읽기 쉽다. D-1 도 "내일" 로 쓰면 그다음부터 규칙이 흔들려 두 개만 둔다. */
function dDayLabel(dDay: number): string {
  if (dDay === 0) return "오늘";
  return `D-${dDay}`;
}

/**
 * 비어 있는 이유를 구분해서 말한다.
 *
 * 배치는 하루 200종목씩 며칠에 걸쳐 채운다. 그래서 초기에는 **일정이 없는 것**과
 * **아직 안 물어본 것**이 똑같이 빈 목록으로 도착한다. 뭉뚱그려 "예정된 일정이
 * 없습니다" 라고 쓰면 그건 거짓말이다 — 이 서비스가 저지를 수 있는 종류의 거짓말 중
 * 가장 흔한 것이고(작업노트 14회차), 오류가 안 나므로 아무도 안 잡는다.
 */
function EmptyNote({ block }: { block: CalendarBlock }) {
  const ratio =
    block.universeSize > 0
      ? Math.round((block.covered / block.universeSize) * 100)
      : 0;

  if (block.covered === 0) {
    return (
      <p className="font-mono text-muted-45 text-11 leading-[1.8]">
        일정을 아직 수집하지 않았습니다. 하루 1회 배치가 순서대로 채웁니다.
      </p>
    );
  }

  return (
    <p className="font-mono text-muted-45 text-11 leading-[1.8]">
      앞으로 {block.days}일간 예정된 일정이 없습니다.
      {ratio < 100 ? (
        <>
          {" "}
          <span className="num">
            (전체 {block.universeSize.toLocaleString()}종목 중 {ratio}% 수집됨 — 남은
            종목에 일정이 있을 수 있습니다)
          </span>
        </>
      ) : null}
    </p>
  );
}

/**
 * 오늘의 일정 — 실적발표 · 배당락.
 *
 * 서버 컴포넌트다. 상호작용이 없고 값이 하루 단위로만 바뀐다.
 *
 * 정렬은 백엔드가 정한다(날짜 오름차순 → 같은 날은 시총 큰 순). 여기서 다시 정렬하지
 * 않는 이유는 화면과 API 가 서로 다른 순서를 주장하면 어느 쪽이 맞는지 알 수 없기
 * 때문이다 — `MoverList` 가 등락률로 다시 정렬하지 않는 것과 같다.
 */
export function CalendarList({ block }: { block: CalendarBlock | null }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-4 border-b border-line-20 pb-2">
        <h2
          className="font-mono font-medium uppercase tracking-label text-11"
        >
          오늘의 일정
        </h2>
        <span className="font-mono text-muted-45 text-10">
          {block ? `앞으로 ${block.days}일 · 실적발표 · 배당락` : "실적발표 · 배당락"}
        </span>
      </div>

      {block === null ? (
        <p className="font-mono text-muted-45 text-11 leading-[1.8]">
          일정을 불러오지 못했습니다.
        </p>
      ) : block.events.length === 0 ? (
        <EmptyNote block={block} />
      ) : (
        <ol className="grid grid-cols-1 gap-x-[26px] md:grid-cols-2">
          {block.events.map((event) => (
            <li key={`${event.code}-${event.kind}`}>
              <Link
                href={`/stocks/${event.code}`}
                className="flex min-h-[var(--tap)] items-center gap-3 border-b border-dotted border-line-20 py-[9px] hover:bg-surface-hover"
              >
                <span
                  className="num w-[58px] flex-none text-muted-45 text-11"
                >
                  {plainDate(event.date)}
                </span>

                <span
                  className="flex-none border border-line-20 px-1.5 py-0.5 font-mono text-muted-45 text-10"
                >
                  {KIND_LABEL[event.kind]}
                </span>

                <StockNameCell
                  name={event.name}
                  meta={event.board ? `${event.code} · ${event.board}` : event.code}
                />

                <span
                  className="num flex-none font-medium text-muted-45 text-11"
                >
                  {dDayLabel(event.dDay)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
