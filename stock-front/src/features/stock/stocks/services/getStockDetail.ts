import { apiGetCached, ApiError } from "@/lib/api";
import { marketRevalidate, REVALIDATE_STATIC } from "@/lib/config/marketHours";
import { USE_MOCK } from "@/lib/config/env";
import { isResolvableSymbol } from "@/lib/stocks/symbol";
import { MOCK_STOCK_DETAIL } from "../model/mock";
import type { StockDetail } from "../model/types";
import {
  toCandles,
  toFundamentals,
  toMetrics,
  toNews,
  toQuote,
  toReports,
  toStockRef,
  type WireStockContent,
  type WireStockFundamentals,
  type WireStockHistory,
} from "./wire";

/** 지표 계산에 필요한 최소 봉 수 (60일선 + 52주 위치) */
const HISTORY_LIMIT = 504;

/**
 * 조회 결과. 호출부(page.tsx)가 네 갈래를 구분해야 한다:
 *   ok        정상
 *   not-found 정규화 실패 → 후보 선택 화면
 *   timeout   상류 지연 → 잠시 뒤 재시도 안내
 *   offline   백엔드에 닿지 못함 → 서버를 켜라는 안내 (재시도는 소용없다)
 */
export type StockDetailResult =
  | { status: "ok"; detail: StockDetail }
  | { status: "not-found" }
  | { status: "timeout" }
  | { status: "offline" };

/**
 * 종목 상세 한 벌. 서버에서만 실행된다.
 *
 * 주가와 뉴스·리포트를 나눠 부른다: 백엔드 주석대로 content 가 응답 시간의
 * 약 95%를 차지해, 함께 받으면 차트가 뉴스를 기다리게 된다.
 *
 * 재검증 주기는 장중 60초 / 장외 900초로 갈린다 (lib/config/marketHours).
 *
 * ## 모양 검사를 여기 두는 이유
 *
 * `/stocks/<아무문자열>` 이 상류 호출로 이어지는 것을 막는 문이다. 페이지가 아니라
 * **이 함수**에 두는 것은, 여기가 상류로 나가는 유일한 문이라서다 — 페이지에 두면
 * 새 호출부 하나가 검사 없이 지나간다. 게이트가 `not-found` 를 내면 호출부는 이미
 * 있는 '후보 고르기' 화면을 그리므로 화면 코드는 바뀌지 않는다.
 */
export async function getStockDetail(
  code: string,
): Promise<StockDetailResult> {
  // 종목일 수 없는 문자열은 상류를 부르지 않는다. 백엔드는 KRX 목록에 없는 값을
  // 그대로 야후 티커로 쓰므로(`normalize_stock_candidates`), 이 한 줄이 없으면
  // 주소창이 곧 상류 호출 증폭구가 된다 (`lib/stocks/symbol` 주석).
  if (!isResolvableSymbol(code)) return { status: "not-found" };

  if (USE_MOCK) {
    return code === MOCK_STOCK_DETAIL.ref.code
      ? { status: "ok", detail: MOCK_STOCK_DETAIL }
      : { status: "not-found" };
  }

  const revalidate = marketRevalidate();

  try {
    const history = await apiGetCached<WireStockHistory>("/stocks/history", {
      query: { symbol: code, limit: HISTORY_LIMIT, include_content: false },
      revalidate,
    });
    if (!history.ok) return { status: "timeout" };

    // 뉴스·리포트와 재무는 둘 다 없어도 화면이 성립한다 — 실패든 지연이든 빈 값으로
    // 내려간다. 서로 독립이라 병렬로 부르고, 그래서 재무를 붙여도 벽시계 시간이
    // 늘지 않는다. .catch 가 ApiError 까지 삼키는 것은 의도적이다: 재무 탭 하나
    // 때문에 상세 페이지 전체가 에러 화면이 되면 안 된다.
    const [content, fundamentals] = await Promise.all([
      // 시세가 아니라 콘텐츠라 장중/장외 분기를 적용하지 않는다.
      apiGetCached<WireStockContent>("/stocks/content", {
        query: { symbol: history.data.symbol },
        revalidate: REVALIDATE_STATIC,
      }).catch(() => ({ ok: false as const, reason: "timeout" as const })),
      // PER/PBR 은 주가를 따라 움직이므로 뉴스처럼 1시간 고정할 수 없다.
      // 백엔드가 종목당 15분 TTL 을 들고 있어 대부분 캐시 히트다.
      apiGetCached<WireStockFundamentals>("/stocks/fundamentals", {
        query: { symbol: history.data.symbol },
        revalidate,
      }).catch(() => ({ ok: false as const, reason: "timeout" as const })),
    ]);

    const articles = content.ok
      ? content.data
      : { symbol: history.data.symbol, news: [], reports: [] };

    return {
      status: "ok",
      detail: {
        ref: toStockRef(history.data),
        quote: toQuote(history.data.metrics, history.data.symbol),
        candles: toCandles(history.data.rows),
        metrics: toMetrics(history.data.metrics),
        news: toNews(articles.news),
        reports: toReports(articles.reports),
        fundamentals: fundamentals.ok ? toFundamentals(fundamentals.data) : null,
        now: new Date().toISOString(),
        apiNotes: [
          "fetch_stock_history_from_yfinance",
          "build_stock_metrics",
          "fetch_stock_news · fetch_analyst_reports",
          "fetch_stock_fundamentals",
        ],
      },
    };
  } catch (error) {
    // 정규화 실패(404)만 '후보 선택' 경로로 보낸다. 공급자 장애(503)는 그대로
    // 던져 error.tsx 가 받게 한다 — 타임아웃과 달리 재시도가 의미 있다.
    if (error instanceof ApiError && error.isNotFound) return { status: "not-found" };
    // 백엔드에 닿지도 못한 경우는 예외로 올리지 않는다. error.tsx 는 "yfinance
    // 응답이 늦습니다" 라고 안내하는데, 서버가 꺼져 있을 때 그건 거짓이고
    // 개발자가 할 일(백엔드 실행)을 가린다.
    if (error instanceof ApiError && error.isOffline) return { status: "offline" };
    throw error;
  }
}
