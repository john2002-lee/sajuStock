import Link from "next/link";
import { AdviceTrigger } from "@/features/stock/advice";
import type { MarketIndex } from "@/features/stock/market";
import { SearchTrigger } from "@/features/stock/search";
import {
  ConsoleChart,
  ConsoleFooter,
  ConsoleHeadline,
  ContentRail,
  MetricGrid,
  CONSOLE_LABEL,
  CONSOLE_LABEL_STYLE,
  type StockDetail,
} from "@/features/stock/stocks";
import { WatchToggle, type WatchItem } from "@/features/stock/watchlist";
import {
  decimal,
  deltaColorClass,
  percent as fmtPercent,
  price as fmtPrice,
} from "@/lib/format";
import { AccountMenu } from "@/shared/components/layout/AccountMenu";
import { Wordmark } from "@/shared/components/layout/Wordmark";
import { Delta } from "@/shared/ui";
import { ViewToggle } from "./ViewSwitch";

/**
 * 2b 다크 터미널 콘솔.
 *
 * 2a 와 같은 데이터를 3분할로 보여준다: 좌 워치리스트 214px / 중앙 차트 + 3열
 * 지표 그리드 / 우 뉴스·리포트 252px. 모든 라벨은 mono uppercase 다.
 *
 * app/ 에 둔 이유는 stocks·market·watchlist·advice 네 feature 를 한 화면에서
 * 조합하기 때문이다 — feature 끼리는 직접 import 할 수 없다.
 *
 * 그래서 이 파일에는 **여러 feature 를 엮는 조각만** 남는다. stocks 데이터만
 * 보는 조각(헤드라인·차트·지표 그리드·콘텐츠 레일·푸터)은 `features/stocks` 안으로
 * 옮겼다 — 이 파일이 397줄까지 자라 있던 이유가 그쪽이었다.
 */

export function ConsoleView({
  detail,
  indices,
  watchlist,
  universeCount,
  universeSource,
}: {
  detail: StockDetail;
  indices: MarketIndex[];
  watchlist: WatchItem[];
  universeCount: number;
  universeSource: string;
}) {
  return (
    /* 2b 는 다크 터미널 팔레트를 전제로 설계된 화면이다. 그런데 테마는 쿠키로만
       정해져서, `?view=console` 링크로 들어온 첫 방문자는 콘솔 레이아웃을 라이트
       토큰으로 본다 — ViewSwitch 의 useEffect 가 붙기 전까지 한 프레임 동안.
       서브트리에 data-theme 을 못 박으면 서버 첫 HTML 부터 올바른 색이 나온다.

       콘솔 화면에는 테마 토글이 없으므로(상단 바는 검색·뷰전환·AI 뿐)
       '콘솔 + 라이트' 는 UI 로 도달할 수 없는 상태다 — 고정해도 사용자 선택을
       덮지 않는다.

       하단 AI 바까지 함께 감싼다: 밖에 두면 bg-accent 위 text-paper 가 라이트
       토큰(크림)으로 잡혀 대비가 무너진다. fixed 요소는 transform 없는 평범한
       조상에 영향받지 않으므로 감싸도 위치는 그대로다. */
    <div data-theme="terminal">
      {/* pb: 모바일 하단 고정 AI 버튼 자리 */}
      <div className="flex min-h-screen flex-col bg-paper pb-[76px] text-ink md:pb-0">
        {/* 상단 바에는 **전역 컨트롤만** 둔다 — 지수·검색·계정. 종목 액션(담기·뷰·AI)은
            헤드라인 아래 액션 줄로 내렸다 (2a EditorialView 와 같은 판단). */}
        <ConsoleTopBar indices={indices} />

        <div className="flex flex-1 flex-col md:flex-row">
          <WatchRail
            items={watchlist}
            activeCode={detail.ref.code}
            universeCount={universeCount}
            universeSource={universeSource}
          />

          {/* order-first: 세로 스택에서 워치리스트가 먼저 오면 정작 보러 온 종목이
              한참 아래로 밀린다. 데스크탑 3분할에서는 DOM 순서 그대로 가운데다. */}
          <main className="order-first flex min-w-0 flex-1 flex-col border-line-14 md:order-none md:border-x">
            <ConsoleHeadline stock={detail.ref} quote={detail.quote} />

            {/* 이 종목의 액션 줄. 담김 여부를 따로 받지 않는다 — 이 뷰는 이미 목록
                전체를 들고 있고(좌측 레일이 그린다), 같은 사실을 두 경로로 받으면
                한 화면 안에서 어긋난다. */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-b border-line-14 px-5 pb-3">
              <WatchToggle
                symbol={detail.ref.symbol}
                code={detail.ref.code}
                watched={watchlist.some((item) => item.code === detail.ref.code)}
                variant="console"
              />
              <ViewToggle />
              <span className="hidden md:block">
                <AdviceTrigger variant="console" />
              </span>
            </div>

            <ConsoleChart candles={detail.candles} currency={detail.quote.currency} />
            <MetricGrid metrics={detail.metrics} />
            <ConsoleFooter notes={detail.apiNotes} />
          </main>

          <ContentRail
            news={detail.news}
            reports={detail.reports}
            now={detail.now}
          />
        </div>
      </div>

      {/* 2b 의 AI 레일도 모바일에서는 같은 전체화면 시트로 뜬다 (AdviceDrawer).
          톤은 앰버 — 이 화면의 액션 색이고, bg-ink 는 다크에서 크림색이 된다. */}
      <AdviceTrigger variant="bar" tone="accent" />
    </div>
  );
}

/**
 * 콘솔 상단 바 — **전역 컨트롤만.** 지수 · 검색 · 계정.
 *
 * 종목 액션(담기·뷰 전환·AI)은 헤드라인 아래 액션 줄에 있다. 2a 와 같은 이유다:
 * 이 줄에 여섯이 서면 좁은 폭에서 계정 하나가 다음 줄로 떨어져 바가 계단이 된다.
 * 성격이 다른 것(어느 화면에나 있는 것 / 이 종목에만 뜻이 있는 것)을 섞지 않는다.
 *
 * market(지수)를 엮으므로 app 계층에 남는다.
 */
function ConsoleTopBar({ indices }: { indices: MarketIndex[] }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-14 px-[18px] py-3">
      {/* 좌상단 홈 링크 — 다른 화면의 마스트헤드와 같은 자리다.
          색은 text-ink 라 반전 배경에서도 그대로 읽힌다. */}
      <Wordmark variant="compact" href="/stock" />
      <span
        className="hidden font-mono font-semibold text-muted-60 md:inline text-11 tracking-[0.2em]"
      >
        QUANT·DESK
      </span>

      <span className="flex flex-1 flex-wrap gap-4">
        {indices.map((index) => (
          <span key={index.name} className="num flex gap-[7px] text-11">
            <span className="text-muted-50">{index.name}</span>
            <span>{decimal(index.value, index.digits)}</span>
            <span className={deltaColorClass(index.changePercent)}>
              {fmtPercent(index.changePercent)}
            </span>
          </span>
        ))}
      </span>

      {/* 계정은 좁은 화면에서도 남긴다 — 이 화면에는 하단 탭바가 없어 여기서
          감추면 콘솔 뷰에서는 로그인·로그아웃에 도달할 방법이 아예 없다.
          검색은 ⌘K 로 열리므로 md 부터만 보인다. */}
      <span className="flex flex-none items-center gap-2">
        <span className="hidden md:block">
          <SearchTrigger />
        </span>
        <AccountMenu />
      </span>
    </header>
  );
}

