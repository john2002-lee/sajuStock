import { USE_MOCK } from "@/lib/config/env";
import { MOCK_MARKET_HOME } from "../model/mock";
import type { MarketHome } from "../model/types";
import { getCalendar } from "./getCalendar";
import { getMarketOverview } from "./getMarketOverview";
import { getMovers } from "./getMovers";
import { getStockRanking } from "./getStockRanking";

/** 홈에 몇 줄을 보여줄지. 읽고 지나가는 자리라 다섯이면 충분하다. */
const TOP_BY_CAP_ROWS = 5;

/**
 * 홈 한 화면 분량.
 *
 * 이제 **두 블록 모두 실데이터**다 — 지수 4카드와 등락 상위. 예전에는 업종 등락·오늘의
 * 뉴스가 함께 있었지만 둘 다 대응 API 가 없어 예시 값으로 채워 두고 있었다. 첫 화면의
 * 절반이 가짜인 편보다, 진짜인 것만 보여주는 편이 낫다고 판단해 걷어냈다.
 * (업종 집계와 시장 단위 뉴스는 백엔드가 생기면 그때 다시 넣는다.)
 *
 * 남은 예시 가능성은 등락 상위 하나뿐이다. 랭킹 스냅샷은 배경 스캔이라 기동 직후
 * 잠깐 비는데, 그때만 목 데이터로 내려가고 `moversAreSample` 로 그 사실을 알린다.
 *
 * 두 조회는 서로를 기다릴 이유가 없어 병렬로 던진다. 둘 다 실패를 예외로 올리지
 * 않으므로(각자 빈 지수·null 로 degrade) Promise.all 이 통째로 깨지지 않는다.
 */
export async function getMarketHome(): Promise<MarketHome> {
  if (USE_MOCK) return MOCK_MARKET_HOME;

  const [overview, movers, calendar, ranking] = await Promise.all([
    getMarketOverview("home"),
    getMovers(),
    getCalendar(),
    // 시가총액 상위 요약. 탐색 화면과 같은 엔드포인트를 **5행만** 잘라 쓴다 —
    // `limit` 를 줄여 보내므로 상류 부담이 늘지 않는다.
    getStockRanking({ sort: "market_cap", board: "ALL", limit: TOP_BY_CAP_ROWS }),
  ]);

  return {
    ...MOCK_MARKET_HOME,
    moversAreSample: movers === null,
    indices: overview.indices,
    topByCap: ranking.rows,
    topByCapScope: ranking.scope,
    gainers: movers?.gainers ?? MOCK_MARKET_HOME.gainers,
    losers: movers?.losers ?? MOCK_MARKET_HOME.losers,
    moversScope: movers?.scope ?? MOCK_MARKET_HOME.moversScope,
    // 목 데이터를 두지 않는다. 일정은 예시로 채우면 "삼성전자 실적발표 8/11" 같은
    // **틀린 사실**이 화면에 뜬다 — 등락률과 달리 사람이 보고 판단하는 날짜라
    // 가짜를 섞을 자리가 아니다. 없으면 없다고 말한다 (`CalendarList`).
    calendar,
    asOf: overview.asOf,
    apiNotes: [
      "fetch_market_overview_from_yfinance (지수 4종 · 실데이터)",
      movers
        ? `scan_movers · ${movers.scope}${movers.asOf ? ` · ${movers.asOf}` : ""} (실데이터)`
        : "등락 상위는 예시 데이터 (랭킹 스냅샷 준비 중)",
      calendar
        ? `markets/calendar · ${calendar.covered}/${calendar.universeSize}종목 수집${
            calendar.asOf ? ` · ${calendar.asOf}` : ""
          } (실데이터)`
        : "오늘의 일정 조회 실패",
    ],
  };
}
