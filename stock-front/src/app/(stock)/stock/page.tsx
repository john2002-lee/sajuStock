import { button } from "@/shared/ui";
import { currentUser } from "@/auth";
import { adviceOwnerKey } from "@/app/_data/advice";
import { VerdictHistory } from "@/features/stock/advice";
import { getVerdictHistory } from "@/features/stock/advice/server";
import {
  CalendarList,
  getMarketHome,
  IndexCards,
  MoverList,
  MoversTabs,
  TopByCap,
} from "@/features/stock/market";
import { SearchTrigger } from "@/features/stock/search";
import { SampleFrame } from "@/shared/components/feedback";
import { marketCaptionSuffix } from "@/lib/config/marketHours";
import { masthead } from "@/lib/format";
import { AccountMenu } from "@/shared/components/layout/AccountMenu";
import { Masthead } from "@/shared/components/layout/Masthead";
import { MobileTabBar } from "@/shared/components/layout/MobileTabBar";
import Link from "next/link";
import { FindBand } from "./_components/FindBand";
import { SajuBand } from "./_components/SajuBand";
import { RecentStocks } from "./_components/RecentStocks";

/**
 * 시장 현황 — **주식 서비스의 홈**이다.
 *
 * 이 화면은 `/` 에 있었다. 그 자리는 이제 서비스 선택([`app/page.tsx`](../../page.tsx))이
 * 갖는다 — 사주로 들어온 사람에게 첫 화면이 코스피 지수인 것은 다른 제품을 연
 * 것과 같기 때문이다. 주소가 `/stock` 으로 내려오면서 바뀐 것은 셋뿐이다:
 * 제호가 `/stock` 으로 돌아오고(`home`), 하단 탭바의 시장 칸이
 * `current="market"` 이 되고, 푸터는 서비스 레이아웃이 든다.
 *
 * 폴더가 `app/(stock)/stock/` 인데 URL 에 `stock` 이 한 번만 나오는 것은 `(stock)`
 * 이 라우트 그룹이어서다 — 괄호 폴더는 주소에 나타나지 않는다.
 */

/**
 * 요청 시 렌더한다. `revalidate = 0` 은 라우트를 항상 동적 렌더로 강제하되
 * `cache: "force-cache"` 로 명시한 fetch(`apiGetCached`)는 그대로 캐시된다 —
 * 실제 백엔드 호출 빈도는 fetch 단위의 revalidate(장중 60초/장외 900초,
 * `lib/config/marketHours.ts`)가 정한다.
 *
 * `force-dynamic` 은 쓰지 않는다 — 라우트의 모든 fetch를 `no-store` 로 강제해
 * `force-cache` 로 받은 fetch까지 무력화한다(Next 16
 * `caching-without-cache-components.md` 문서).
 *
 * 정적 프리렌더로 두면 `next build` 가 빌드 머신에서 백엔드에 접속해야 한다 —
 * CI·도커 빌드에서 백엔드가 없으면 빌드 자체가 실패하고, 성공하더라도 빌드
 * 시점의 시세가 이미지에 구워진다.
 */
export const revalidate = 0;

