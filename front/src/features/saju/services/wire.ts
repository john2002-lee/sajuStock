/**
 * 백엔드 와이어 타입(snake_case) → 도메인 타입(camelCase).
 *
 * `features/stocks/services/wire.ts` 와 같은 규약이다 — 변환을 한곳에 모아 두면
 * 백엔드 필드 이름 변경이 화면 전체로 번지지 않는다.
 */

import type {
  BirthInput,
  BirthPlace,
  Conventions,
  DaYun,
  Luck,
  PillarDetail,
  ProfileDraft,
  SajuChart,
  SajuReading,
  SajuReport,
  SeUn,
  Strength,
  StrengthVerdict,
  Teaser,
} from "../model/types";

export interface WirePillarDetail {
  pillar: { gan: string; zhi: string };
  hangul: string;
  shi_shen_gan: string;
  shi_shen_zhi: string[];
  hide_gan: string[];
  na_yin: string;
  di_shi: string;
  xun_kong: string;
}

export interface WireChart {
  year: WirePillarDetail;
  month: WirePillarDetail;
  day: WirePillarDetail;
  hour: WirePillarDetail | null;
  day_master: string;
  day_master_hangul: string;
  visible_wuxing: Record<string, number>;
  solar_date: string;
  conventions: {
    zi_hour_sect: number;
    strength_algorithm_version: string;
    standard_meridian: number;
    dst_applied: boolean;
    longitude_correction_minutes: number;
    equation_of_time_minutes: number;
  };
}

export interface WireStrength {
  verdict: string;
  score: number;
  basis: {
    deuk_ryeong: boolean;
    deuk_ji: boolean;
    deuk_se: number;
    detail: string[];
  };
  algorithm_version: string;
}

export interface WireTeaser {
  pillars_hangul: string[];
  char_count: number;
  day_master_hangul: string;
  visible_wuxing: Record<string, number>;
  strength_verdict: string;
  summary: string;
}

export interface WireDaYun {
  start_age: number;
  start_year: number;
  gan_zhi: string;
  hangul: string;
  shi_shen: string;
}

export interface WireLuck {
  forward: boolean;
  start_age: number;
  da_yun: WireDaYun[];
  current_da_yun: WireDaYun | null;
  se_un: Array<{ year: number; gan_zhi: string; hangul: string }>;
  now_year: number;
}

export interface WireProfileDraft {
  risk_appetite: number;
  patience: number;
  decisiveness: number;
  loss_aversion: number;
  herd_tendency: number;
  saju_summary: string;
}

export interface WireReading {
  chart: WireChart;
  strength: WireStrength;
  teaser: WireTeaser;
  luck: WireLuck;
  profile: WireProfileDraft;
}

export interface WireReport {
  markdown: string;
  sections: Array<{ heading: string; body: string }>;
  source: "llm" | "fallback";
}

function toPillar(wire: WirePillarDetail): PillarDetail {
  return {
    pillar: { gan: wire.pillar.gan, zhi: wire.pillar.zhi },
    hangul: wire.hangul,
    shiShenGan: wire.shi_shen_gan,
    shiShenZhi: wire.shi_shen_zhi,
    hideGan: wire.hide_gan,
    naYin: wire.na_yin,
    diShi: wire.di_shi,
    xunKong: wire.xun_kong,
  };
}

function toConventions(wire: WireChart["conventions"]): Conventions {
  return {
    ziHourSect: wire.zi_hour_sect,
    strengthAlgorithmVersion: wire.strength_algorithm_version,
    standardMeridian: wire.standard_meridian,
    dstApplied: wire.dst_applied,
    longitudeCorrectionMinutes: wire.longitude_correction_minutes,
    equationOfTimeMinutes: wire.equation_of_time_minutes,
  };
}

