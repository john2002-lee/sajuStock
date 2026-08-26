import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth";
import { SearchTrigger } from "@/features/stock/search";
import { USE_MOCK } from "@/lib/config/env";
import { marketCaptionSuffix } from "@/lib/config/marketHours";
import { masthead } from "@/lib/format";
import { AccountMenu } from "@/shared/components/layout/AccountMenu";
import { MobileTabBar } from "@/shared/components/layout/MobileTabBar";
import { Masthead } from "@/shared/components/layout/Masthead";
import { loadWatchlist } from "@/app/_data/watchlist";
import { BoardSkeleton } from "./_components/BoardSkeleton";
import { DashboardBoard } from "./_components/DashboardBoard";
import { MarketTiles, MarketTilesSkeleton } from "./_components/MarketTiles";

/**
 * 대시보드 껍데기 — **앱 셸**이다.
 *
 * ```
 * ┌──────────────┬──────────────────────────────────────────┐
 * │ 관심 종목     │  종목 원장.          검색 · 테마 · 계정   │  Masthead
 * │ n종목·n그룹   │  기준 시각 · 시세 지연                    │   제호 위, 캡션 아래
 * │ [편집][추가]  │ ─────────────────────────────────────────│
 * │ [AI 분석]     │  선택된 종목 상세  (children)             │
 * │ 전체│코어│…   │                                          │
 * │ ──────────── │  MarketTiles                             │
 * │ ▸ 삼성전자    │   지수 · 등락 · 일정 · AI 현황            │
 * │ ● SK하이닉스  │                                          │
 * │ ⋮ (스크롤)    │                                          │
 * └──────────────┴──────────────────────────────────────────┘
 *   fixed · 320px · 100vh          md:pl-[320px]
 * ```
 *
 * ## 골격은 여기만 다르다 — 제호는 같다
 *
 * 나머지 화면(홈·종목 상세·탐색)은 `Masthead` + 중앙 정렬 `max-w-shell` 이다. 이 화면은
 * 사이드바가 **뷰포트 왼쪽 끝에 붙어야** 해서 그 컨테이너 밖으로 나갔다 — 거기까지가
 * 차이다.
 *
 * **제호는 다른 화면과 같은 자리, 같은 컴포넌트다.** 상단 바가 `Masthead` 이고 제호가
 * 위, 기준 시각이 그 아래다(`Wordmark` 가 `caption` 을 품는다). 한때 제호를 사이드바
 * 머리에 두었는데 320px 에 24px 제호가 안 들어가 오른쪽 본문 위로 삐져나갔고, 무엇보다
 * 서비스명이 화면마다 다른 자리에 있으면 안 된다. **사이드바는 관심 종목만 든다.**
 *
 * ## 왜 레이아웃이 사이드바와 타일을 갖는가
 *
 * 종목을 고르면 **본문만** 바뀌어야 한다. 레이아웃은 자식 간 이동에서 다시 렌더되지
 * 않으므로(Next 의 partial rendering), 여기 둔 것은 조회도 클라이언트 상태(그룹·정렬·
 * 선택·돌고 있는 일괄 AI)도 그대로 살아 있다. 반대로 `page.tsx` 에 두면 클릭마다
 * 관심종목과 시장을 다시 조회한다 — 종목과 아무 상관 없는 데이터인데도.
 *
 * ## 조회 둘을 각자 `Suspense` 로 내린다
 *
 * 이 함수가 직접 `await` 하면 화면 전체가 막히고, 그때 대신 나오는 것은 루트
 * `loading.tsx`(**홈 골격**)라 화면이 틀린다. 목록과 시장은 서로를 기다릴 이유도
 * 없어서 경계를 따로 둔다 — 목록이 먼저 오면 사이드바부터 뜬다.
 *
 * ## 로그인을 요구하는 유일한 화면이다
 *
 * 관심종목을 여는 화면이 여기 하나로 합쳐졌다(`/watchlist` 는 여기로 보낸다).
 * 신원이 없으면 `/login` 으로 보낸다 — 앞단의 [proxy.ts](../../proxy.ts) 가 세션
 * 쿠키 없는 요청을 307 로 먼저 끊고, 여기는 쿠키가 유효하지 않은 경우를 받는 문이다.
 *
 * ## `revalidate = 0` (`force-dynamic` 이 아니다)
 *
 * 이 화면은 세션을 읽으므로 어차피 요청마다 동적으로 렌더된다. `force-dynamic` 은
 * 라우트의 모든 fetch를 `no-store` 로 강제해 시장 데이터의 `force-cache`+
 * revalidate(장중 60초/장외 900초, `lib/config/marketHours.ts`)까지 무력화한다.
 * `revalidate = 0` 은 동적 렌더는 강제하되 그 캐시는 그대로 둔다(Next 16
 * `caching-without-cache-components.md` 문서).
 */
export const revalidate = 0;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const caption = USE_MOCK
    ? `${masthead(new Date().toISOString())} · ${marketCaptionSuffix()} · 예시 데이터`
    : `${masthead(new Date().toISOString())} · ${marketCaptionSuffix()}`;

  return (
    <>
      <Suspense fallback={<BoardSkeleton />}>
        {/* 상세(children)와 타일은 **이미 만들어진 엘리먼트**로 넘어간다. 여기서
            렌더되지 않으므로 각자의 Suspense 경계를 그대로 데리고 간다. */}
        <Board detail={children} caption={caption} />
      </Suspense>

      <MobileTabBar current="dashboard" search={<SearchTrigger variant="tab" />} />
    </>
  );
}

/** 목록 조회를 레이아웃 밖으로 내리기 위한 얇은 서버 컴포넌트 */
async function Board({
  detail,
  caption,
}: {
  detail: React.ReactNode;
  caption: string;
}) {
  const watchlist = await loadWatchlist();

  return (
    <DashboardBoard
      initial={watchlist}
      detail={detail}
      /**
       * 상단 바는 다른 화면과 **같은 `Masthead`** 다 — 제호가 위, 기준 시각이 그
       * 아래다(`Wordmark` 가 `caption` 을 품는 구조).
       *
       * 한때 사이드바 머리에 제호를 두고 이 자리는 캡션만 갖게 했는데, 서비스명이
       * 화면마다 다른 자리에 있으면 안 된다. 사이드바는 관심 종목만 든다.
       */
      topBar={
        <Masthead
          home="/stock"
          caption={caption}
          search={
            <span className="hidden md:block">
              <SearchTrigger />
            </span>
          }
          action={<AccountMenu />}
        />
      }
      tiles={
        <Suspense fallback={<MarketTilesSkeleton />}>
          <MarketTiles watchlist={watchlist} />
        </Suspense>
      }
    />
  );
}
