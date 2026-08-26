import Link from "next/link";
import { count as fmtCount } from "@/lib/format";
import { Icon } from "@/shared/ui";

export interface PaginationProps {
  /** 1-based 현재 페이지 */
  page: number;
  /** 실제로 갈 수 있는 마지막 페이지 (`lastReachablePage`) */
  lastPage: number;
  /** 조건에 맞는 전체 건수 — "2,841종목" 캡션에 쓴다 */
  total: number;
  /** 페이지 번호 → 주소. 조건은 그대로 두고 페이지만 바꾼다 */
  hrefFor: (page: number) => string;
}

const STEP =
  "flex min-h-[var(--tap)] items-center gap-1 border border-line-25 px-3 py-2 font-medium hover:border-ink md:min-h-0";

/**
 * 목록 페이지 이동. 랭킹 표와 조건 검색 표가 같이 쓴다.
 *
 * ## 번호를 나열하지 않는다
 *
 * 조건 검색은 마지막 페이지가 쉽게 50을 넘는다(2,800종목 ÷ 50행). 번호를 다 깔면
 * 그 줄이 표보다 시끄러워지고, 모바일에서는 두세 줄로 접힌다. 사용자가 실제로
 * 하는 일은 **다음을 보거나 처음으로 돌아가는 것**이라 그 둘만 남겼다.
 *
 * ## 버튼이 아니라 링크다
 *
 * 이 두 화면은 상태를 URL 이 들고 서버에서 그린다(`app/stocks/page.tsx` 주석).
 * 링크로 두면 페이지 이동이 공유 가능한 주소가 되고 뒤로가기가 그대로 동작하며,
 * 이 컴포넌트가 클라이언트 번들에 실리지 않는다.
 */
export function Pagination({ page, lastPage, total, hrefFor }: PaginationProps) {
  // 한 페이지에 다 들어가면 컨트롤을 그리지 않는다 — 누를 수 없는 화살표 두 개는
  // 정보가 아니라 소음이다.
  if (lastPage <= 1) return null;

  const hasPrev = page > 1;
  const hasNext = page < lastPage;

  return (
    <nav
      aria-label="목록 페이지"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line-20 pt-3.5"
    >
      <span className="num text-muted-45 text-11">
        {fmtCount(total)}종목 · {page} / {lastPage} 페이지
      </span>

      <span className="flex items-center gap-2 text-13">
        {hasPrev ? (
          <Link href={hrefFor(page - 1)} className={STEP} rel="prev">
            <Icon name="arrow-left" size={13} />
            이전
          </Link>
        ) : (
          // 자리를 비우지 않는다 — 첫 페이지에서 '다음'만 남으면 버튼이 좌우로
          // 움직여, 연속으로 넘기는 동안 커서 아래에서 자리가 바뀐다.
          <span className={`${STEP} border-line-14 text-muted-30`} aria-hidden>
            <Icon name="arrow-left" size={13} />
            이전
          </span>
        )}

        {hasNext ? (
          <Link href={hrefFor(page + 1)} className={STEP} rel="next">
            다음
            <Icon name="arrow-right" size={13} />
          </Link>
        ) : (
          <span className={`${STEP} border-line-14 text-muted-30`} aria-hidden>
            다음
            <Icon name="arrow-right" size={13} />
          </span>
        )}
      </span>
    </nav>
  );
}