/** watchlist 데이터를 받으므로 app 계층에 남는다 */
function WatchRail({
  items,
  activeCode,
  universeCount,
  universeSource,
}: {
  items: WatchItem[];
  activeCode: string;
  universeCount: number;
  universeSource: string;
}) {
  return (
    <aside className="flex w-full flex-col md:w-[214px]">
      <h2 className={`${CONSOLE_LABEL} px-[14px] py-3`} style={CONSOLE_LABEL_STYLE}>
        watchlist
      </h2>
      {items.map((item) => {
        const active = item.code === activeCode;
        return (
          <Link
            key={item.code}
            href={`/stocks/${item.code}?view=console`}
            aria-current={active ? "page" : undefined}
            // 활성 행은 앰버 틴트다. bg-surface 는 패널과 같은 차가운 남색이라
            // 좌측 앰버 보더만 남고 '선택됨'이 거의 안 읽혔다.
            className={`flex min-h-[var(--tap)] items-center justify-between gap-2 border-b border-line-14 px-[14px] py-2.5 hover:bg-surface-hover md:items-baseline ${
              active ? "border-l-2 border-l-accent bg-highlight" : ""
            }`}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-13">
                {item.name}
              </span>
              <span className="num truncate text-muted-50 text-10">
                {item.code} · {item.nameEn}
              </span>
            </span>
            <span className="num flex flex-none flex-col items-end gap-0.5">
              <span className="font-medium text-13">
                {fmtPrice(item.price)}
              </span>
              <Delta changePercent={item.changePercent} arrow={false} size={11} />
            </span>
          </Link>
        );
      })}

      {/* UNIVERSE 는 워치리스트 레일 하단이 제자리다 (디자인 2b) — 이 목록이
          어디서 왔는지를 설명하는 각주라 목록 옆에 붙어야 뜻이 통한다.
          mt-auto 로 레일 바닥에 밀어붙인다. */}
      <div className="mt-auto flex flex-col gap-1 border-t border-line-14 px-[14px] py-3">
        <span className={CONSOLE_LABEL} style={CONSOLE_LABEL_STYLE}>
          universe
        </span>
        <span className="num text-muted-60 text-11">
          {universeCount.toLocaleString("ko-KR")} 종목 동기화
        </span>
        <span className="num text-ok text-10">
          {universeSource} 목록 최신
        </span>
      </div>
    </aside>
  );
}
