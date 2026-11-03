// 관심종목 목 데이터. 백엔드 저장소가 생기면 삭제된다.

import type { WatchItem, Watchlist } from "./types";

/** 시드 고정 — 3개월 스파크라인 104×28 */
function spark(seed: number, changePercent: number, length = 60): number[] {
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const drift = changePercent / length;
  const points: number[] = [];
  let level = 100;
  for (let i = 0; i < length; i += 1) {
    level += drift + (next() - 0.5) * 1.3;
    points.push(level);
  }
  return points;
}

const ITEMS: WatchItem[] = [
  {
    name: "삼성전자",
    nameEn: "Samsung Electronics",
    code: "005930",
    symbol: "005930.KS",
    market: "KOSPI",
    group: "코어",
    price: 71_400,
    changePercent: 1.42,
    spark: spark(5930, 10.19),
    holding: { quantity: 120, avgPrice: 64_800 },
    alert: { enabled: true, condition: "75,000원 도달 시" },
    verdict: "비중 확대",
  },
  {
    name: "SK하이닉스",
    nameEn: "SK hynix",
    code: "000660",
    symbol: "000660.KS",
    market: "KOSPI",
    group: "코어",
    price: 198_300,
    changePercent: 2.86,
    spark: spark(660, 12.54),
    holding: { quantity: 18, avgPrice: 176_200 },
    alert: { enabled: true, condition: "MA20 이탈 시" },
    verdict: "유지",
  },
  {
    name: "한미반도체",
    nameEn: "Hanmi Semiconductor",
    code: "042700",
    symbol: "042700.KS",
    market: "KOSPI",
    group: "관찰",
    price: 112_700,
    changePercent: 8.42,
    spark: spark(42700, 24.1),
    alert: { enabled: true, condition: "거래량 2배 급증" },
    verdict: "과열 주의",
  },
  {
    name: "에코프로",
    nameEn: "Ecopro",
    code: "086520",
    symbol: "086520.KQ",
    market: "KOSDAQ",
    group: "2차전지",
    price: 104_200,
    changePercent: -1.05,
    spark: spark(86520, -12.0),
    holding: { quantity: 30, avgPrice: 118_400 },
    alert: { enabled: true, condition: "없음" },
    verdict: "관망",
  },
  {
    name: "에코프로비엠",
    nameEn: "Ecopro BM",
    code: "247540",
    symbol: "247540.KQ",
    market: "KOSDAQ",
    group: "2차전지",
    price: 158_400,
    changePercent: -3.94,
    spark: spark(247540, -16.2),
    alert: { enabled: true, condition: "150,000원 이탈 시" },
    verdict: "관망",
  },
  {
    name: "Apple",
    nameEn: "Apple Inc.",
    code: "AAPL",
    symbol: "AAPL",
    market: "NASDAQ",
    group: "해외",
    price: 226.4,
    changePercent: -0.32,
    spark: spark(1001, 14.28),
    holding: { quantity: 12, avgPrice: 198.1 },
    alert: { enabled: true, condition: "실적 발표일" },
    verdict: "유지",
  },
];

export const MOCK_WATCHLIST: Watchlist = {
  items: ITEMS,
  // 시안의 카운트(18 종목 · 5 그룹)는 전체 계정 기준이고,
  // 목 데이터에는 대표 6건만 담았다.
  groups: [
    { name: "전체", count: 18 },
    { name: "코어", count: 5 },
    { name: "2차전지", count: 4 },
    { name: "관찰", count: 6 },
    { name: "해외", count: 3 },
  ],
  totalCount: 18,
  groupCount: 5,
  activeAlerts: 7,
  totalReturnPercent: 4.82,
};
