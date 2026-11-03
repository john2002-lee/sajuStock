import { relative } from "@/lib/format";
import type { AnalystReport, NewsItem } from "../../model/types";
import { CONSOLE_LABEL, CONSOLE_LABEL_STYLE } from "./tokens";

/** 2b 콘솔 우측 레일 — 뉴스 + 리포트. */
export function ContentRail({
  news,
  reports,
  now,
}: {
  news: NewsItem[];
  reports: AnalystReport[];
  now: string;
}) {
  return (
    <aside className="flex w-full flex-col md:w-[252px]">
      <h2 className={`${CONSOLE_LABEL} px-[14px] py-3`} style={CONSOLE_LABEL_STYLE}>
        news · {news.length}
      </h2>
      {news.map((item) => {
        // 링크 없는 기사는 앵커로 감싸지 않는다 (href="" = 현재 문서 재요청)
        const Row = item.url ? "a" : "div";
        return (
          <Row
            key={`${item.publisher}-${item.title}`}
            {...(item.url
              ? { href: item.url, target: "_blank", rel: "noopener noreferrer" }
              : {})}
            className="flex min-h-[var(--tap)] flex-col justify-center gap-1 border-b border-line-14 px-[14px] py-2.5 hover:bg-surface-hover md:min-h-0"
          >
            <span
              className="text-pretty text-13 leading-[1.45]"
            >
              {item.title}
            </span>
            {/* 상대 시각이 빠져 있었다 — 뉴스는 언제 것인지가 절반이다 */}
            <span className="num text-muted-50 text-10">
              {item.publisher} · {relative(item.publishedAt, now)}
            </span>
          </Row>
        );
      })}

      <h2 className={`${CONSOLE_LABEL} px-[14px] py-3`} style={CONSOLE_LABEL_STYLE}>
        reports · {reports.length}
      </h2>
      {reports.map((item) => (
        <div
          key={item.publisher + item.title}
          className="flex flex-col gap-1 border-b border-line-14 px-[14px] py-2.5"
        >
          <span className="text-13">{item.publisher}</span>
          <span className="num truncate text-muted-50 text-11">
            {item.title}
          </span>
        </div>
      ))}
    </aside>
  );
}
