// 자동완성 목 유니버스. 백엔드 /stocks/suggestions 가 붙으면 삭제된다.
//
// **시세를 담지 않는다.** 실 모드의 자동완성은 종목명·코드·시장만 받는다
// (`model/types.ts` 의 `Suggestion` 주석). 목에만 있는 가격을 들고 있으면 그것을
// 그리는 화면이 생기고, 그 화면은 목 모드에서 **진짜처럼 보이는 숫자**를 낸다 —
// 실제로 '후보 고르기' 화면이 그렇게 되어 있었다. 스파크라인도 같은 이유로 없앴다.

import { initialConsonants } from "./match";
import type { Suggestion } from "./types";

const SEEDS: Omit<Suggestion, "initials">[] = [
  { name: "삼성전자", nameEn: "Samsung Electronics", code: "005930", symbol: "005930.KS", market: "KOSPI" },
  { name: "삼성전자우", nameEn: "Samsung Elec. Pref.", code: "005935", symbol: "005935.KS", market: "KOSPI" },
  { name: "삼성SDI", nameEn: "Samsung SDI", code: "006400", symbol: "006400.KS", market: "KOSPI" },
  { name: "삼성바이오로직스", nameEn: "Samsung Biologics", code: "207940", symbol: "207940.KS", market: "KOSPI" },
  { name: "삼성전기", nameEn: "Samsung Electro-Mechanics", code: "009150", symbol: "009150.KS", market: "KOSPI" },
  { name: "SK하이닉스", nameEn: "SK hynix", code: "000660", symbol: "000660.KS", market: "KOSPI" },
  { name: "에코프로", nameEn: "Ecopro", code: "086520", symbol: "086520.KQ", market: "KOSDAQ" },
  { name: "카카오", nameEn: "Kakao", code: "035720", symbol: "035720.KS", market: "KOSPI" },
  { name: "네이버", nameEn: "NAVER", code: "035420", symbol: "035420.KS", market: "KOSPI" },
  { name: "애플", nameEn: "Apple Inc.", code: "AAPL", symbol: "AAPL", market: "NASDAQ" },
  { name: "엔비디아", nameEn: "NVIDIA", code: "NVDA", symbol: "NVDA", market: "NASDAQ" },
  { name: "테슬라", nameEn: "Tesla", code: "TSLA", symbol: "TSLA", market: "NASDAQ" },
];

export const MOCK_UNIVERSE: Suggestion[] = SEEDS.map((item) => ({
  ...item,
  initials: initialConsonants(item.name),
}));

export function findByCode(code: string): Suggestion | undefined {
  return MOCK_UNIVERSE.find((item) => item.code === code);
}

/**
 * ensure_listed_companies 진행 시뮬레이션.
 * 서버 기동 후 첫 8초 동안 "준비 중"으로 응답한다.
 */
export const LISTED_TOTAL = 2_614;
export const LISTED_WARMUP_MS = 8_000;
