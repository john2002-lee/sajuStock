import { relative } from "@/lib/format";
import { isSafeHttpUrl } from "@/lib/utils/safe-url";
import { DottedRow } from "@/shared/ui";
import type { NewsItem } from "../model/types";
import { NewsThumbnail } from "./NewsThumbnail";

export function NewsList({
  items,
  now,
}: {
  items: NewsItem[];
  now: string;
}) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-muted-60 text-13">
        표시할 뉴스가 없습니다.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li key={`${item.publisher}-${item.title}`}>
          <DottedRow tone="news" align="start" className="gap-3.5 pb-3">
            <span
              className="num w-4 flex-none text-muted-35 text-13"
            >
              {String(index).padStart(2, "0")}
            </span>
            <span className="flex flex-1 flex-col gap-[5px]">
              {/* 링크 없는 기사는 앵커로 감싸지 않는다 — href="" 는 현재 문서를
                  다시 불러오는 동작이라 클릭하면 페이지가 통째로 리로드된다. */}
              <Title url={item.url}>{item.title}</Title>
              <span
                className="font-mono tracking-label-tight text-muted-50 text-11"
              >
                {item.publisher} · {relative(item.publishedAt, now)}
              </span>
            </span>
            <NewsThumbnail src={item.thumbnail} alt="" />
          </DottedRow>
        </li>
      ))}
    </ol>
  );
}

const TITLE =
  "flex min-h-[var(--tap)] items-center font-display font-medium leading-[1.4] text-pretty md:min-h-0 md:block text-16";

function Title({ url, children }: { url?: string; children: React.ReactNode }) {
  if (!isSafeHttpUrl(url)) {
    return (
      <span className={TITLE}>
        {children}
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${TITLE} hover:text-up`}
    >
      {children}
    </a>
  );
}
