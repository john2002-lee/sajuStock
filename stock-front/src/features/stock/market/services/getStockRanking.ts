import { apiGetCached, ApiError } from "@/lib/api";
import { USE_MOCK } from "@/lib/config/env";
import { marketRevalidate } from "@/lib/config/marketHours";
import { MOCK_MARKET_HOME } from "../model/mock";
import type { RankingBoard, RankingSort } from "../model/ranking";
import { RANKING_PAGE_SIZE } from "../model/ranking";
import type { WireMoverRow } from "./getMovers";

/** back/app/schemas/market.py : RankingRow */
export interface WireRankingRow extends WireMoverRow {
  board: "KOSPI" | "KOSDAQ";
  market_cap: number | null;
  rank: number;
}

/** back/app/schemas/market.py : MarketRanking */
export interface WireMarketRanking {
  as_of: string | null;
  source: "YFINANCE" | "KRX";
  universe_label: string;
  sort: RankingSort;
  board: RankingBoard;
  total: number;
  rows: WireRankingRow[];
  updated_at: string;
}

/** 탐색 목록 한 줄 */
export interface RankedStock {
  rank: number;
  name: string;
  code: string;
  board: "KOSPI" | "KOSDAQ";
  price: number;
  changePercent: number;
  /** 원. 시가총액 배치가 아직 안 채운 종목은 null */
  marketCap: number | null;
  spark: number[];
}

/** 탐색 화면 한 벌 */
export interface StockRanking {
  rows: RankedStock[];
  /** 필터 적용 후 전체 건수 */
  total: number;
  /** 모집단 캡션 ("시가총액 상위 200종목") */
  scope: string;
  /** 기준 봉 날짜 (YYYY-MM-DD) */
  asOf: string | null;
}

function toRanked(row: WireRankingRow): RankedStock {
  return {
    rank: row.rank,
    name: row.name,
    code: row.code,
    board: row.board,
    price: row.price,
    changePercent: row.change_percent,
    marketCap: row.market_cap,
    spark: row.spark,
  };
}

/** 백엔드 스냅샷이 아직 없을 때 쓰는 빈 결과 */
const EMPTY: StockRanking = { rows: [], total: 0, scope: "", asOf: null };

/**
 * 종목 탐색 랭킹. 서버에서만 실행된다.
 *
 * `/markets/ranking` 은 등락률 스냅샷을 다시 자르는 것이라 항상 빠르다. 다만 기동
 * 직후 워밍업 전에는 빈 목록이 온다 — 화면은 그때 빈 상태를 그린다.
 *
 * `getMovers` 와 같은 자세로 **실패를 예외로 올리지 않는다.** apiGetCached 는
 * 타임아웃만 값으로 주고 4xx/5xx 는 던지므로, 그대로 두면 백엔드가 구버전이거나
 * 꺼져 있을 때 라우트 전체가 500이 된다.
 */
export async function getStockRanking(options: {
  sort: RankingSort;
  board: RankingBoard;
  limit?: number;
  /** 페이지네이션. 백엔드 상한은 2000 이다 (`model/paging`) */
  offset?: number;
}): Promise<StockRanking> {
  const { sort, board, limit = RANKING_PAGE_SIZE, offset = 0 } = options;

  if (USE_MOCK) {
    // 목 모드에서는 홈 등락 상위를 빌려 목록 모양만 보여준다.
    const rows = [...MOCK_MARKET_HOME.gainers, ...MOCK_MARKET_HOME.losers];
    return {
      rows: rows.map((mover, index) => ({
        rank: index + 1,
        name: mover.name,
        code: mover.code,
        board: "KOSPI" as const,
        price: mover.price,
        changePercent: mover.changePercent,
        marketCap: null,
        spark: mover.spark,
      })),
      total: rows.length,
      scope: MOCK_MARKET_HOME.moversScope,
      asOf: null,
    };
  }

  let result;
  try {
    result = await apiGetCached<WireMarketRanking>("/markets/ranking", {
      query: { sort, board, limit, offset },
      // 시세 계열 — 장중 60초 / 장외 900초.
      revalidate: marketRevalidate(),
    });
  } catch (error) {
    if (error instanceof ApiError) return EMPTY;
    throw error;
  }

  if (!result.ok) return EMPTY;

  const { rows, total, universe_label, as_of } = result.data;
  return {
    rows: rows.map(toRanked),
    total,
    scope: universe_label,
    asOf: as_of,
  };
}
