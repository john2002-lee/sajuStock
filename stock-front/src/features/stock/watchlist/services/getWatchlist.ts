import { apiGet, ApiError } from "@/lib/api";
import { USE_MOCK } from "@/lib/config/env";
import { MOCK_WATCHLIST } from "../model/mock";
import type { Watchlist } from "../model/types";
import { toWatchlist, type WireWatchlist } from "./wire";

/** 담아 둔 것이 없거나 백엔드가 없을 때 */
const EMPTY: Watchlist = {
  items: [],
  groups: [],
  totalCount: 0,
  groupCount: 0,
  activeAlerts: 0,
  totalReturnPercent: 0,
};

/**
 * 관심종목 한 벌. 서버에서만 실행된다.
 *
 * 8회차까지 이 함수는 목 데이터를 그대로 돌려줬다. 이제 백엔드 저장소
 * (`watchlist_items`)를 읽는다 — 그룹·순서·보유·알림은 사용자가 소유한 데이터라
 * yfinance 가 줄 수 없고, 새 테이블이 필요했다.
 *
 * **소유자를 인자로 받는다.** 쿠키를 여기서 직접 읽지 않는 이유는 신원을 어디서
 * 얻는지가 화면(app/)의 관심사이기 때문이다. 로그인이 붙으면 호출부가 세션 ID를
 * 넘기게 되고 이 함수는 그대로다.
 *
 * `getMovers` · `getStockRanking` 과 같은 자세로 **실패를 예외로 올리지 않는다.**
 * 관심종목 화면이 500이 되는 것보다 빈 목록이 낫다.
 */
export async function getWatchlist(ownerKey: string): Promise<Watchlist> {
  if (USE_MOCK) return MOCK_WATCHLIST;

  // proxy 가 쿠키를 굽기 전(matcher 밖)이면 신원이 없다. 임의의 키를 지어내면
  // 그 요청만 남의 것도 내 것도 아닌 목록을 만든다 — 빈 목록이 정직하다.
  if (!ownerKey) return EMPTY;

  try {
    // 캐시하지 않는다. 사용자별 데이터라 Next 데이터 캐시(URL 이 키다)에 담으면
    // **다른 사용자에게 남의 목록이 나간다.** 그래서 apiGetCached 가 아니라 apiGet 이다.
    const wire = await apiGet<WireWatchlist>("/watchlist", {
      headers: { "X-Owner-Key": ownerKey },
    });
    return toWatchlist(wire);
  } catch (error) {
    if (error instanceof ApiError) return EMPTY;
    throw error;
  }
}
