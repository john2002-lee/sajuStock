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

/**
 * 공유 링크(`/saju/s/{shareId}`)를 연 사람이 보는 것.
 *
 * `Teaser` 와 필드가 거의 같지만 **타입을 합치지 않는다.** 이쪽은 서버가 인증 없이
 * 내려주는 투영이고, 합쳐 두면 `Teaser` 에 칸이 하나 붙는 날 그것이 공개 응답에도
 * 따라 붙는 것처럼 읽힌다. 백엔드가 `TeaserOut` 과 `SajuSharedReading` 을 갈라 둔
 * 것과 같은 이유다.
 *
 * `charCount` 가 없다 — `pillarsHangul.length` 로 나오는 값이라 새는 것은 없지만,
 * 없는 칸은 실수로 채울 수도 없다.
 */
export interface SharedReading {
  pillarsHangul: string[];
  dayMasterHangul: string;
  visibleWuxing: Record<string, number>;
  strengthVerdict: StrengthVerdict;
  summary: string;
  /** ISO 문자열. 화면이 "N일 후 만료" 를 계산하는 기준. */
  createdAt: string;
  /** 서버가 정한 보관 기간(일). 화면에 상수로 두지 않는다. */
  retentionDays: number;
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

/**
 * 결제 설정 조회의 세 가지 결말.
 *
 * ## 왜 `PaymentConfig | null` 로는 부족한가
 *
 * 예전에는 설정을 못 받으면 `null` 로 두고 **무료 경로를 그렸다.** 주석은 "팔 수
 * 없는데 버튼을 보여 주는 것보다 낫다" 고 적고 있었는데, 그 판단이 뭉쳐 버린 것이
 * 둘이다 — **서버가 "결제 꺼짐" 이라고 답한 것**과 **서버에 닿지 못한 것.**
 *
 * 앞은 서버가 실제로 알려 준 사실이라 무료로 여는 것이 맞다. 뒤는 아무것도 모르는
 * 상태다. 그런데 뭉쳐 두면 개발자 도구로 이 요청 하나만 막아도 유료 리포트가
 * 무료로 열린다 — 우연이 아니라 **누구나 재현할 수 있는 우회로**였다.
 *
 * 그래서 셋으로 가른다. 모를 때는 팔지도 주지도 않고 다시 시도하게 한다.
 */
export type PaymentState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly config: PaymentConfig }
  | { readonly status: "unreachable" };
