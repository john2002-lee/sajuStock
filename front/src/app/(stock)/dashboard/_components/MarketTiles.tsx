import {
  CalendarList,
  getMarketHome,
  IndexCards,
  MoverList,
  MoversTabs,
} from "@/features/stock/market";
import type { Watchlist } from "@/features/stock/watchlist";
import { SampleFrame } from "@/shared/components/feedback";
import { AiDigest } from "./AiDigest";

/**
 * 상세 **아래**에 깔리는 시장 타일들 — 지수 · 등락 상위 · 오늘의 일정 · AI 판단 현황.
 *
 * ## 왜 상세 아래인가
 *
 * 이 화면에 온 사람이 가장 먼저 볼 것은 자기가 담아 둔 종목이다. 시장 전체는 그다음
 * 이다. 위에 두면 매번 스크롤해서 지나쳐야 하고, 옆에 두면(3열) 1440px 에서 상세가
 * 좁아진다 — 상세는 차트를 품고 있어 폭이 곧 정보량이다.
 *
 * ## 왜 레이아웃이 그린다
 *
 * 종목을 바꾸면 오른쪽 상세만 교체돼야 한다. 이 타일들이 `page.tsx` 에 있으면 선택을
 * 바꿀 때마다 시장 조회가 다시 돈다 — 종목과 아무 상관 없는 데이터인데도.
 * 레이아웃은 자식 간 이동에서 다시 렌더되지 않으므로 여기 두면 한 번만 조회된다.
 *
 * `<Suspense>` 로 감싸 넘기므로 이 조회가 목록·상세를 붙잡지 않는다.
 */
export async function MarketTiles({ watchlist }: { watchlist: Watchlist }) {
  const market = await getMarketHome();

  return (
    <section className="flex flex-col gap-[22px] border-t-2 border-ink pt-5">
      <IndexCards indices={market.indices} />

      {/* 랭킹 스냅샷이 아직 비었을 때만 '예시' 틀이 씌워진다 (`SampleFrame` 의 when) */}
      <SampleFrame when={market.moversAreSample} title="등락률 상위">
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

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <CalendarList block={market.calendar} />
        <AiDigest watchlist={watchlist} />
      </div>

      <p
        className="num border-t border-line-20 pt-[9px] text-muted-45 text-10 leading-[1.7]"
      >
        {market.apiNotes.join(" · ")}
      </p>
    </section>
  );
}

/** 시장 조회가 끝나기 전. 실제 순서와 같아야 채워질 때 자리가 튀지 않는다. */
export function MarketTilesSkeleton() {
  return (
    <section className="flex animate-pulse-wf flex-col gap-[22px] border-t-2 border-ink pt-5">
      <div className="grid grid-cols-2 gap-px bg-line-16 md:grid-cols-4">
        {[0, 1, 2, 3].map((card) => (
          <div key={card} className="h-[132px] bg-paper" />
        ))}
      </div>
      <div className="grid gap-[26px] md:grid-cols-2">
        {[0, 1].map((col) => (
          <div key={col} className="h-[220px] bg-surface" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="h-[160px] bg-surface" />
        <div className="h-[160px] bg-surface" />
      </div>
    </section>
  );
}
