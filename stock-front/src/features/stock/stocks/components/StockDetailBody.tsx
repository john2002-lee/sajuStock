import { ApiNote } from "./ApiNote";
import { ChartSection } from "./ChartSection";
import { DetailTabs } from "./DetailTabs";
import { FinancialsPanel } from "./FinancialsPanel";
import { MetricsRail } from "./MetricsRail";
import { NewsList } from "./NewsList";
import { ReportDigest } from "./ReportDigest";
import { ReportList } from "./ReportList";
import { StockHeadline } from "./StockHeadline";
import { ValuationRail } from "./ValuationRail";
import type { StockDetail } from "../model/types";

/**
 * 종목 상세의 **본문**. 제호(Masthead)를 포함하지 않는다.
 *
 * ## 왜 갈라냈는가
 *
 * 두 화면이 같은 상세를 그린다 — `/stocks/[symbol]`(전체 화면)과 관심종목 작업대의
 * 오른쪽 칸이다. `EditorialView` 는 자체 `Masthead` 를 들고 있어 작업대에 끼울 수
 * 없었고, 조판을 복제하면 "목록에서 본 값과 상세에서 본 값이 다르다"가 시간 문제로
 * 생긴다. 그래서 **제호 아래 전부**를 여기로 내렸다.
 *
 * ## 다른 feature 의 조각은 슬롯으로 받는다
 *
 * 담기(watchlist)·AI 판단(advice)·시장 지수(market)는 전부 다른 feature 다.
 * feature 끼리 직접 import 하지 않는다는 규칙(CONVENTIONS) 때문에, 여기서는
 * `actions`·`railExtra` 라는 **자리만** 두고 무엇을 넣을지는 조립하는 app/ 이 정한다.
 *
 * ## variant
 *
 * - `rail` — 본문 + 292px 우측 레일. 1180px 전체 폭을 쓰는 `/stocks/[symbol]` 용.
 * - `flow` — 한 열. 작업대의 오른쪽 칸(~840px)은 레일을 세울 폭이 없다. 레일에
 *   있던 지표·밸류에이션은 **차트 아래 가로 두 칸**으로 내려온다. 시장 지수·리포트
 *   요약(`railExtra`·`ReportDigest`)은 넣지 않는다 — 좁은 칸에서 우선순위가 낮고,
 *   리포트는 바로 아래 탭에 전문이 있다.
 */
export function StockDetailBody({
  detail,
  actions,
  railExtra,
  variant = "rail",
}: {
  detail: StockDetail;
  /** 이 종목에만 뜻이 있는 액션 줄 (담기 · 뷰 전환 · AI 판단) */
  actions?: React.ReactNode;
  /** rail 에서만 쓰인다 — 우측 레일에 끼울 다른 도메인 패널 */
  railExtra?: React.ReactNode;
  variant?: "rail" | "flow";
}) {
  // 탭 구성은 두 변형이 같다. 한 번만 만들어 어느 쪽에서도 내용이 갈리지 않게 한다.
  const tabs = (
    <DetailTabs
      panels={[
        {
          key: "news",
          label: `뉴스 ${detail.news.length}`,
          content: <NewsList items={detail.news} now={detail.now} />,
        },
        {
          key: "reports",
          label: `애널리스트 리포트 ${detail.reports.length}`,
          content: <ReportList items={detail.reports} now={detail.now} />,
        },
        {
          key: "financials",
          label: "재무",
          content: (
            <FinancialsPanel
              fundamentals={detail.fundamentals}
              currency={detail.quote.currency}
            />
          ),
        },
      ]}
    />
  );

  const head = (
    <>
      <StockHeadline stock={detail.ref} quote={detail.quote} />
      {actions ? (
        // 대상(헤드라인) 바로 아래 오른쪽 정렬 — 액션을 찾는 눈이 한 열에 머문다.
        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
      ) : null}
    </>
  );

  if (variant === "flow") {
    return (
      <div className="flex min-w-0 flex-col gap-5">
        {head}
        <ChartSection candles={detail.candles} currency={detail.quote.currency} />
        {/* grid 가 아니라 flex-wrap 이다 — 밸류에이션은 재무가 없으면 통째로
            렌더되지 않으므로(ValuationRail), 2열 grid 면 그때 빈 칸이 남는다. */}
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-[240px] flex-1">
            <MetricsRail metrics={detail.metrics} />
          </div>
          <div className="min-w-[240px] flex-1 empty:hidden">
            <ValuationRail fundamentals={detail.fundamentals} />
          </div>
        </div>
        {tabs}
        <ApiNote notes={detail.apiNotes} />
      </div>
    );
  }

  return (
    <>
      {head}
      <div className="grid items-start gap-7 md:grid-cols-[1fr_292px]">
        {/* min-w-0: 그리드 아이템의 기본 min-width:auto 가 차트·표를 밀어내
            1열에서도 가로 스크롤을 만든다 */}
        <div className="flex min-w-0 flex-col gap-3.5">
          <ChartSection candles={detail.candles} currency={detail.quote.currency} />
          {tabs}
        </div>

        <aside className="flex min-w-0 flex-col gap-[18px]">
          <MetricsRail metrics={detail.metrics} />
          {/* 재무 탭은 세 번째라 기본으로 가려져 있다 — "지금 비싼가/얼마 주나"는
              클릭 없이 보이게 여기에 3행만 요약해 둔다. */}
          <ValuationRail fundamentals={detail.fundamentals} />
          {railExtra}
          <ReportDigest reports={detail.reports} />
          <ApiNote notes={detail.apiNotes} />
        </aside>
      </div>
    </>
  );
}
