// 목 데이터. 실 API 가 붙으면 services/getStockDetail.ts 내부만 교체되고
// 이 파일은 삭제된다.
//
// 이 파일은 "백엔드 대역"이다 — 그래서 MA/BB/교차 계산이 여기 있다.
// 화면 컴포넌트에서 같은 계산을 다시 하지 않는다 (CONVENTIONS: 지표는 백엔드 소유).

import type {
  AnalystReport,
  Candle,
  CrossSignal,
  Fundamentals,
  Metric,
  NewsItem,
  Quote,
  StockDetail,
  StockRef,
} from "./types";

/** 화면이 항상 같은 모습이어야 하므로 시드 고정 LCG 를 쓴다 (Math.random 금지) */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const BASE_DATE = "2026-07-30";
const BAR_COUNT = 260;

function businessDaysBack(endDate: string, count: number): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${endDate}T00:00:00Z`);
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates.reverse();
}

function sma(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

function bollinger(values: number[], window: number, mult: number) {
  const mid = sma(values, window);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const mean = mid[i];
    if (mean === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const slice = values.slice(i - window + 1, i + 1);
    const variance =
      slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / slice.length;
    const sd = Math.sqrt(variance);
    upper.push(mean + sd * mult);
    lower.push(mean - sd * mult);
  }
  return { upper, lower };
}

/** MA20 이 MA60 을 상향 돌파하면 golden, 하향이면 dead */
function crossSignals(
  fast: (number | null)[],
  slow: (number | null)[],
): (CrossSignal | null)[] {
  return fast.map((f, i) => {
    const s = slow[i];
    const pf = fast[i - 1];
    const ps = slow[i - 1];
    if (f === null || s === null || pf == null || ps == null) return null;
    if (pf <= ps && f > s) return "golden";
    if (pf >= ps && f < s) return "dead";
    return null;
  });
}

function buildCandles(): Candle[] {
  const rand = seeded(20260730);
  const dates = businessDaysBack(BASE_DATE, BAR_COUNT);

  // 55,000 → 71,400 으로 완만히 오르는 시계열 + 노이즈
  const closes: number[] = [];
  let level = 55_200;
  for (let i = 0; i < BAR_COUNT; i += 1) {
    const drift = 63 + Math.sin(i / 26) * 45;
    const noise = (rand() - 0.5) * 900;
    level = Math.max(38_000, level + drift + noise);
    closes.push(Math.round(level / 10) * 10);
  }
  // 마지막 봉을 디자인 시안의 71,400 에 맞춘다
  const shift = 71_400 - closes[closes.length - 1];
  for (let i = 0; i < closes.length; i += 1) {
    closes[i] = Math.round((closes[i] + (shift * i) / (closes.length - 1)) / 10) * 10;
  }

  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const bb = bollinger(closes, 20, 2);
  const crosses = crossSignals(ma20, ma60);

  return dates.map((date, i) => {
    const close = closes[i];
    const open = i === 0 ? close : closes[i - 1];
    const spread = 240 + rand() * 620;
    return {
      date,
      open,
      close,
      high: Math.round(Math.max(open, close) + rand() * spread),
      low: Math.round(Math.min(open, close) - rand() * spread),
      volume: Math.round(7_400_000 + rand() * 12_600_000),
      ma20: ma20[i],
      ma60: ma60[i],
      bbUpper: bb.upper[i],
      bbLower: bb.lower[i],
      cross: crosses[i],
    };
  });
}

const CANDLES = buildCandles();

const REF: StockRef = {
  name: "삼성전자",
  nameEn: "Samsung Electronics Co., Ltd.",
  code: "005930",
  symbol: "005930.KS",
  market: "KOSPI",
  sector: "반도체",
};

const QUOTE: Quote = {
  price: 71_400,
  change: 1_000,
  changePercent: 1.42,
  currency: "KRW",
  asOf: `${BASE_DATE}T06:30:00Z`, // 15:30 KST
  session: "closed",
};

const METRICS: Metric[] = [
  { label: "20일 수익률", value: "+6.24%", accent: "up" },
  { label: "60일 수익률", value: "+11.42%", accent: "up" },
  { label: "추세", value: "상승 전환", accent: "up" },
  { label: "거래량 배율", value: "1.82x", accent: "up" },
  { label: "52주 위치", value: "84%" },
  { label: "변동성 20D", value: "1.9%" },
];

const NEWS: NewsItem[] = [
  {
    title: "HBM4 공급 협의 진전 보도 … 하반기 물량 확대 가능성",
    publisher: "연합뉴스",
    publishedAt: `${BASE_DATE}T04:30:00Z`,
    url: "#",
  },
  {
    title: "반도체 재고 조정 마무리 국면 진입 분석",
    publisher: "한국경제",
    publishedAt: `${BASE_DATE}T01:30:00Z`,
    url: "#",
  },
  {
    title: "원/달러 1,380원대 … 수출주 환율 효과 점검",
    publisher: "Reuters",
    publishedAt: "2026-07-29T05:00:00Z", // 25시간 전 → "어제"
    url: "#",
  },
];

const REPORTS: AnalystReport[] = [
  {
    title: "HBM 증설 사이클 재진입, 목표가 상향",
    publisher: "증권사 A",
    publishedAt: `${BASE_DATE}T00:20:00Z`,
    summary:
      "HBM4 양산 일정이 앞당겨지며 2027년 이익 추정치를 8% 상향한다. 메모리 가격 반등이 확인되는 구간이다.",
    opinion: "매수",
    targetFrom: 82_000,
    targetTo: 95_000,
  },
  {
    title: "파운드리 가동률 점검 — 등급 유지",
    publisher: "증권사 B",
    publishedAt: "2026-07-29T23:40:00Z",
    summary:
      "파운드리 부문 회복은 예상보다 완만하다. 다만 메모리 이익이 이를 상쇄해 기존 목표가를 유지한다.",
    opinion: "매수",
    targetFrom: 88_000,
    targetTo: 88_000,
  },
  {
    title: "커버리지 개시 — 밸류에이션 부담 점검",
    publisher: "증권사 C",
    publishedAt: "2026-07-29T02:05:00Z",
    summary:
      "주가가 12개월 선행 PBR 1.6배까지 올라 단기 밸류에이션 부담이 있다. 조정 시 분할 접근을 권고한다.",
    opinion: "중립",
    targetTo: 91_000,
  },
];

/** 005930.KS 실측 응답 기준값 (2026-08-04 조회). 단위 규약을 여기서도 지킨다:
 *  roePercent 는 ×100 한 값, dividendYieldPercent 는 공급자가 준 백분율 그대로. */
const FUNDAMENTALS: Fundamentals = {
  per: 21.06,
  pbr: 3.64,
  eps: 11_039.89,
  bps: 63_873.63,
  roePercent: 30.79,
  marketCap: 1_526_725_984_911_360,
  dividendYieldPercent: 0.57,
  dividendPerShare: 1_496,
  exDividendDate: "2026-06-29",
  nextEarningsDate: "2026-10-28",
  annual: [
    { year: 2025, revenue: 333_605_938_000_000, operatingIncome: 43_601_051_000_000, netIncome: 44_260_956_000_000 },
    { year: 2024, revenue: 300_870_903_000_000, operatingIncome: 32_725_961_000_000, netIncome: 34_451_351_000_000 },
    { year: 2023, revenue: 258_935_494_000_000, operatingIncome: 6_566_976_000_000, netIncome: 15_487_100_000_000 },
    { year: 2022, revenue: 302_231_360_000_000, operatingIncome: 43_376_630_000_000, netIncome: 55_654_077_000_000 },
  ],
  // 실측값(005930.KS). 최신 분기가 먼저다.
  quarterly: [
    { year: 2026, quarter: 1, revenue: 133_900_000_000_000, operatingIncome: 12_800_000_000_000, netIncome: 47_100_000_000_000 },
    { year: 2025, quarter: 4, revenue: 93_800_000_000_000, operatingIncome: 8_200_000_000_000, netIncome: 19_300_000_000_000 },
    { year: 2025, quarter: 3, revenue: 86_100_000_000_000, operatingIncome: 12_200_000_000_000, netIncome: 12_000_000_000_000 },
    { year: 2025, quarter: 2, revenue: 74_600_000_000_000, operatingIncome: 4_600_000_000_000, netIncome: 4_900_000_000_000 },
    { year: 2025, quarter: 1, revenue: 79_100_000_000_000, operatingIncome: 6_700_000_000_000, netIncome: 8_000_000_000_000 },
  ],
};

export const MOCK_STOCK_DETAIL: StockDetail = {
  ref: REF,
  quote: QUOTE,
  candles: CANDLES,
  metrics: METRICS,
  news: NEWS,
  reports: REPORTS,
  fundamentals: FUNDAMENTALS,
  now: `${BASE_DATE}T06:30:00Z`,
  apiNotes: [
    "build_stock_metrics",
    "fetch_market_overview_from_yfinance",
    "fetch_analyst_reports",
    "fetch_stock_fundamentals",
  ],
};
