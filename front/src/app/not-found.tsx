import { button } from "@/shared/ui";
import Link from "next/link";
import { getStockRanking } from "@/features/stock/market";
import { SearchTrigger } from "@/features/stock/search";
import {
  NotFoundScreen,
  RequestedPath,
  type NotFoundDestination,
  type NotFoundSuggestion,
} from "@/shared/components/feedback";
import { Footer } from "@/shared/components/layout/Footer";
import { Masthead } from "@/shared/components/layout/Masthead";
import { MobileTabBar } from "@/shared/components/layout/MobileTabBar";

/**
 * 루트 404. `notFound()` 호출뿐 아니라 어떤 라우트에도 매칭되지 않은 URL 전부를
 * 여기서 받는다 (Next 16 not-found.js 규약).
 *
 * 전부 서버 컴포넌트다. 요청 헤더도 백엔드도 건드리지 않아 404 한 번에 붙는
 * 비용이 없다 — 유일한 클라이언트 조각은 주소 한 줄을 읽는 RequestedPath 다.
 * (라우트가 ƒ 로 잡히는 건 루트 레이아웃이 테마 쿠키를 읽기 때문이고, 이 화면이
 * 더하는 동적 요인은 없다.)
 *
 * metadata 는 내보내지 않는다. Next 는 not-found.js 의 metadata export 를 읽지
 * 않고(레이아웃·페이지 전용), 404 응답에는 `noindex` 를 자동으로 붙인다.
 */

/**
 * 되돌아갈 길. 이 앱이 실제로 가진 라우트만 적는다.
 *
 * **첫 자리가 서비스 선택(`/`)이다.** 404 는 어느 서비스로 가려던 요청인지 모르는
 * 유일한 화면이라, 한쪽 서비스의 홈으로 데려다 놓으면 절반은 틀린 곳에 떨어진다.
 * 그래서 사주 입구도 함께 세운다 — 예전 목록은 넷 다 종목 화면이었고, 사주로
 * 오려던 사람에게는 되돌아갈 길이 아예 없었다.
 */
const DESTINATIONS: readonly NotFoundDestination[] = [
  {
    href: "/",
    label: "서비스 선택",
    hint: "주식 · 사주",
    icon: "home",
  },
  {
    href: "/stock",
    label: "시장 현황",
    hint: "지수 · 등락 상위",
    icon: "chart",
  },
  {
    href: "/stocks",
    label: "종목 탐색",
    hint: "시가총액 · 등락률 순위",
    icon: "compass",
  },
  {
    href: "/saju",
    label: "사주",
    hint: "생년월일시로 보는 여덟 글자",
    icon: "user",
  },
];

export default async function NotFound() {
  /**
   * 여기에는 "후보" 라는 것이 없다 — 사용자가 무엇을 찾으려 했는지 모르는 화면이다
   * (그 값을 아는 쪽은 `/stocks/[symbol]` 의 `SymbolNotResolved` 다).
   *
   * 예전에는 빈 질의로 `resolveCandidates("")` 를 불러 **하드코딩된 목 종목**을
   * 띄웠다. 지금은 시가총액 상위를 쓴다 — 뜻이 있는 목록이고 실데이터이며, 조회는
   * 장중 60초/장외 900초 캐시라 404 를 훑는 크롤러가 와도 상류 호출이 늘지 않는다.
   *
   * 조합은 app 계층의 일이다 — `shared` 는 features 를 모른 채 자기 타입만 받는다.
   */
  const ranking = await getStockRanking({
    sort: "market_cap",
    board: "ALL",
    limit: 5,
  });
  const suggestions: NotFoundSuggestion[] = ranking.rows.map((row) => ({
    name: row.name,
    code: row.code,
    symbol: `${row.code}${row.board === "KOSDAQ" ? ".KQ" : ".KS"}`,
    market: row.board,
  }));

  return (
    <>
      <main className="mx-auto flex w-full max-w-shell flex-col gap-[22px] px-4 pb-28 pt-[26px] md:px-8 md:pb-[30px]">
        <Masthead
          caption="404 · 요청한 지면 없음"
          search={
            <span className="hidden md:block">
              <SearchTrigger />
            </span>
          }
          action={
            <Link
              href="/"
              className={button({ tap: false, className: "hidden md:inline-flex" })}
              style={{ fontSize: 13 }}
            >
              서비스 선택
            </Link>
          }
        />

        <NotFoundScreen
          scope="route"
          title="이 주소에는 지면이 없습니다"
          description="주소가 바뀌었거나, 종목 코드가 6자리가 아니거나, 링크가 오래된 경우입니다. 아래에서 원하는 화면으로 바로 이동할 수 있습니다."
          trace={<RequestedPath />}
          primaryAction={{ href: "/", label: "서비스 선택으로" }}
          destinations={DESTINATIONS}
          suggestions={suggestions}
          suggestionsNote="시가총액 상위"
          note="route_not_matched · app/not-found.tsx"
        />
      </main>

      {/* 모바일에서는 어느 탭도 활성이 아니다 — 404 는 탭 어디에도 속하지 않는다.
          주식 탭바를 그대로 두는 것은 종목 주소 오타가 404 의 대부분이기 때문이다.
          사주로 오려던 사람은 위 `DESTINATIONS` 의 사주 칸으로 간다. */}
      <MobileTabBar search={<SearchTrigger variant="tab" />} />

      {/* 404 는 서비스 그룹 밖이라 `(stock)`·`(saju)` 레이아웃의 푸터가 닿지 않는다.
          어느 서비스로 가려던 요청인지 모르므로 양쪽 고지를 짧게 든다. */}
      <Footer service="both" />
    </>
  );
}