export default async function MarketHomePage() {
  const [market, user] = await Promise.all([getMarketHome(), currentUser()]);

  // 판단 기록은 **계정이 있을 때만** 있다 (AI 판단이 이미 계정 필수다).
  // `Promise.all` 앞에 세우지 않는 이유: 시장 조회와 아무 관계가 없는데 앞에
  // 두면 세션 해독이 끝날 때까지 그쪽이 시작조차 못 한다.
  const ownerKey = await adviceOwnerKey();
  const verdicts = ownerKey ? await getVerdictHistory(ownerKey) : [];
  const signedIn = Boolean(user);

  const caption = `${masthead(market.asOf)} · ${marketCaptionSuffix()}`;

  return (
    <>
      <main className="mx-auto flex w-full max-w-shell flex-col gap-[22px] px-4 pb-28 pt-[26px] md:px-8 md:pb-[30px]">
        {/* 홈만 마스트헤드 검색을 비운다 — 바로 아래 히어로가 같은 일을 더 크게 한다.
            둘을 다 두면 같은 동작이 12px 간격으로 두 번 나와 어느 쪽이 본체인지 흐려진다. */}
        <Masthead
          home="/stock"
          caption={caption}
          action={
            <>
              {/* 담아 둔 종목을 여는 곳은 대시보드 하나다(`/watchlist` 는 그쪽으로
                  합쳐졌다). 로그인해야 열리므로 안 한 사람에게는 두지 않는다 —
                  누르면 로그인으로 튕기는 미끼가 된다. 로그인 자체는 바로 옆
                  AccountMenu 가 안내한다. */}
              {signedIn ? (
                <Link
                  href="/dashboard"
                  className={button({ tap: false, className: "hidden md:inline-flex" })}
                >
                  대시보드
                </Link>
              ) : null}
              {/* 로그인·로그아웃은 화면마다 다른 자리에 있으면 안 된다. 예전에는
                  관심종목 화면에만 있어서 다른 곳에서는 로그인할 방법이 없었다. */}
              <AccountMenu />
            </>
          }
        />

        {/* 본문 첫 블록 — 홈에서 가장 많이 하는 일이 "종목을 고른다" 이므로
            지수보다 먼저 온다. 지수는 읽는 정보고 이 밴드는 하는 일이다. */}
        <FindBand />

        {/* **이 앱에만 있는 것을 위로 올린다.**
            홈이 주는 나머지(지수·등락상위·일정)는 전부 다른 데도 있다. AI 판단은
            이 앱에만 있는데 종목 상세에 들어가야만 만났다 — 내가 받은 판단을
            여기 올리면 첫 화면이 "시장이 어떤가" 에서 "내가 무엇을 물어봤나" 로
            바뀐다.

            **기록이 없으면 아무것도 그리지 않는다.** 한때 이 자리에 "AI 셋이 각자
            근거를 댑니다" 안내 카드를 뒀다가 걷어냈다 — 홈에서 가장 많이 하는 일은
            종목을 고르는 것이고, 그 위의 검색 히어로가 이미 그 동작을 준다. 설명
            블록이 그 사이에 끼면 첫 화면이 제품 소개가 된다. */}
        <VerdictHistory records={verdicts} />

        {/* 사주 서비스 입구. 종목 진입(FindBand) **다음**이다 — 여기는 주식
            서비스의 홈이고 처음 온 사람도 종목부터 보고 싶어 한다. 앞에 두면
            종목 하나 보려는 사람에게 다른 서비스를 먼저 들이미는 화면이 된다. */}
        <SajuBand />

        {/* 지수 8카드 — 앞 넷은 "시장이 지금 어디에 있나", 뒤 넷(반도체·나스닥100·
            유가·금)은 **왜 그렇게 움직였나**를 설명하는 축이다. 뒤 넷에만 한 줄
            해설이 붙는다 (`getMarketOverview` 의 CARD_NOTES). */}
        <IndexCards indices={market.indices} />

        {/* 담아 둔 종목 이전 단계 — 방금 보던 종목으로 돌아가는 길. 요청을 만들지
            않는다(localStorage). 담은 것이 없으면 섹션째 안 그린다. */}
        <RecentStocks />

        {/* 등락률(오늘 얼마나 움직였나)과 겹치지 않는 **규모 축**. 위 진입 밴드의
            "큰 회사부터" 타일이 링크만 주던 자리를 결과로 채운다. */}
        <TopByCap rows={market.topByCap} scope={market.topByCapScope} />

        {/* 전체 폭을 쓴다. 예전에는 우측 328px 레일(업종 등락·오늘의 뉴스)이 있어
            `xl:grid-cols-[1fr_328px]` 였는데, 그 둘을 걷어낸 뒤로는 레일에 API 메모
            한 줄만 남아 1280px 이상에서 큰 여백이 생겼다. 2열을 없애니 두 목록이
            각각 넓어져 종목명이 덜 잘린다. */}
        <SampleFrame when={market.moversAreSample} title="등락률 상위">
          {/* 데스크탑은 2열, 모바일은 탭 전환 */}
          <div className="hidden grid-cols-2 gap-[26px] md:grid">
            <MoverList
              title="상승률 상위"
              scope={market.moversScope}
              items={market.gainers}
            />
            <MoverList
              title="하락률 상위"
              scope={market.moversScope}
              items={market.losers}
            />
          </div>
          <div className="md:hidden">
            <MoversTabs gainers={market.gainers} losers={market.losers} />
          </div>
        </SampleFrame>

        {/* 등락 상위 **다음**이다. 등락률은 "지금 무슨 일이 일어났나"이고 일정은
            "곧 무슨 일이 일어나나"라, 읽는 순서가 그렇다. `SampleFrame` 으로 감싸지 않는
            이유는 이 블록에 예시 데이터가 없기 때문이다 — 없으면 없다고 말한다. */}
        <CalendarList block={market.calendar} />

        {/* 화면이 소비한 백엔드 메서드. 레일이 사라져 맨 아래 전체 폭 각주로 내렸다 */}
        <p
          className="num border-t border-line-20 pt-[9px] text-muted-45 text-10 leading-[1.7]"
        >
          {market.apiNotes.join(" · ")}
        </p>
      </main>

      <MobileTabBar current="market" search={<SearchTrigger variant="tab" />} />
    </>
  );
}