export function toChart(wire: WireChart): SajuChart {
  return {
    year: toPillar(wire.year),
    month: toPillar(wire.month),
    day: toPillar(wire.day),
    hour: wire.hour ? toPillar(wire.hour) : null,
    dayMaster: wire.day_master,
    dayMasterHangul: wire.day_master_hangul,
    visibleWuxing: wire.visible_wuxing,
    solarDate: wire.solar_date,
    conventions: toConventions(wire.conventions),
  };
}

/**
 * 강약 판정 문자열을 좁은 유니온으로 좁힌다.
 *
 * 백엔드는 셋 중 하나만 내지만, 와이어 타입은 `string` 이라 그대로 캐스팅하면
 * 화면이 없는 값을 다루게 된다. 모르는 값은 "중화"로 떨어뜨린다 — 강약은 티저 한
 * 문장에만 쓰이고, 여기서 던지면 백엔드가 판정 이름을 하나 늘리는 것만으로 온보딩
 * 전체가 멈춘다.
 */
function toVerdict(value: string): StrengthVerdict {
  return value === "신강" || value === "신약" ? value : "중화";
}

export function toStrength(wire: WireStrength): Strength {
  return {
    verdict: toVerdict(wire.verdict),
    score: wire.score,
    basis: {
      deukRyeong: wire.basis.deuk_ryeong,
      deukJi: wire.basis.deuk_ji,
      deukSe: wire.basis.deuk_se,
      detail: wire.basis.detail,
    },
    algorithmVersion: wire.algorithm_version,
  };
}

export function toTeaser(wire: WireTeaser): Teaser {
  return {
    pillarsHangul: wire.pillars_hangul,
    charCount: wire.char_count,
    dayMasterHangul: wire.day_master_hangul,
    visibleWuxing: wire.visible_wuxing,
    strengthVerdict: toVerdict(wire.strength_verdict),
    summary: wire.summary,
  };
}

function toDaYun(wire: WireDaYun): DaYun {
  return {
    startAge: wire.start_age,
    startYear: wire.start_year,
    ganZhi: wire.gan_zhi,
    hangul: wire.hangul,
    shiShen: wire.shi_shen,
  };
}

export function toLuck(wire: WireLuck): Luck {
  const seUn: SeUn[] = wire.se_un.map((s) => ({
    year: s.year,
    ganZhi: s.gan_zhi,
    hangul: s.hangul,
  }));
  return {
    forward: wire.forward,
    startAge: wire.start_age,
    daYun: wire.da_yun.map(toDaYun),
    currentDaYun: wire.current_da_yun ? toDaYun(wire.current_da_yun) : null,
    seUn,
    nowYear: wire.now_year,
  };
}

export function toProfileDraft(wire: WireProfileDraft): ProfileDraft {
  return {
    riskAppetite: wire.risk_appetite,
    patience: wire.patience,
    decisiveness: wire.decisiveness,
    lossAversion: wire.loss_aversion,
    herdTendency: wire.herd_tendency,
    sajuSummary: wire.saju_summary,
  };
}

export function toReading(wire: WireReading): SajuReading {
  return {
    chart: toChart(wire.chart),
    strength: toStrength(wire.strength),
    teaser: toTeaser(wire.teaser),
    luck: toLuck(wire.luck),
    profile: toProfileDraft(wire.profile),
  };
}

export function toReport(wire: WireReport): SajuReport {
  return { markdown: wire.markdown, sections: wire.sections, source: wire.source };
}

export function toPlaces(wire: { places: BirthPlace[] }): BirthPlace[] {
  return wire.places;
}

/** 도메인 입력 → 백엔드 본문. 방향이 반대인 유일한 변환이다. */
export function fromBirthInput(input: BirthInput) {
  return {
    year: input.year,
    month: input.month,
    day: input.day,
    hour: input.hour,
    minute: input.minute,
    is_lunar: input.isLunar,
    is_leap_month: input.isLeapMonth,
    gender: input.gender,
    birth_place_code: input.birthPlaceCode,
  };
}
