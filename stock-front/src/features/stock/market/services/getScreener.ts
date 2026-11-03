import { apiGetCached, ApiError } from "@/lib/api";
import { USE_MOCK } from "@/lib/config/env";
import type { RankingBoard } from "../model/ranking";
import type { ScreenerQuery, ScreenerSort } from "../model/screener";
import { SCREENER_PAGE_SIZE, screenerBounds } from "../model/screener";

/** back/app/schemas/market.py : ScreenerRow */
export interface WireScreenerRow {
  name: string;
  symbol: string;
  code: string;
  board: "KOSPI" | "KOSDAQ";
  market_cap: number | null;
  per: number | null;
  pbr: number | null;
  roe_pct: number | null;
  dividend_yield_pct: number | null;
  rank: number;
}

/** back/app/schemas/market.py : ScreenerResult */
export interface WireScreenerResult {
  as_of: string | null;
  sort: ScreenerSort;
  order: "asc" | "desc";
  board: RankingBoard;
  total: number;
  rows: WireScreenerRow[];
  covered: number;
  universe_size: number;
  updated_at: string;
}

/** 조건 검색 결과 한 줄. 시세가 없다 — 이 화면은 지표만 말한다 */
export interface ScreenedStock {
  rank: number;
  name: string;
  code: string;
  board: "KOSPI" | "KOSDAQ";
  marketCap: number | null;
  per: number | null;
  pbr: number | null;
  roePct: number | null;
  dividendYieldPct: number | null;
}

export interface ScreenerResult {
  rows: ScreenedStock[];
  /** 조건 적용 후 전체 건수 */
  total: number;
  /** 지표가 채워진 종목 수 / 배치 모집단 */
  covered: number;
  universeSize: number;
  /** 지표 배치가 마지막으로 돈 날 (YYYY-MM-DD) */
  asOf: string | null;
  order: "asc" | "desc";
}

function toScreened(row: WireScreenerRow): ScreenedStock {
  return {
    rank: row.rank,
    name: row.name,
    code: row.code,
    board: row.board,
    marketCap: row.market_cap,
    per: row.per,
    pbr: row.pbr,
    roePct: row.roe_pct,
    dividendYieldPct: row.dividend_yield_pct,
  };
}

const EMPTY: ScreenerResult = {
  rows: [],
  total: 0,
  covered: 0,
  universeSize: 0,
  asOf: null,
  order: "desc",
};

/**
 * 지표는 하루 1회 배치가 채운다 — 시세 계열의 60초/900초와 맞출 이유가 없다.
 *
 * 그렇다고 하루로 두지도 않는다. 배치는 매일 **모집단의 일부만** 갱신하므로 종일
 * 조금씩 바뀌고, 조건 검색으로 들어온 사람이 어제 스냅샷을 보고 있을 이유가 없다.
 * 30분은 "배치가 한 청크를 도는 사이" 정도의 눈금이다.
 */
const SCREENER_REVALIDATE = 1800;

/**
 * 조건 검색. 서버에서만 실행된다.
 *
 * `getStockRanking` 과 같은 자세로 **실패를 예외로 올리지 않는다.** apiGetCached 는
 * 타임아웃만 값으로 주고 4xx/5xx 는 던지므로, 그대로 두면 백엔드가 구버전이거나
 * 꺼져 있을 때 라우트 전체가 500이 된다.
 *
 * 목 모드는 **빈 결과**를 낸다. 랭킹은 홈 데이터를 빌려 모양을 보여줄 수 있지만
 * 여기서 그러면 지표 열에 넣을 값이 없어 전부 대시가 되고, 그건 "조건에 맞는 종목이
 * 없다" 와 화면상 구별되지 않는다 — 목 데이터가 기능을 오해하게 만드는 쪽이다.
 */
export async function getScreener(
  query: ScreenerQuery,
  options: { limit?: number; offset?: number } = {},
): Promise<ScreenerResult> {
  const { limit = SCREENER_PAGE_SIZE, offset = 0 } = options;

  if (USE_MOCK) return EMPTY;

  let result;
  try {
    result = await apiGetCached<WireScreenerResult>("/markets/screener", {
      query: {
        board: query.board,
        sort: query.sort,
        limit,
        offset,
        ...screenerBounds(query),
      },
      revalidate: SCREENER_REVALIDATE,
    });
  } catch (error) {
    if (error instanceof ApiError) return EMPTY;
    throw error;
  }

  if (!result.ok) return EMPTY;

  const { rows, total, covered, universe_size, as_of, order } = result.data;
  return {
    rows: rows.map(toScreened),
    total,
    covered,
    universeSize: universe_size,
    asOf: as_of,
    order,
  };
}
