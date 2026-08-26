import { apiGetCached, ApiError } from "@/lib/api";
import { USE_MOCK } from "@/lib/config/env";
import { marketRevalidate } from "@/lib/config/marketHours";
import { MOCK_MARKET_OVERVIEW } from "../model/mock";
import type { MarketIndex, MarketOverview } from "../model/types";

/** back/app/schemas/market.py : MarketRow */
export interface WireMarketRow {
  name: string;
  symbol: string;
  value: number;
  change: number | null;
  change_percent: number | null;
  tone: "up" | "down";
  highlight: boolean;
  chart_points: number[];
  chart_labels: string[];
}

export interface WireMarketOverview {
  category: string;
  label: string;
  rows: WireMarketRow[];
  chart_points: number[];
  chart_labels: string[];
  updated_at: string;
}

/**
 * 카드 우상단 캡션과 한 줄 해설. **백엔드는 행 단위 라벨을 주지 않는다** —
 * 이건 화면이 읽는 사람에게 하는 말이라 프런트가 소유한다.
 *
 * ## 해설을 "오르면 오른다" 로 쓰지 않는다
 *
 * 입문자에게 지표를 늘려 놓기만 하면 숫자가 소음이 된다. 그래서 각 카드가 **왜
 * 여기 있는지**를 한 줄로 말한다. 다만 "반도체 지수가 오르면 삼성전자도 오른다"
 * 같은 문장은 쓰지 않는다 — 그건 예측이고, 실제로 어긋나는 날이 많다. 이 서비스의
 * 자세("근거를 보여주되 예측하지 않는다")대로 **무엇과 같이 보는 지표인가**까지만
 * 적는다.
 */
const CARD_NOTES: Record<string, { label: string; note?: string }> = {
  KOSPI: { label: "코스피" },
  KOSDAQ: { label: "코스닥" },
  "S&P 500": { label: "미국" },
  "USD/KRW": { label: "환율" },
  반도체: {
    label: "미국",
    note: "미국 반도체주 지수 — 국내 반도체 종목과 같이 봅니다",
  },
  "나스닥 100": {
    label: "미국",
    note: "미국 기술주 중심 — S&P 500 과 갈릴 때가 정보입니다",
  },
  WTI유: {
    label: "원자재",
    note: "국제 유가 — 정유·화학·항공의 원가와 매출에 닿습니다",
  },
  금: {
    label: "원자재",
    note: "위험 회피 자금이 향하는 자산으로 알려져 있습니다",
  },
};

export function toMarketIndex(row: WireMarketRow): MarketIndex {
  const card = CARD_NOTES[row.name];
  return {
    name: row.name,
    label: card?.label ?? "",
    note: card?.note,
    value: row.value,
    change: row.change ?? 0,
    changePercent: row.change_percent ?? 0,
    digits: 2,
    spark: row.chart_points,
  };
}

/**
 * 카테고리별 시장 개요. 서버에서만 실행된다.
 *
 * 홈 화면은 `home` 카테고리를 쓴다 — KOSPI/KOSDAQ/S&P500/USD-KRW 4종만 담은
 * 전용 카탈로그다. 기존 `index` 는 8종목이고 환율이 forex 에 있어, 화면 하나에
 * 두 번 호출해야 했다.
 */
export async function getMarketOverview(
  category = "home",
): Promise<MarketOverview> {
  if (USE_MOCK) return { ...MOCK_MARKET_OVERVIEW, category };

  const empty = (): MarketOverview => ({
    category,
    asOf: new Date().toISOString(),
    indices: [],
  });

  let result;
  try {
    result = await apiGetCached<WireMarketOverview>("/markets/overview", {
      query: { category },
      // 지수는 시세다 — 장중 60초 / 장외 900초.
      revalidate: marketRevalidate(),
    });
  } catch (error) {
    // apiGetCached 는 타임아웃만 값으로 돌려주고 4xx/5xx·연결 실패는 던진다.
    // 그걸 그대로 올리면 지수 한 줄 때문에 라우트 전체가 에러 화면이 된다 —
    // 이 함수는 홈뿐 아니라 종목 상세(2a·2b)에서도 불린다.
    // 지수는 보조 정보이므로 없는 채로 그린다. 진짜 못 그리는 실패
    // (getStockDetail 등)는 여전히 각자 예외를 올린다.
    if (error instanceof ApiError) return empty();
    throw error;
  }

  // 지연되면 지수 카드만 빈 채로 내려간다. 홈의 나머지 블록은 그대로 그려진다.
  if (!result.ok) return empty();

  return {
    category: result.data.category,
    asOf: result.data.updated_at,
    indices: result.data.rows.map(toMarketIndex),
  };
}
