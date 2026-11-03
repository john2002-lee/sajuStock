// 도메인 Candle → lightweight-charts 시리즈 데이터 변환. 순수 함수.
//
// 라이브러리는 시간 오름차순·중복 없는 데이터를 요구한다. 어긋나면 조용히
// 아무것도 그리지 않는 게 아니라 예외를 던지므로, 정렬·중복 제거를 여기서 끝낸다.

import type { Candle, CrossSignal } from "./types";

/** lightweight-charts 의 BusinessDay 문자열 형식 ("2026-07-31") */
export type ChartTime = string;

export interface CandlePoint {
  time: ChartTime;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LinePoint {
  time: ChartTime;
  value: number;
}

export interface VolumePoint extends LinePoint {
  color: string;
}

export interface BandPoint {
  time: ChartTime;
  /** 밴드 하단 (base) */
  value: number;
}

export interface CrossPoint {
  time: ChartTime;
  type: CrossSignal;
  price: number;
}

/** 오름차순 정렬 + 같은 날짜 중복 제거 (뒤에 온 값을 남긴다). */
export function normalize(candles: Candle[]): Candle[] {
  const byDate = new Map<string, Candle>();
  for (const candle of candles) {
    if (!candle.date) continue;
    // 날짜만 남긴다 — 백엔드가 ISO 전체를 줄 수도 있다.
    byDate.set(candle.date.slice(0, 10), { ...candle, date: candle.date.slice(0, 10) });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function toCandlePoints(candles: Candle[]): CandlePoint[] {
  return candles.map((c) => ({
    time: c.date,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}

/** null 구간(이동평균 워밍업)은 점을 만들지 않는다 — 0으로 채우면 선이 바닥에 붙는다. */
export function toLinePoints(
  candles: Candle[],
  pick: (candle: Candle) => number | null,
): LinePoint[] {
  const points: LinePoint[] = [];
  for (const candle of candles) {
    const value = pick(candle);
    if (value === null || value === undefined || Number.isNaN(value)) continue;
    points.push({ time: candle.date, value });
  }
  return points;
}

/** 거래량 서브차트. 상승봉/하락봉 색을 따라간다. */
export function toVolumePoints(
  candles: Candle[],
  upColor: string,
  downColor: string,
): VolumePoint[] {
  return candles.map((c) => ({
    time: c.date,
    value: c.volume,
    color: c.close >= c.open ? upColor : downColor,
  }));
}

/**
 * 볼린저밴드 면.
 *
 * lightweight-charts 에는 두 선 사이를 칠하는 시리즈가 없다. 그래서 상단선을
 * Area 로 그리고 하단선을 배경색 Area 로 덮어 밴드처럼 보이게 한다 —
 * 상·하단 값이 모두 있는 구간만 내보내야 덮개가 어긋나지 않는다.
 */
export function toBandPoints(candles: Candle[]): {
  upper: LinePoint[];
  lower: LinePoint[];
} {
  const upper: LinePoint[] = [];
  const lower: LinePoint[] = [];
  for (const candle of candles) {
    if (candle.bbUpper === null || candle.bbLower === null) continue;
    upper.push({ time: candle.date, value: candle.bbUpper });
    lower.push({ time: candle.date, value: candle.bbLower });
  }
  return { upper, lower };
}

/** 골든/데드크로스 지점. 마커는 캔들 시리즈에 붙인다. */
export function toCrossPoints(candles: Candle[]): CrossPoint[] {
  return candles
    .filter((c) => c.cross !== null)
    .map((c) => ({
      time: c.date,
      type: c.cross as CrossSignal,
      price: c.close,
    }));
}

/** 프리셋이 요구하는 표시 봉 수. README: 휠 줌 범위 18~240 바. */
export const RANGE_PRESETS = [
  { key: "1M", label: "1M", bars: 22 },
  { key: "3M", label: "3M", bars: 66 },
  { key: "6M", label: "6M", bars: 132 },
  { key: "1Y", label: "1Y", bars: 248 },
] as const;

export type RangePresetKey = (typeof RANGE_PRESETS)[number]["key"];

export const MIN_BARS = 18;
export const MAX_BARS = 240;
