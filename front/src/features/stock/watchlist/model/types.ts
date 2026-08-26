// 관심종목 도메인 타입.
//
// 백엔드에 대응 엔드포인트가 없다 — 그룹·순서·보유·알림 조건은 전부 신규 저장소가
// 필요하다 (yfinance/KRX 는 시세만 준다).

import type { Market } from "@/shared/types";

export interface Holding {
  quantity: number;
  avgPrice: number;
}

export interface AlertRule {
  enabled: boolean;
  /** "75,000원 도달 시" — 자유 텍스트로 편집한다 */
  condition: string;
}

export interface WatchItem {
  name: string;
  nameEn: string;
  code: string;
  symbol: string;
  market: Market;
  /** 코어 / 2차전지 / 관찰 / 해외 */
  group: string;
  price: number;
  changePercent: number;
  /** 3개월 스파크라인 */
  spark: number[];
  holding?: Holding;
  alert: AlertRule;
  /** 마지막 AI 판단 — 없으면 아직 분석 전 */
  verdict?: "비중 확대" | "유지" | "관망" | "과열 주의";
}

export interface WatchGroup {
  name: string;
  count: number;
}

export interface Watchlist {
  items: WatchItem[];
  groups: WatchGroup[];
  /**
   * 헤더 캡션용 집계. items.length 로 유도하지 않는다 — 목록은 페이지네이션되고
   * 그룹 탭에도 전체가 다 실리지 않기 때문에, 집계는 서버가 따로 내려주는 값이다.
   */
  totalCount: number;
  groupCount: number;
  /** 알림이 켜진 건수 */
  activeAlerts: number;
  /** 평가손익 합계 % */
  totalReturnPercent: number;
}

/**
 * 행에 표시할 AI 진행 상태. features/advice 의 BulkAdviceEntry 를 화면용으로 좁힌 형태다.
 * 두 feature 가 서로를 import 하지 않도록 페이지(app/)에서 변환해 내려준다.
 */
export interface RowAiStatus {
  /** 0~4 */
  stage: number;
  running: boolean;
  /** 완료 시 판단 문구 */
  verdict?: string;
  error?: boolean;
  /**
   * AI 가 아니라 지표 규칙으로 내린 판단인가.
   *
   * **불리언인 것이 의도다.** advice 의 `DecisionSource`(llm/fallback/timeout)를
   * 여기로 들이면 watchlist 가 advice 를 알게 되어 feature 간 직접 import 가
   * 된다(CONVENTIONS '의존 방향'). 변환은 둘을 조립하는 app 층의 몫이고, 이 표가
   * 알아야 할 것은 "이 한 줄을 AI 판단과 같은 무게로 읽어도 되는가" 뿐이다.
   */
  ruleBased?: boolean;
}

export type SortKey = "order" | "change" | "name" | "return";

export const SORT_LABELS: Record<SortKey, string> = {
  order: "직접 정렬",
  change: "등락률",
  name: "종목명",
  return: "평가손익",
};

/** 보유 수량과 평단이 있으면 평가손익률을 낸다 */
export function returnPercent(item: WatchItem): number | null {
  if (!item.holding) return null;
  return ((item.price - item.holding.avgPrice) / item.holding.avgPrice) * 100;
}

/**
 * 해외 종목인가. **통화를 정하는 유일한 판정이다.**
 *
 * 행 세 벌(`WatchRow`·`WatchRowCompact`·`WatchCard`)이 이 한 줄을 각자 들고 있었다.
 * 시장이 하나 늘 때(예: AMEX) 세 곳을 다 고쳐야 하는데, 한 곳을 빠뜨려도 화면은
 * 멀쩡히 그려지고 **가격 앞의 `$` 만 조용히 사라진다.**
 */
export function isOverseas(item: WatchItem): boolean {
  return item.market === "NASDAQ" || item.market === "NYSE";
}
