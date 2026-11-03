// 시장 현황 도메인 타입. 백엔드 GET /markets/overview (명세 6.1) 대응.

// `RankedStock` 만 services 쪽에 산다 — 이 feature 의 랭킹 타입이 처음부터 거기
// 정의됐고 browse 컴포넌트 셋이 이미 그렇게 가져다 쓴다. 타입 전용 import 라
// 런타임 의존은 없다. 옮기려면 그 셋을 함께 고쳐야 해서 지금 범위 밖에 둔다.
import type { RankedStock } from "../services/getStockRanking";

export interface MarketIndex {
  /** KOSPI / USD/KRW */
  name: string;
  /** 코스피 / 환율 — 카드 우상단 캡션 */
  label: string;
  /**
   * 왜 이 지표를 보는지 한 줄. 홈의 뒤 넷(반도체·나스닥100·유가·금)에만 붙는다 —
   * 코스피·코스닥은 설명이 필요 없고, 카드마다 문장을 달면 그 자체가 소음이다.
   */
  note?: string;
  value: number;
  change: number;
  changePercent: number;
  /** 소수 자릿수 */
  digits: number;
  /** 카드 영역 스파크라인 원본 값 */
  spark: number[];
}

/** 상승률·하락률 상위 1행 */
export interface Mover {
  name: string;
  /**
   * 영문 상호. 백엔드 상장사 목록은 KRX 한글명만 갖고 있어 실데이터에서는 비고,
   * 목 데이터에만 채워진다 — 있을 때만 코드 옆에 덧붙인다.
   */
  nameEn?: string;
  code: string;
  price: number;
  changePercent: number;
  spark: number[];
}

/** 오늘의 일정 한 줄. 종목이 아니라 **일정 하나**를 가리킨다 — 같은 종목이 두 줄일 수 있다. */
export interface CalendarEvent {
  name: string;
  code: string;
  board: "KOSPI" | "KOSDAQ" | null;
  kind: "earnings" | "ex_dividend";
  /** YYYY-MM-DD */
  date: string;
  /** 오늘까지 남은 일수. 0 이면 오늘 */
  dDay: number;
}

/** 홈의 '오늘의 일정' 블록에 필요한 전부 */
export interface CalendarBlock {
  events: CalendarEvent[];
  /** 조회 창 (오늘부터 며칠) */
  days: number;
  /**
   * 일정이 채워진 종목 수 / 배치 모집단.
   *
   * 이걸 화면에 쓰는 이유가 있다. 배치는 하루 200종목씩 며칠에 걸쳐 채우므로, 초기에는
   * **일정이 없는 것**과 **아직 안 물어본 것**이 똑같이 빈 목록으로 보인다. 구분하지
   * 않으면 "이번 주 실적발표 없음" 이라는 거짓말이 된다.
   */
  covered: number;
  universeSize: number;
  /** 배치가 마지막으로 돈 날 (YYYY-MM-DD). 한 번도 안 돌았으면 null */
  asOf: string | null;
}

export interface MarketOverview {
  category: string;
  indices: MarketIndex[];
  /** ISO */
  asOf: string;
}

/** 홈 한 화면이 쓰는 전부 */
export interface MarketHome {
  /**
   * 등락 상위가 예시 데이터인지. 화면에서 '예시' 뱃지를 붙이는 근거다.
   *
   * 전에는 `sampleSections: SampleSection[]` 였다 — 업종·뉴스가 목이던 시절엔
   * 목록이 필요했지만, 그 둘을 걷어낸 뒤로는 예시가 될 수 있는 블록이 등락 상위
   * 하나뿐이라(랭킹 스냅샷 워밍업 전) 불리언이 정직하다.
   */
  moversAreSample: boolean;
  indices: MarketIndex[];
  /**
   * 시가총액 상위 몇 줄. 등락률(오늘 얼마나 움직였나)과 겹치지 않는 **규모 축**이고,
   * 진입 밴드의 "큰 회사부터" 타일이 링크만 주던 자리를 채운다.
   */
  topByCap: RankedStock[];
  /** 그 목록의 모집단 캡션. `moversScope` 와 같은 이유로 백엔드 값을 그대로 쓴다 */
  topByCapScope: string;
  gainers: Mover[];
  losers: Mover[];
  /**
   * 등락 상위 목록의 모집단 캡션. 백엔드가 실제로 스캔한 범위를 그대로 받는다
   * ("시가총액 상위 200종목") — 화면에 "KOSPI+KOSDAQ" 을 박아 두면 전 종목을
   * 훑은 것처럼 읽힌다.
   */
  moversScope: string;
  /**
   * 오늘의 일정. 조회에 실패하면 null 이다 — **목 데이터로 대체하지 않는다.**
   * 등락률과 달리 사람이 보고 일정을 잡는 날짜라, 예시 값을 섞으면 그건 틀린 사실이
   * 화면에 뜨는 것이다.
   */
  calendar: CalendarBlock | null;
  /** ISO */
  asOf: string;
  apiNotes: string[];
}
