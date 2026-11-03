import Link from "next/link";
import { AdviceDrawer, AdviceProvider, AdviceTrigger } from "@/features/stock/advice";
import { getStockDetail, StockDetailBody } from "@/features/stock/stocks";
import { WatchToggle } from "@/features/stock/watchlist";
import { loginHref } from "@/lib/auth/next-path";
import { canUseAdvice } from "@/app/_data/advice";
import { loadWatchlist } from "@/app/_data/watchlist";

/**
 * 대시보드 오른쪽 칸 — 선택된 종목 하나의 상세.
 *
 * `/dashboard`(nav 맨 위 종목)와 `/dashboard/[code]`(고른 종목)가 같은 것을 그리므로
 * 두 페이지가 이 컴포넌트만 호출한다.
 *
 * ## 조판을 복제하지 않는다
 *
 * 본문은 `/stocks/[symbol]` 과 **같은** [`StockDetailBody`](@/features/stock/stocks) 다.
 * 여기서는 `variant="flow"` 로 우측 레일을 접는다 — 이 칸은 ~840px 이라 292px
 * 레일을 세우면 차트에 530px 밖에 남지 않는다. 레일에 있던 지표·밸류에이션은
 * 차트 아래 가로 두 칸으로 내려온다.
 *
 * ## AI 드로어가 여기 있는 이유
 *
 * 레이아웃(목록)이 아니라 이 컴포넌트가 종목을 안다. 종목을 바꾸면 이 서브트리가
 * 통째로 다시 마운트되어 **이전 종목의 SSE 스트림과 결과가 남지 않는다.** 목록의
 * 일괄 분석(`useBulkAdvice`)은 레이아웃의 상태라 이 교체에 영향을 받지 않는다.
 */
export async function DashboardDetail({
  code,
  adviceOpen = false,
}: {
  code: string;
  /** ?ai=1 로 들어온 경우 드로어를 열고 시작한다 */
  adviceOpen?: boolean;
}) {
  // `canUseAdvice()` 를 여기서도 부른다. 이 칸은 로그인 게이트를 지난 레이아웃
  // 안이라 `true` 를 박아도 지금은 맞지만, 그러면 그 게이트가 바뀌는 날 이 파일이
  // 조용히 거짓말을 한다 — 진입점의 모양은 규칙 하나만 보게 둔다.
  const [result, watchlist, adviceAllowed] = await Promise.all([
    getStockDetail(code),
    loadWatchlist(),
    canUseAdvice(),
  ]);

  if (result.status !== "ok") {
    return <DetailUnavailable code={code} status={result.status} />;
  }

  const detail = result.detail;

  return (
    <AdviceProvider
      initialOpen={adviceOpen}
      fallback={false}
      canUse={adviceAllowed}
      // 이 칸에서는 쓰이지 않는다 (`canUse` 가 항상 true 다) — 그래도 맞는 값을
      // 넘긴다. 위 `canUseAdvice()` 주석과 같은 이유다.
      loginHref={loginHref(`/dashboard/${code}?ai=1`)}
    >
      <StockDetailBody
        variant="flow"
        detail={detail}
        actions={
          <>
            {/* 이 칸에 없는 것(콘솔 뷰·리포트 요약·시장 지수)으로 가는 문.
                대시보드는 훑고 고르는 자리이고, 다 펼쳐 보는 자리는 상세 화면이다. */}
            <Link
              href={`/stocks/${detail.ref.code}`}
              className="border border-line-30 px-3 py-1.5 font-medium hover:bg-surface-hover text-13"
            >
              전체 상세
            </Link>
            <WatchToggle
              symbol={detail.ref.symbol}
              code={detail.ref.code}
              watched={watchlist.items.some((item) => item.code === detail.ref.code)}
            />
            <AdviceTrigger />
          </>
        }
      />
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

/**
 * 상세를 못 그리는 세 경우. `/stocks/[symbol]` 은 각각을 전체 화면으로 받지만
 * 여기서는 **칸 하나만** 비운다 — nav 는 그대로 있어야 다른 종목으로 옮겨 갈 수 있다.
 */
function DetailUnavailable({
  code,
  status,
}: {
  code: string;
  status: "not-found" | "timeout" | "offline";
}) {
  const message = {
    "not-found": "이 종목 코드를 해석하지 못했습니다.",
    timeout: "시세 응답이 늦습니다. 잠시 뒤 다시 시도해 주세요.",
    offline: "백엔드에 연결하지 못했습니다.",
  }[status];

  return (
    <div className="flex flex-col items-center gap-2.5 border border-dashed border-line-25 px-6 py-16">
      <p
        className="font-mono uppercase tracking-label text-muted-35 text-11"
      >
        {status}
      </p>
      <p className="text-muted-70 text-13">
        {message}
      </p>
      <p className="num text-muted-45 text-12">
        {code}
      </p>
    </div>
  );
}
