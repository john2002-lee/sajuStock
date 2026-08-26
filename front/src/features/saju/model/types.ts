/**
 * 사주 feature 의 도메인 타입.
 *
 * 백엔드 응답(snake_case)을 그대로 쓰지 않는다 — 와이어 타입은 `services/wire.ts`
 * 에 따로 두고 여기로 옮긴다. 백엔드 필드 이름이 바뀌어도 화면이 흔들리지 않게 하는
 * 경계이며, `features/stocks/services/wire.ts` 와 같은 규약이다.
 */

/** 오행 다섯. 표시 순서이기도 하다. */
export const WUXING_KEYS = ["목", "화", "토", "금", "수"] as const;
export type WuxingKey = (typeof WUXING_KEYS)[number];

export type Gender = "M" | "F";

/** 강약 판정. 용신은 **계산하지 않으므로** 여기에 없다. */
export type StrengthVerdict = "신강" | "중화" | "신약";

export interface BirthInput {
  year: number;
  month: number;
  day: number;
  /** 시와 분은 **둘 다 있거나 둘 다 없다.** 한쪽만 주면 백엔드가 422 로 막는다. */
  hour: number | null;
  minute: number | null;
  isLunar: boolean;
  isLeapMonth: boolean;
  gender: Gender;
  birthPlaceCode: string;
}

export interface BirthPlace {
  code: string;
  label: string;
}

export interface Pillar {
  /** 천간 한자 */
  gan: string;
  /** 지지 한자 */
  zhi: string;
}

export interface PillarDetail {
  pillar: Pillar;
  /** 두 글자 한글 독음. 예: "갑자" */
  hangul: string;
  shiShenGan: string;
  shiShenZhi: string[];
  hideGan: string[];
  naYin: string;
  diShi: string;
  xunKong: string;
}

/** 이 차트에 실제로 적용된 계산 관례. "어떻게 계산했나" 안내가 읽는다. */
export interface Conventions {
  ziHourSect: number;
  strengthAlgorithmVersion: string;
  standardMeridian: number;
  dstApplied: boolean;
  longitudeCorrectionMinutes: number;
  equationOfTimeMinutes: number;
}

export interface SajuChart {
  year: PillarDetail;
  month: PillarDetail;
  day: PillarDetail;
  /** 출생 시각을 모르면 null — 그때는 여섯 글자다. */
  hour: PillarDetail | null;
  dayMaster: string;
  dayMasterHangul: string;
  /**
   * 드러난 글자의 오행 빈도. **가중치 없는 단순 집계이며 강약이 아니다** —
   * 화면에서 이 값 옆에 신강/신약을 붙여 쓰지 말 것.
   */
  visibleWuxing: Record<string, number>;
  /** 변환·보정 후 실제로 쓰인 양력 날짜 (YYYY-MM-DD) */
  solarDate: string;
  conventions: Conventions;
}

export interface StrengthBasis {
  deukRyeong: boolean;
  deukJi: boolean;
  deukSe: number;
  detail: string[];
}

export interface Strength {
  verdict: StrengthVerdict;
  score: number;
  basis: StrengthBasis;
  algorithmVersion: string;
}

export interface Teaser {
  pillarsHangul: string[];
  charCount: number;
  dayMasterHangul: string;
  visibleWuxing: Record<string, number>;
  strengthVerdict: StrengthVerdict;
  summary: string;
}

export interface DaYun {
  /** **세는나이**다 — 만 나이가 아니다 (백엔드 `domain/saju/luck.py` 주석). */
  startAge: number;
  startYear: number;
  ganZhi: string;
  hangul: string;
  shiShen: string;
}

export interface SeUn {
  year: number;
  ganZhi: string;
  hangul: string;
}

export interface Luck {
  forward: boolean;
  startAge: number;
  daYun: DaYun[];
  currentDaYun: DaYun | null;
  seUn: SeUn[];
  /** 이 결과가 "지금"으로 삼은 해. 화면이 "올해"라고 쓸 때 이 값을 쓴다. */
  nowYear: number;
}

/** 투자 성향 6축. 0~100 정규화. */
export interface ProfileAxes {
  riskAppetite: number;
  patience: number;
  decisiveness: number;
  lossAversion: number;
  herdTendency: number;
}

export interface ProfileDraft extends ProfileAxes {
  /**
   * 프로파일 화면 **표시 전용** 문장.
   *
   * 판단 화면이나 판단 요청에 절대 싣지 않는다 (통합 기획 5.7). 사주 원문이
   * 판단 경로에 닿지 않는다는 것이 이 제품의 방어 논리 전체를 떠받친다.
   */
  sajuSummary: string;
}

export interface SajuReading {
  chart: SajuChart;
  strength: Strength;
  teaser: Teaser;
  luck: Luck;
  /** 사주에서 뽑은 **초안**. 저장된 값이 아니다 — 사용자가 보정한 뒤 저장한다. */
  profile: ProfileDraft;
}

/** 6축의 화면 표시 이름과 양 끝 설명. 슬라이더가 이 표 하나를 읽는다. */
export const AXIS_META: ReadonlyArray<{
  key: keyof ProfileAxes;
  label: string;
  low: string;
  high: string;
}> = [
  { key: "riskAppetite", label: "위험 감수도", low: "안정 우선", high: "변동 감수" },
  { key: "patience", label: "보유기간 선호", low: "단기", high: "장기" },
  { key: "decisiveness", label: "결정 속도", low: "신중", high: "즉각" },
  { key: "lossAversion", label: "손실 회피", low: "덜 민감", high: "매우 민감" },
  { key: "herdTendency", label: "군중 추종", low: "독자 판단", high: "흐름 추종" },
];

export interface ReportSection {
  heading: string;
  body: string;
}

export interface SajuReport {
  markdown: string;
  sections: ReportSection[];
  /** `fallback` 이면 LLM 없이 만든 간이 리포트다. 화면이 배지를 켠다. */
  source: "llm" | "fallback";
}

/**
 * 서버가 준 결제 설정.
 *
 * 가격을 프런트 상수로 두지 않는 이유: 화면·결제 요청·승인 검증 세 곳이 반드시 같은
 * 값을 봐야 하고, 복사본이 생기면 그 셋이 어긋나는 순간이 온다.
 */
export interface PaymentConfig {
  /** 토스 키가 설정돼 있는가. 거짓이면 화면은 결제 UI 를 그리지 않는다. */
  enabled: boolean;
  price: number;
  /** 결제한 주문의 보관 기간(일). 개인정보 문구가 같은 숫자를 말한다. */
  retention_days: number;
}
