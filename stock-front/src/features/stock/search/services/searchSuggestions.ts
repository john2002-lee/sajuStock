import { apiGetCached } from "@/lib/api";
import { USE_MOCK } from "@/lib/config/env";
import {
  detectMode,
  initialConsonants,
  isTickerLike,
  nameMatch,
  splitByMatch,
  type SearchScope,
} from "../model/match";
import { findByCode, MOCK_UNIVERSE } from "../model/mock";
import type {
  SearchMode,
  Suggestion,
  SuggestionGroup,
  SuggestionResponse,
} from "../model/types";
import type { Market } from "@/shared/types";

/** 백엔드 Query(ge=1, le=10) 상한과 맞춘다 */
const GROUP_LIMIT = 5;
const FETCH_LIMIT = 10;

/** back/app/schemas/stock.py : StockSuggestion */
interface WireStockSuggestion {
  symbol: string;
  name: string;
  market: string | null;
  initial_consonants: string;
}

function toMarket(value: string | null, symbol: string): Market {
  if (value === "KOSPI" || value === "KOSDAQ") return value;
  if (value === "NASDAQ" || value === "NYSE") return value;
  if (symbol.endsWith(".KQ")) return "KOSDAQ";
  if (symbol.endsWith(".KS")) return "KOSPI";
  return "NASDAQ";
}

function toSuggestion(wire: WireStockSuggestion): Suggestion {
  return {
    name: wire.name,
    code: wire.symbol.replace(/\.(KS|KQ)$/, ""),
    symbol: wire.symbol,
    market: toMarket(wire.market, wire.symbol),
    initials: wire.initial_consonants || initialConsonants(wire.name),
    // 백엔드 StockSuggestion 에는 시세가 없다. 종목마다 yfinance 를 부르면
    // 타이핑 한 번에 N번 호출이 되므로 가격·스파크라인은 표시하지 않는다.
  };
}

/**
 * 같은 검색어의 결과를 이 시간 동안 재사용한다.
 *
 * 이 조회는 **사용자와 무관하다** — 입력 문자열 하나로 결과가 정해지고, 상장 종목
 * 목록은 하루 단위로도 거의 바뀌지 않는다. 캐시가 없던 동안에는 "삼성" 을 친 사람
 * 100명이 백엔드 검색 100번이었고, 최근 검색 그룹(코드별 조회)까지 더하면 요청
 * 하나가 최대 6건으로 팬아웃됐다. 흔한 접두어일수록 겹치는 양이 많아 효과가 크다.
 *
 * 5분인 이유: 신규 상장이 반영되기까지의 지연으로 받아들일 만하면서, 타이핑
 * 세션(수십 초) 여러 개를 확실히 덮는다.
 */
const SUGGESTIONS_REVALIDATE = 300;

/**
 * 첫 호출은 백엔드가 상장사 목록을 데우는 중일 수 있어 느리다(그래서 화면에
 * `DelayBanner` 가 있다). 기본 5초로는 워밍업 구간을 못 넘긴다.
 *
 * 타임아웃이 나도 요청 자체는 계속 진행돼 캐시를 채운다(`apiGetCached` 주석) —
 * 이번 응답만 비고 다음 타이핑부터는 즉시 뜬다.
 */
const SUGGESTIONS_TIMEOUT_MS = 10_000;

async function fetchSuggestions(query: string): Promise<Suggestion[]> {
  if (!query.trim()) return [];
  const result = await apiGetCached<WireStockSuggestion[]>("/stocks/suggestions", {
    query: { query, limit: FETCH_LIMIT },
    revalidate: SUGGESTIONS_REVALIDATE,
    timeoutMs: SUGGESTIONS_TIMEOUT_MS,
  });
  // 지연은 빈 결과로 degrade 한다 — 자동완성이 늦게 뜨는 것과 화면이 죽는 것은 다르다.
  if (!result.ok) return [];
  return result.data.map(toSuggestion);
}

