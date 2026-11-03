import type { Market } from "@/shared/types";
import type { Watchlist, WatchItem } from "../model/types";

/**
 * 백엔드 `app/schemas/watchlist.py` 계약 → 프런트 타입.
 *
 * 변환을 서비스 안에 인라인하지 않고 파일로 뺀 것은 `features/stocks/services/wire.ts`
 * 와 같은 이유다 — 계약이 바뀌었을 때 고칠 곳이 한 곳이고, 순수 함수라 네트워크
 * 없이 테스트할 수 있다.
 */

interface WireHolding {
  quantity: number;
  avg_price: number;
}

interface WireAlert {
  enabled: boolean;
  condition: string;
}

interface WireRow {
  name: string;
  symbol: string;
  code: string;
  market: string | null;
  group: string;
  position: number;
  price: number;
  change_percent: number;
  spark: number[];
  holding: WireHolding | null;
  alert: WireAlert;
}

export interface WireWatchlist {
  items: WireRow[];
  groups: { name: string; count: number }[];
  total_count: number;
  group_count: number;
  active_alerts: number;
  total_return_percent: number;
  updated_at: string;
}

/**
 * KRX 시장 구분 원문(`유가`·`코스닥`·`코넥스`) → 화면 표기.
 *
 * DB 가 한글 라벨을 담고 있다는 사실이 3회차·8회차에서 두 번 문제가 됐다
 * (`domain/ranking.py` 주석). 여기서도 `KOSPI` 만 볼 수는 없다 — 실측 DB 에
 * 그 문자열은 0건이다. 모르는 값은 심볼 접미사로 떨어뜨린다.
 */
function toMarket(market: string | null, symbol: string): Market {
  const label = (market ?? "").trim();
  if (label === "유가" || label === "유가증권" || label === "코스피" || label === "KOSPI") {
    return "KOSPI";
  }
  if (label === "코스닥" || label === "KOSDAQ" || label === "코넥스" || label === "KONEX") {
    return "KOSDAQ";
  }
  return symbol.endsWith(".KQ") ? "KOSDAQ" : "KOSPI";
}

function toItem(row: WireRow): WatchItem {
  return {
    name: row.name,
    // 백엔드는 영문명을 주지 않는다. 표시용 부제라 없으면 비워 둔다 —
    // 코드를 영문명 자리에 넣으면 그게 회사 이름인 것처럼 읽힌다.
    nameEn: "",
    code: row.code,
    symbol: row.symbol,
    market: toMarket(row.market, row.symbol),
    group: row.group,
    price: row.price,
    changePercent: row.change_percent,
    spark: row.spark,
    holding: row.holding
      ? { quantity: row.holding.quantity, avgPrice: row.holding.avg_price }
      : undefined,
    alert: { enabled: row.alert.enabled, condition: row.alert.condition },
    // AI 판단은 관심종목 저장소가 아니라 advice 캐시가 들고 있다. 일괄 분석이
    // 끝나면 화면이 행에 얹으므로 여기서는 비운다.
    verdict: undefined,
  };
}

export function toWatchlist(wire: WireWatchlist): Watchlist {
  return {
    items: wire.items.map(toItem),
    groups: wire.groups.map((group) => ({ name: group.name, count: group.count })),
    totalCount: wire.total_count,
    groupCount: wire.group_count,
    activeAlerts: wire.active_alerts,
    totalReturnPercent: wire.total_return_percent,
  };
}
