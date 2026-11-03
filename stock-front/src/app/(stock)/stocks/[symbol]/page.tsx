import { AdviceDrawer, AdviceProvider } from "@/features/stock/advice";
import { getMarketOverview } from "@/features/stock/market";
import { SearchTrigger } from "@/features/stock/search";
import { getStockDetail } from "@/features/stock/stocks";
import { getWatchlist } from "@/features/stock/watchlist/server";
import { API_BASE_URL } from "@/lib/config/env";
import { isResolvableSymbol } from "@/lib/stocks/symbol";
import { loginHref } from "@/lib/auth/next-path";
import { canUseAdvice } from "@/app/_data/advice";
import { readOwnerKey } from "@/app/_data/owner";
import { Masthead } from "@/shared/components/layout/Masthead";
import type { Metadata } from "next";
import { BackendUnreachable } from "./_components/BackendUnreachable";
import { ConsoleView } from "./_components/ConsoleView";
import { EditorialView } from "./_components/EditorialView";
import { StockDetailUnavailable } from "./_components/StockDetailUnavailable";
import { SymbolNotResolved } from "./_components/SymbolNotResolved";
import { ViewSwitch } from "./_components/ViewSwitch";

/**
 * 입력한 문자열을 화면에 보여줄 형태로.
 *
 * `decodeURIComponent` 가 **던질 수 있다.** `/stocks/%` 처럼 이스케이프가 깨진 값이
 * 오면 `URIError` 가 나고, 그러면 원인과 무관한 에러 화면이 후보 고르기 화면을
 * 대신한다. 실패하면 원문을 그대로 쓴다 — 못 읽은 값을 보여주는 것이 화면을
 * 깨뜨리는 것보다 낫다.
 */
function readable(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * 종목일 수 없는 주소는 **색인하지 않는다.**
 *
 * 크롤러가 `/stocks/<아무문자열>` 을 따라오는 것 자체가 상류 호출 증폭이다. 응답이
 * 404 가 아니라 200(후보 고르기)이라, 고지하지 않으면 검색엔진은 그것을 유효한
 * 페이지로 보고 계속 긁는다. 조회는 하지 않고 **모양만** 보므로 비용이 없다.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  if (isResolvableSymbol(symbol)) return {};

  return { robots: { index: false, follow: false } };
}