/**
 * 자동완성 검색. 라우트 핸들러(app/api/stocks/suggestions)에서만 호출된다.
 *
 * 초성 검색은 백엔드가 처리한다 (`get_initial_consonants` + `repo.find_candidates`).
 * 프런트는 결과를 화면 그룹(이름·초성 / 최근 검색 / 코드·티커)으로 나누고
 * 매칭 구간만 계산한다 — 백엔드가 `_rank` 근거를 응답에 담지 않기 때문이다.
 */
export async function searchSuggestions({
  query,
  recentCodes = [],
  scope = "all",
  mode: forcedMode,
}: {
  query: string;
  recentCodes?: string[];
  /** 프리픽스 문법이 좁혀 준 검색 범위 (`>` 이름 / `:` 코드 / `@` 티커) */
  scope?: SearchScope;
  mode?: SearchMode;
}): Promise<SuggestionResponse> {
  const startedAt = performance.now();
  const mode = forcedMode ?? detectMode(query);

  let byName: Suggestion[];
  let byCode: Suggestion[];
  let recent: Suggestion[];

  if (USE_MOCK) {
    const split = splitByMatch(MOCK_UNIVERSE, query, mode, GROUP_LIMIT);
    byName = split.byName;
    byCode = split.byCode;
    recent = recentCodes
      .map(findByCode)
      .filter((item): item is Suggestion => item !== undefined)
      .slice(0, GROUP_LIMIT);
  } else {
    const [matches, recentMatches] = await Promise.all([
      fetchSuggestions(query),
      // 최근 검색은 쿼리로 거르지 않는다 — 코드로 각각 조회해 표시명을 얻는다.
      Promise.all(recentCodes.slice(0, GROUP_LIMIT).map(fetchSuggestions)),
    ]);

    // 이름/초성으로 걸린 것과 코드·티커로 걸린 것을 나눈다.
    const named: Suggestion[] = [];
    const coded: Suggestion[] = [];
    const q = query.trim().toLowerCase();
    for (const item of matches) {
      const match = nameMatch(item.name, query, mode);
      if (match) named.push({ ...item, match });
      else if (
        item.code.toLowerCase().startsWith(q) ||
        item.symbol.toLowerCase().startsWith(q)
      ) {
        coded.push(item);
      }
    }
    byName = named.slice(0, GROUP_LIMIT);
    byCode = coded.slice(0, GROUP_LIMIT);

    // 상장사 DB 는 KRX 종목만 담는다 — 해외 티커는 자동완성에 잡히지 않지만
    // /stocks/history 는 그대로 해석한다. 입력이 티커 형태일 때만 한 줄 열어 준다.
    // 한글·숫자만·6자 초과·공백 포함은 여기 걸리지 않고 기존 '결과 없음'으로 간다.
    if (byCode.length === 0 && isTickerLike(query)) {
      const ticker = query.trim().toUpperCase();
      byCode = [
        {
          name: ticker,
          nameEn: "해외 티커로 조회",
          code: ticker,
          symbol: ticker,
          market: "NASDAQ",
          initials: "",
        },
      ];
    }
    recent = recentMatches
      .map((list) => list[0])
      .filter((item): item is Suggestion => item !== undefined);
  }

  // 프리픽스가 있으면 해당 그룹만 남긴다. 최근 검색도 함께 숨긴다 —
  // ':005930' 처럼 범위를 좁힌 입력에 무관한 최근 항목이 섞이면 의도와 어긋난다.
  if (scope === "name") {
    byCode = [];
    recent = [];
  } else if (scope === "code" || scope === "ticker") {
    byName = [];
    recent = [];
  }

  const groups: SuggestionGroup[] = (
    [
      {
        key: "name",
        label: "이름 · 초성 일치",
        note: "normalize_stock_candidates · get_initial_consonants",
        items: byName,
      },
      {
        key: "recent",
        label: "최근 검색",
        note: "get_common_stock_name → 한글 표시명",
        items: recent,
      },
      {
        key: "code",
        label: "코드 · 해외 티커",
        note: "normalize_stock_code · krx_symbol_to_yfinance",
        items: byCode,
      },
    ] satisfies SuggestionGroup[]
  ).filter((group) => group.items.length > 0);

  return {
    query,
    mode,
    groups,
    total: groups.reduce((sum, group) => sum + group.items.length, 0),
    elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
  };
}
