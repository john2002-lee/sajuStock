import { button } from "@/shared/ui";
import { currentUser } from "@/auth";
import {
  getScreener,
  lastReachablePage,
  offsetOf,
  Pagination,
  parsePage,
  parseScreenerQuery,
  screenerPageHref,
  ScreenerFilterBar,
  ScreenerTable,
  SCREENER_MAX_OFFSET,
  SCREENER_PAGE_SIZE,
} from "@/features/stock/market";
import { SearchTrigger } from "@/features/stock/search";
import { count, masthead } from "@/lib/format";
import { AccountMenu } from "@/shared/components/layout/AccountMenu";
import { Masthead } from "@/shared/components/layout/Masthead";
import { MobileTabBar } from "@/shared/components/layout/MobileTabBar";
import Link from "next/link";
import { BrowseHeader } from "../_components/BrowseHeader";
import { BrowseTabs } from "../_components/BrowseTabs";

/**
 * 종목 탐색 · 조건 검색 (스크리너).
 *
 * `/stocks` 와 같은 이유로 요청 시 렌더한다 — 정적 프리렌더로 두면 `next build` 가
 * 빌드 머신에서 백엔드에 접속해야 한다. `revalidate = 0` 을 쓴다(`force-dynamic`
 * 이 아니다) — 라우트는 항상 동적으로 렌더하되, fetch 단위의 `force-cache`+
 * revalidate(30분)는 그대로 유지되어 실제 백엔드 호출 빈도를 정한다. 지표는
 * 하루 1회 배치가 채우므로 시세 계열의 60초와 맞출 이유가 없다
 * (`getScreener` 주석).
 */
export const revalidate = 0;

/** Next 16 은 searchParams 를 Promise 로 준다 — 페이지에서 await 한다. */
interface ScreenerPageProps {
  searchParams: Promise<{
    board?: string;
    cap?: string;
    per?: string;
    pbr?: string;
    div?: string;
    roe?: string;
    sort?: string;
    page?: string;
  }>;
}

/**
 * 랭킹 화면과 마찬가지로 **조건을 URL 이 들고 있다.**
 *
 * 덕분에 조건 조합이 공유 가능한 주소가 되고("PER 10 이하 코스피 배당 2% 이상"),
 * 뒤로가기가 조건 되돌리기로 동작하며, 이 화면에서 브라우저로 내려가는 컴포넌트는
 * 검색 트리거뿐이다 — 탭·조건 칩·표 전부 서버에서 HTML 로 끝난다.
 *
 * 페이지는 조립만 한다 (CONVENTIONS: app/ 은 라우팅만). 데이터는 services 가,
 * searchParams 검증과 프리셋 경계값은 model 이, 조판은 features/market 의
 * components/screener 가 소유한다.
 */
export default async function ScreenerPage({ searchParams }: ScreenerPageProps) {
  const params = await searchParams;
  const query = parseScreenerQuery(params);
  const page = parsePage(params.page);

  // 랭킹 화면과 같은 이유로 병렬이다 — 세션 확인은 조건 검색과 무관하다.
  const [result, user] = await Promise.all([
    getScreener(query, {
      offset: offsetOf(page, SCREENER_PAGE_SIZE, SCREENER_MAX_OFFSET),
    }),
    currentUser(),
  ]);
  const signedIn = Boolean(user);
  const lastPage = lastReachablePage(
    result.total,
    SCREENER_PAGE_SIZE,
    SCREENER_MAX_OFFSET,
  );

  const caption = result.asOf
    ? `${masthead(`${result.asOf}T06:30:00Z`)} · 지표 기준일`
    : "지표 수집 중";

  return (
    <>
      <main className="mx-auto flex w-full max-w-shell flex-col gap-4 px-4 pb-28 pt-[26px] md:px-8 md:pb-[30px]">
        {/* 랭킹 탭과 같은 이유로 검색 필드를 비운다 — 두 탭의 제호 구성이 다르면
            탭을 옮길 때마다 줄이 흔들린다 (app/stocks/page.tsx 주석). */}
        <Masthead
          home="/stock"
          caption={caption}
          action={
            <>
              {/* 담아 둔 종목을 여는 곳은 대시보드 하나다. 로그인해야 열리므로
                  안 한 사람에게는 두지 않는다 — 누르면 로그인으로 튕기는 미끼가 된다.
                  로그인 자체는 바로 옆 AccountMenu 가 안내한다. */}
              {signedIn ? (
                <Link
                  href="/dashboard"
                  className={button({ tap: false, className: "hidden md:inline-flex" })}
                >
                  대시보드
                </Link>
              ) : null}
              <AccountMenu />
            </>
          }
        />

        {/* 모집단을 그대로 밝힌다 — 랭킹(200종목)과 여기(전 종목)가 다르다는 것이
            이 화면을 오해 없이 읽는 전제다 (BrowseHeader · BrowseTabs 주석). */}
        <BrowseHeader
          scope={
            result.universeSize > 0
              ? `상장 ${count(result.universeSize)}종목 · 지표 ${count(result.covered)}종목 수집`
              : "지표 준비 중"
          }
        />

        <BrowseTabs current="screener" />

        <ScreenerFilterBar query={query} />

        <ScreenerTable result={result} query={query} />

        <Pagination
          page={page}
          lastPage={lastPage}
          total={result.total}
          hrefFor={(next) => screenerPageHref(query, next)}
        />
      </main>

      <MobileTabBar current="stocks" search={<SearchTrigger variant="tab" />} />
    </>
  );
}
