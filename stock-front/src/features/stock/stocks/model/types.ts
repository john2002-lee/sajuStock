// 종목 상세 도메인 타입.
//
// 백엔드 app/schemas/stock.py 와 필드 의미를 1:1로 맞추되 이름은 camelCase 로 둔다.
// snake_case 응답 → 이 타입 변환은 services/ 가 담당한다. 컴포넌트는 백엔드 응답
// 형태를 알지 못한다.

import type { Currency, Market } from "@/shared/types";

export type CrossSignal = "golden" | "dead";

/** 정규화된 종목 식별자 (백엔드 6.1) */
export interface StockRef {
  /** 삼성전자 */
  name: string;
  /** Samsung Electronics Co., Ltd. */
  nameEn?: string;
  /** 005930 — URL 에 쓰는 사람이 읽는 코드 */
  code: string;
  /** 005930.KS — krx_symbol_to_yfinance 결과 */
  symbol: string;
  market: Market;
  sector?: string;
}

/**
 * OHLCV 한 봉 + 보조지표. 백엔드 StockRow 대응.
 *
 * ma60 은 현재 백엔드에 없다 (StockRow 는 sma5/sma20 만 제공).
 * 디자인이 MA20/MA60 2선을 요구하므로 백엔드에 sma60 추가가 필요하다.
 * 지표 계산은 백엔드 소유이므로 프런트에서 재계산하지 않는다.
 */
export interface Candle {
  /** ISO date */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma20: number | null;
  ma60: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  cross: CrossSignal | null;
}

/** 헤드라인 우측 현재가 블록 */
export interface Quote {
  price: number;
  /** 전일 대비 금액 */
  change: number;
  changePercent: number;
  currency: Currency;
  /** ISO */
  asOf: string;
  session: "regular" | "closed" | "pre" | "post";
}

/**
 * 투자 지표 1행. 값은 백엔드가 소유하므로 표시 문자열로 받는다.
 *
 * per / pbr 같은 고정 필드로 두지 않는 이유: 6행의 타입이 제각각이고
 * (퍼센트 · 배율 · "상승 전환" 같은 문자열 · % 위치), 백엔드가 지표를 하나
 * 추가할 때마다 프런트 타입과 컴포넌트를 같이 고쳐야 하기 때문이다.
 */
export interface Metric {
  label: string;
  value: string;
  accent?: "up" | "down";
}

/** 연간 손익 한 해분. 백엔드 AnnualFinancial 대응 */
export interface AnnualFinancial {
  /** 2025 — 회계연도 */
  year: number;
  /** 매출액. 원/달러 원단위 raw — 표시 단위는 컴포넌트가 고른다 */
  revenue: number | null;
  operatingIncome: number | null;
  /** 당기순이익(지배주주). 공급자가 안 주면 null — 0 이 아니다 */
  netIncome: number | null;
}

/**
 * 분기 손익 한 분기분. 백엔드 `QuarterlyFinancial` 대응.
 *
 * `AnnualFinancial` 과 **같은 타입을 쓰지 않는다** — 저쪽은 `year` 하나로 행을
 * 식별하는데 분기는 한 해에 넷이라 그걸로 구분할 수 없다.
 */
export interface QuarterlyFinancial {
  year: number;
  /** 1~4. 백엔드가 분기 말일의 월에서 유도한다 */
  quarter: number;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
}

/**
 * 재무·밸류에이션. 백엔드 StockFundamentals 대응.
 *
 * 위 Metric 과 달리 표시 문자열이 아니라 값으로 받는다. Metric 이 label/value
 * 문자열인 이유는 "지표 목록이 자주 바뀌고 값 타입이 제각각"이어서인데, 재무 항목은
 * 그 두 조건이 모두 아니다 — PER·PBR·EPS 는 백엔드가 하나씩 늘려가는 목록이 아니라
 * 고정된 회계 개념이고, 행마다 단위가 달라(조·억 / 배 / % / 날짜) 미리 문자열로
 * 굳히면 포맷을 고를 수 없다.
 *
 * 모든 값이 null 일 수 있다. 공급자가 국내 종목에서 항목별로 구멍을 낸다.
 */
export interface Fundamentals {
  per: number | null;
  pbr: number | null;
  /** 국내 종목은 `현재가 ÷ PER` 역산값이다 (공시 EPS 가 아니다) */
  eps: number | null;
  /** 국내 종목은 `현재가 ÷ PBR` 역산값이다 */
  bps: number | null;
  /** 30.79 = 30.79% */
  roePercent: number | null;
  marketCap: number | null;
  /** 0.57 = 0.57% */
  dividendYieldPercent: number | null;
  dividendPerShare: number | null;
  /** YYYY-MM-DD */
  exDividendDate: string | null;
  /** YYYY-MM-DD. 공급자 추정치일 수 있다 */
  nextEarningsDate: string | null;
  /** 최신 회계연도부터 내림차순 */
  annual: AnnualFinancial[];
  /** 최신 분기부터 내림차순, 최대 5분기. 공급자가 안 주면 빈 배열 */
  quarterly: QuarterlyFinancial[];
}

/** 백엔드 NewsItem 대응 */
export interface NewsItem {
  title: string;
  publisher: string;
  /** ISO */
  publishedAt: string;
  /**
   * 백엔드 스키마가 `url: str = ""` 라 링크가 없는 기사가 온다.
   * `string` 으로 두면 빈 문자열이 타입상 '있는 값'이 되어 href="" 가 렌더되고,
   * 그건 현재 페이지 재요청이라 클릭 시 전체 리로드가 난다. 옵셔널로 좁힌다.
   */
  url?: string;
  /** og:image. 마찬가지로 빈 문자열은 어댑터에서 undefined 로 접는다 */
  thumbnail?: string;
}

/**
 * 백엔드 AnalystReport 대응.
 *
 * opinion / targetFrom / targetTo 는 백엔드에 없다 — 디자인의 우측 레일
 * "리포트 요약"이 요구하는 필드다. 실 API 연결 시 백엔드 확장이 필요하다.
 */
export interface AnalystReport {
  title: string;
  publisher: string;
  publishedAt: string;
  summary: string;
  url?: string;
  opinion?: "매수" | "중립" | "매도";
  targetFrom?: number;
  targetTo?: number;
}

/** page.tsx 가 받는 단일 뭉치 */
export interface StockDetail {
  ref: StockRef;
  quote: Quote;
  candles: Candle[];
  metrics: Metric[];
  news: NewsItem[];
  reports: AnalystReport[];
  /** 재무 탭·우측 밸류에이션. 조회 실패·미지원 종목이면 null (화면은 빈 상태로 남는다) */
  fundamentals: Fundamentals | null;
  /** 서버가 상대시각을 계산하는 기준 시각 (ISO) — 하이드레이션 불일치 방지 */
  now: string;
  /** 이 화면이 소비하는 백엔드 메서드 — 우측 레일 API 메모 */
  apiNotes: string[];
}
