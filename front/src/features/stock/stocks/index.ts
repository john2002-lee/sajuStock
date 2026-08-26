export { getStockDetail } from "./services/getStockDetail";

export { StockHeadline } from "./components/StockHeadline";
export { ChartSection } from "./components/ChartSection";
export { StockDetailBody } from "./components/StockDetailBody";
export { StockChart } from "./components/StockChart";
export { DetailTabs } from "./components/DetailTabs";
export { NewsList } from "./components/NewsList";
export { ReportList } from "./components/ReportList";
export { FinancialsPanel } from "./components/FinancialsPanel";
export { MetricsRail } from "./components/MetricsRail";
export { ValuationRail } from "./components/ValuationRail";
export { ReportDigest } from "./components/ReportDigest";
export { ApiNote } from "./components/ApiNote";

/**
 * 2b 터미널 콘솔 조각들.
 *
 * 조립 루트(ConsoleView)는 stocks·market·watchlist·advice 네 feature 를 엮으므로
 * app/ 에 남는다 — feature 끼리는 직접 import 할 수 없다. 여기 있는 것은 그중
 * **stocks 데이터만 보는** 조각들이라 도메인 안으로 들어왔다.
 */
export { ConsoleHeadline } from "./components/console/ConsoleHeadline";
export { ConsoleChart } from "./components/console/ConsoleChart";
export { MetricGrid } from "./components/console/MetricGrid";
export { ContentRail } from "./components/console/ContentRail";
export { ConsoleFooter } from "./components/console/ConsoleFooter";
/** 콘솔에 남은 조각(TopBar·WatchRail)도 같은 라벨을 써야 하므로 경계 밖으로 연다 */
export { CONSOLE_LABEL, CONSOLE_LABEL_STYLE } from "./components/console/tokens";

export type {
  AnalystReport,
  AnnualFinancial,
  Candle,
  CrossSignal,
  Fundamentals,
  Metric,
  NewsItem,
  Quote,
  StockDetail,
  StockRef,
} from "./model/types";
