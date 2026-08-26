// 종목 자동완성 도메인 타입.

import type { Market } from "@/shared/types";

/** 입력 모드 — 쿼리에서 도출한다 (사용자가 고르는 값이 아니다) */
export type SearchMode = "name" | "initials" | "code";

export type SuggestionGroupKey = "name" | "recent" | "code";

/**
 * 자동완성 후보 한 건.
 *
 * 백엔드 `StockSuggestion` 은 {symbol, name, market, initial_consonants} 뿐이다.
 * `nameEn` 은 목에만 있는 표시 항목이라 선택 필드로 남는다.
 *
 * ## 시세 필드를 두지 않는다
 *
 * `price` · `changePercent` · `spark` 가 선택 필드로 있었고 목 데이터에만 채워졌다.
 * 이 셋은 **실 모드에서 영영 채워지지 않는다** — 자동완성 한 번에 N종목의 시세를
 * 얻으려면 종목마다 상류를 불러야 해서 비현실적이다.
 *
 * 그 사이 화면(`SymbolNotResolved`)은 값이 있으면 원화·등락색으로 그리고 있었다.
 * 즉 **오직 가짜만 담길 수 있는 칸을 진짜 서식으로 렌더**하고 있었다. 선택 필드로
 * 남겨 두면 다음 사람이 같은 자리를 다시 그리므로 타입에서 지운다 — 시세가 필요한
 * 화면은 종목 상세로 가고, 그쪽은 실제 응답을 쓴다.
 */
export interface Suggestion {
  /** 삼성전자 */
  name: string;
  nameEn?: string;
  /** 005930 — 라우팅에 쓰는 코드 */
  code: string;
  /** 005930.KS — 정규화 심볼 */
  symbol: string;
  market: Market;
  /** ㅅㅅㅈㅈ */
  initials: string;
  /** 이름에서 매칭된 구간 [시작, 끝) — 하이라이트용. 없으면 undefined */
  match?: [number, number];
}

export interface SuggestionGroup {
  key: SuggestionGroupKey;
  label: string;
  /** 대응 백엔드 메서드 (개발 참고용, 프로덕션에서는 제거 가능) */
  note: string;
  items: Suggestion[];
}

export interface SuggestionResponse {
  query: string;
  mode: SearchMode;
  groups: SuggestionGroup[];
  total: number;
  /** 서버 소요 시간(ms) — 하단 "결과 8건 · 0.42s" */
  elapsedMs: number;
}

/** 목록 수집 경로. KRX 실패 → KIND → 내부 기본 목록 순으로 내려간다 */
export type ListedSource = "KRX" | "KIND" | "INTERNAL";

export type SourceState = "사용" | "실패" | "대기";

export interface SourceStep {
  /** KRX CSV / KIND 목록 / 내부 기본 종목 */
  label: string;
  source: ListedSource;
  state: SourceState;
}

/** ensure_listed_companies 진행 상태 → 첫 호출 지연 배너 · 폴백 경고 */
export interface ListedCompaniesStatus {
  ready: boolean;
  loaded: number;
  total: number;
  /** 실제로 쓰인 경로 */
  source: ListedSource;
  /** 3단 파이프라인의 각 단계 상태 (1d 폴백 패널) */
  steps: SourceStep[];
}

export const SOURCE_LABELS: Record<ListedSource, string> = {
  KRX: "KRX CSV",
  KIND: "KIND 목록",
  INTERNAL: "내부 기본 종목",
};
