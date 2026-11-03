import { apiGetCached, ApiError } from "@/lib/api";
import { USE_MOCK } from "@/lib/config/env";
import { marketRevalidate } from "@/lib/config/marketHours";
import type { Mover } from "../model/types";

/** back/app/schemas/market.py : MoverRow */
export interface WireMoverRow {
  name: string;
  symbol: string;
  code: string;
  market: string | null;
  price: number;
  change: number | null;
  change_percent: number;
  spark: number[];
}

/** back/app/schemas/market.py : MarketMovers */
export interface WireMarketMovers {
  as_of: string | null;
  source: "YFINANCE" | "KRX";
  universe_label: string;
  universe_size: number;
  scanned: number;
  gainers: WireMoverRow[];
  losers: WireMoverRow[];
  updated_at: string;
}

/** 홈의 등락 상위 두 열에 필요한 전부 */
export interface MoversBlock {
  gainers: Mover[];
  losers: Mover[];
  /** 목록 우측 캡션. 모집단을 그대로 밝힌다 ("시가총액 상위 200종목") */
  scope: string;
  /** 기준 봉 날짜 (YYYY-MM-DD) */
  asOf: string | null;
}

function toMover(row: WireMoverRow): Mover {
  return {
    name: row.name,
    // 영문 상호는 백엔드에 소스가 없다 — 목 데이터에만 있고 실데이터에서는 빠진다.
    code: row.code,
    price: row.price,
    changePercent: row.change_percent,
    spark: row.spark,
  };
}

/**
 * 상승률·하락률 상위. 서버에서만 실행된다.
 *
 * 백엔드는 스캔(수 초)을 배경으로 돌리고 최신 스냅샷만 즉시 잘라 주므로 이
 * 호출은 항상 빠르다. 대신 아직 스냅샷이 없는 순간(기동 직후 워밍업 전)에는
 * 빈 목록이 온다 — 그때는 null 을 돌려 호출부가 예시 데이터로 내려가게 한다.
 *
 * 지수와 마찬가지로 실패를 예외로 올리지 않는다. 등락 상위 한 블록 때문에
 * 홈 전체가 에러 화면이 될 이유가 없다.
 */
export async function getMovers(limit = 5): Promise<MoversBlock | null> {
  if (USE_MOCK) return null;

  let result;
  try {
    result = await apiGetCached<WireMarketMovers>("/markets/movers", {
      query: { limit },
      // 등락률은 시세다 — 장중 60초 / 장외 900초.
      revalidate: marketRevalidate(),
    });
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }

  if (!result.ok) return null;

  const { gainers, losers, universe_label, as_of } = result.data;
  // 한쪽만 비는 날(전 종목 상승·하락)도 실데이터다. 둘 다 비면 스냅샷이 없다는 뜻.
  if (gainers.length === 0 && losers.length === 0) return null;

  return {
    gainers: gainers.map(toMover),
    losers: losers.map(toMover),
    scope: universe_label,
    asOf: as_of,
  };
}