export default async function StockDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ ai?: string; fallback?: string; view?: string }>;
}) {
  const [{ symbol }, query] = await Promise.all([params, searchParams]);

  // 여러 도메인을 페이지에서 조합한다 — features 끼리는 직접 import 하지 않는다.
  // 이 fetch 들은 뷰(2a/2b)와 무관하게 한 번만 일어난다: 뷰 전환은 클라이언트에서
  // 표시만 바꾸므로 서버로 다시 오지 않는다.
  //
  // 관심종목은 소유자별 데이터라 쿠키의 신원이 필요하다. proxy.ts 가 렌더보다
  // 먼저 굽고, 여기서는 읽어서 넘기기만 한다 (app/dashboard/layout.tsx 와 같은 형태).
  // **`readOwnerKey()` 를 앞에서 따로 await 하지 않는다** — 그것은 세션을 푸는
  // 일이라 시세·시장 조회와 아무 관계가 없는데, 앞에 세우면 그 둘이 세션 해독이
  // 끝날 때까지 시작조차 못 한다. 관심종목 체인만 그 뒤에 잇는다.
  //
  // `canUseAdvice()` 도 같은 묶음에 넣는다. 세션을 보지만 `currentUser()` 가 요청
  // 단위로 캐시하므로 관심종목 체인과 해독을 나눠 갖는다 — 앞에 세워 직렬화할
  // 이유가 없다.
  const [result, market, watchlist, adviceAllowed] = await Promise.all([
    getStockDetail(symbol),
    getMarketOverview("home"),
    readOwnerKey().then(getWatchlist),
    canUseAdvice(),
  ]);

  // 정규화 실패는 404 가 아니라 '후보 고르기'로 받는다 (와이어프레임 1d).
  // 입력한 문자열을 화면에 남겨야 무엇을 못 찾았는지 말할 수 있다.
  if (result.status === "not-found") {
    return (
      <main className="mx-auto flex w-full max-w-shell flex-col gap-5 px-4 pb-[30px] pt-[26px] md:px-8">
        <Masthead
          home="/stock"
          caption="종목 코드 정규화 실패"
          search={<SearchTrigger />}
        />
        <SymbolNotResolved query={readable(symbol)} />
      </main>
    );
  }

  // 백엔드가 안 떠 있거나 주소가 틀린 경우. 상류 지연과 문구가 달라야 한다 —
  // 여기서는 재시도가 소용없고 서버를 켜는 것이 조치다.
  if (result.status === "offline") {
    return (
      <main className="mx-auto flex w-full max-w-shell flex-col gap-5 px-4 pb-[30px] pt-[26px] md:px-8">
        <Masthead home="/stock" caption="백엔드 연결 실패" search={<SearchTrigger />} />
        <BackendUnreachable baseUrl={API_BASE_URL} />
      </main>
    );
  }

  // 상류 지연. 예외를 던지지 않으므로 렌더는 살아 있고, 이미 있는 에러 화면을
  // 인라인으로 보여준다 — 빈 화면이나 크래시가 아니다.
  if (result.status === "timeout") {
    return (
      <main className="mx-auto flex w-full max-w-shell flex-col gap-5 px-4 pb-[30px] pt-[26px] md:px-8">
        <Masthead home="/stock" caption="시세 응답 지연" search={<SearchTrigger />} />
        <StockDetailUnavailable symbol={readable(symbol)} />
      </main>
    );
  }

  const detail = result.detail;

  // 홈 카테고리는 8종이 됐다(반도체·나스닥100·유가·금이 붙었다). 292px 레일에 8행은
  // 많아 **앞 넷만** 쓴다 — 해설이 붙은 뒤 넷은 홈에서 카드로 읽는 것이 제자리다.
  const railIndices = market.indices.slice(0, 4);

  return (
    <AdviceProvider
      initialOpen={query.ai === "1"}
      fallback={query.fallback === "1"}
      canUse={adviceAllowed}
      // 로그인 뒤 **여기로 돌아와 드로어가 열린다** (`?ai=1`). 로그인 화면이
      // 대시보드로만 보내면, AI 를 누른 사람이 종목을 다시 찾아 들어와야 한다.
      //
      // 주소는 정규화된 코드로 만든다 — 이 화면은 여러 표기(`삼성전자`·`005930.KS`)
      // 로 도착할 수 있고, 돌아올 자리는 그중 한 모양이면 된다. 2b(콘솔)에서 눌렀다면
      // 그 뷰도 들고 간다: 돌아왔더니 다른 레이아웃인 것은 길을 잃은 것처럼 읽힌다.
      loginHref={loginHref(
        `/stocks/${detail.ref.code}?ai=1${query.view === "console" ? "&view=console" : ""}`,
      )}
    >
      <ViewSwitch
        initialView={query.view === "console" ? "console" : "editorial"}
        editorial={
          <EditorialView
            detail={detail}
            indices={railIndices}
            watched={watchlist.items.some(
              (item) => item.code === detail.ref.code,
            )}
          />
        }
        console={
          <ConsoleView
            detail={detail}
            indices={railIndices}
            watchlist={watchlist.items}
            universeCount={watchlist.totalCount}
            universeSource="KRX"
          />
        }
      />

      {/* 드로어는 두 뷰가 공유한다 — 하나만 마운트돼야 SSE 스트림도 하나다. */}
      <AdviceDrawer
        symbol={detail.ref.symbol}
        /* 기록에 필요한 값. `Decision` 에는 코드·이름·가격이 없다. */
        stock={{
          code: detail.ref.code,
          symbol: detail.ref.symbol,
          name: detail.ref.name,
          price: detail.quote.price,
        }}
      />
    </AdviceProvider>
  );
}
