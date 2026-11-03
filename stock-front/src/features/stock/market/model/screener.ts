// 조건 검색(/stocks/screener)의 상태·프리셋·링크 계산.
//
// 랭킹 화면(model/ranking.ts)과 같은 자세다 — **URL 이 곧 상태**이고, 검증되지 않은
// 문자열이 백엔드 쿼리에 실리지 않도록 그 경계를 여기서 막는다.
//
// ## URL 에 숫자가 아니라 **프리셋 이름**이 실린다
//
// `?per=low` 이지 `?per_min=0&per_max=10` 이 아니다. 셋 다 이유가 있다.
//
//   1. 주소가 읽힌다. 공유된 링크를 보고 무슨 목록인지 알 수 있다.
//   2. 임의의 숫자가 들어올 자리가 없다. 열거에 없는 값은 기본값으로 떨어진다.
//   3. **경계값을 한 곳에서 소유한다.** 'PER 10 이하' 가 실제로 어떤 범위인지는
//      아래 표 하나에만 적혀 있고, 화면·링크·API 호출이 전부 그것을 읽는다.
//
// 자유 입력(숫자 직접 입력)은 일부러 넣지 않았다. 그러려면 클라이언트 상태와 폼이
// 필요해 이 화면 전체가 브라우저로 내려가는데, 조건 검색에서 실제로 쓰이는 구간은
// 몇 개 되지 않는다. 먼저 프리셋으로 쓰이는 것을 보고 필요하면 그때 연다.

import type { FilterOption } from "./filters";
import type { RankingBoard } from "./ranking";
import { BOARD_LABELS, RANKING_BOARDS } from "./ranking";

export { BOARD_LABELS, RANKING_BOARDS };
export type { RankingBoard };

/** 백엔드가 받는 조건. `back/app/schemas/market.py : ScreenerQuery` 와 1:1 이다. */
export interface ScreenerBounds {
  market_cap_min?: number;
  market_cap_max?: number;
  per_min?: number;
  per_max?: number;
  pbr_min?: number;
  pbr_max?: number;
  dividend_min?: number;
  roe_min?: number;
}

interface Preset<Key extends string> {
  value: Key;
  label: string;
  bounds: ScreenerBounds;
}

const 조 = 1e12;
const 억 = 1e8;

export const CAP_PRESETS = [
  { value: "all", label: "전체", bounds: {} },
  { value: "large", label: "1조 이상", bounds: { market_cap_min: 1 * 조 } },
  {
    value: "mid",
    label: "1천억~1조",
    bounds: { market_cap_min: 1000 * 억, market_cap_max: 1 * 조 },
  },
  { value: "small", label: "1천억 미만", bounds: { market_cap_max: 1000 * 억 } },
] as const satisfies readonly Preset<string>[];

/**
 * PER 구간. **하한 0 이 장식이 아니다.**
 *
 * PER 은 순손실이면 음수가 된다. 'PER 10 이하' 를 상한만으로 만들면 PER −3 인
 * 적자 회사가 "가장 싼 종목" 으로 목록 맨 앞에 온다 — 숫자상 맞고 투자 판단으로는
 * 완전히 틀린, 스크리너의 고전적인 함정이다. 백엔드 테스트가 이 동작을 고정해 두고
 * 있으니(`test_screener.test_negative_per_is_not_the_cheapest_stock`) 하한을 지운다면
 * 그 테스트부터 읽는다.
 */
export const PER_PRESETS = [
  { value: "all", label: "전체", bounds: {} },
  { value: "low", label: "10배 이하", bounds: { per_min: 0, per_max: 10 } },
  { value: "mid", label: "10~20배", bounds: { per_min: 10, per_max: 20 } },
  { value: "high", label: "20배 이상", bounds: { per_min: 20 } },
] as const satisfies readonly Preset<string>[];

/** PBR 은 음수가 되지 않지만(자본이 음수면 공급자가 값을 주지 않는다) 형태를 맞춘다. */
export const PBR_PRESETS = [
  { value: "all", label: "전체", bounds: {} },
  { value: "low", label: "1배 이하", bounds: { pbr_min: 0, pbr_max: 1 } },
  { value: "mid", label: "1~2배", bounds: { pbr_min: 1, pbr_max: 2 } },
  { value: "high", label: "2배 이상", bounds: { pbr_min: 2 } },
] as const satisfies readonly Preset<string>[];

export const DIV_PRESETS = [
  { value: "all", label: "전체", bounds: {} },
  { value: "some", label: "2% 이상", bounds: { dividend_min: 2 } },
  { value: "high", label: "4% 이상", bounds: { dividend_min: 4 } },
] as const satisfies readonly Preset<string>[];

export const ROE_PRESETS = [
  { value: "all", label: "전체", bounds: {} },
  { value: "good", label: "10% 이상", bounds: { roe_min: 10 } },
  { value: "great", label: "20% 이상", bounds: { roe_min: 20 } },
] as const satisfies readonly Preset<string>[];

export type CapPreset = (typeof CAP_PRESETS)[number]["value"];
export type PerPreset = (typeof PER_PRESETS)[number]["value"];
export type PbrPreset = (typeof PBR_PRESETS)[number]["value"];
export type DivPreset = (typeof DIV_PRESETS)[number]["value"];
export type RoePreset = (typeof ROE_PRESETS)[number]["value"];

export const SCREENER_SORTS = [
  "market_cap",
  "per",
  "pbr",
  "dividend_yield",
  "roe",
] as const;
export type ScreenerSort = (typeof SCREENER_SORTS)[number];

/** 라벨이 방향을 말한다 — 방향은 축이 정하고 사용자가 뒤집지 않는다. */
export const SCREENER_SORT_LABELS: Record<ScreenerSort, string> = {
  market_cap: "시가총액순",
  per: "PER 낮은 순",
  pbr: "PBR 낮은 순",
  dividend_yield: "배당수익률순",
  roe: "ROE 높은 순",
};

/** 이 화면의 상태 전부. searchParams 와 1:1 이다. */
export interface ScreenerQuery {
  board: RankingBoard;
  cap: CapPreset;
  per: PerPreset;
  pbr: PbrPreset;
  div: DivPreset;
  roe: RoePreset;
  sort: ScreenerSort;
}

/** 조건 검색 한 페이지 종목 수. 백엔드 상한(100) 안이다. */
export const SCREENER_PAGE_SIZE = 50;

const DEFAULTS: ScreenerQuery = {
  board: "ALL",
  cap: "all",
  per: "all",
  pbr: "all",
  div: "all",
  roe: "all",
  sort: "market_cap",
};

function parseOne<Value extends string>(
  allowed: readonly Value[],
  value: string | undefined,
  fallback: Value,
): Value {
  return allowed.includes(value as Value) ? (value as Value) : fallback;
}

const values = <T extends readonly Preset<string>[]>(presets: T) =>
  presets.map((preset) => preset.value) as unknown as readonly T[number]["value"][];

/**
 * searchParams 한 벌을 검증된 상태로.
 *
 * 모르는 값은 조용히 기본값으로 떨어뜨린다 — 오래된 북마크나 잘못 누른 링크로 들어온
 * 사람에게 오류 화면을 주는 것보다 기본 목록을 보여주는 편이 낫다 (`parseSort` 와 같은 판단).
 */
export function parseScreenerQuery(params: {
  board?: string;
  cap?: string;
  per?: string;
  pbr?: string;
  div?: string;
  roe?: string;
  sort?: string;
}): ScreenerQuery {
  return {
    board: parseOne(RANKING_BOARDS, params.board, DEFAULTS.board),
    cap: parseOne(values(CAP_PRESETS), params.cap, DEFAULTS.cap),
    per: parseOne(values(PER_PRESETS), params.per, DEFAULTS.per),
    pbr: parseOne(values(PBR_PRESETS), params.pbr, DEFAULTS.pbr),
    div: parseOne(values(DIV_PRESETS), params.div, DEFAULTS.div),
    roe: parseOne(values(ROE_PRESETS), params.roe, DEFAULTS.roe),
    sort: parseOne(SCREENER_SORTS, params.sort, DEFAULTS.sort),
  };
}

function boundsOf<T extends readonly Preset<string>[]>(
  presets: T,
  value: string,
): ScreenerBounds {
  return presets.find((preset) => preset.value === value)?.bounds ?? {};
}

/**
 * 프리셋 이름 → 백엔드가 받는 숫자 경계.
 *
 * 같은 컬럼을 두 프리셋이 건드리는 조합은 없다(축마다 컬럼이 하나다). 그래서 단순
 * 병합으로 충분하고, 축을 추가하며 그 전제가 깨지면 여기가 먼저 이상해진다.
 */
export function screenerBounds(query: ScreenerQuery): ScreenerBounds {
  return {
    ...boundsOf(CAP_PRESETS, query.cap),
    ...boundsOf(PER_PRESETS, query.per),
    ...boundsOf(PBR_PRESETS, query.pbr),
    ...boundsOf(DIV_PRESETS, query.div),
    ...boundsOf(ROE_PRESETS, query.roe),
  };
}

/** 조건이 하나라도 걸려 있는가. 빈 결과를 어떻게 설명할지 화면이 이걸로 가른다. */
export function hasAnyCondition(query: ScreenerQuery): boolean {
  return (
    query.board !== DEFAULTS.board ||
    query.cap !== DEFAULTS.cap ||
    query.per !== DEFAULTS.per ||
    query.pbr !== DEFAULTS.pbr ||
    query.div !== DEFAULTS.div ||
    query.roe !== DEFAULTS.roe
  );
}

export const SCREENER_PATH = "/stocks/screener";

/** 조건 칩이 거는 링크. 현재 조건에서 한 축만 바꾼다. */
export function screenerHref(
  current: ScreenerQuery,
  patch: Partial<ScreenerQuery>,
): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  // 기본값은 URL 에 싣지 않는다 — 같은 화면인데 주소만 다르면 공유·뒤로가기가
  // 지저분해진다 (rankingHref 와 같은 규칙).
  for (const key of Object.keys(DEFAULTS) as (keyof ScreenerQuery)[]) {
    if (next[key] !== DEFAULTS[key]) params.set(key, next[key]);
  }

  const query = params.toString();
  return query ? `${SCREENER_PATH}?${query}` : SCREENER_PATH;
}

/**
 * 조건은 그대로 두고 페이지만 바꾸는 링크. 페이지네이션이 쓴다.
 *
 * 위 `screenerHref` 가 페이지를 싣지 않으므로, **조건을 하나라도 바꾸면 1페이지로
 * 돌아간다** — 의도한 동작이다 (`model/paging` 주석).
 */
export function screenerPageHref(current: ScreenerQuery, page: number): string {
  const base = screenerHref(current, {});
  if (page <= 1) return base;
  return base.includes("?") ? `${base}&page=${page}` : `${base}?page=${page}`;
}

/** 조건 칩 하나가 필요로 하는 것 전부. 모양은 `model/filters` 가 소유한다. */
export type ScreenerFilterOption<Value extends string> = FilterOption<Value>;

function optionsFor<Key extends keyof ScreenerQuery>(
  axis: Key,
  presets: readonly { value: string; label: string }[],
  current: ScreenerQuery,
): ScreenerFilterOption<string>[] {
  return presets.map((preset) => ({
    value: preset.value,
    label: preset.label,
    href: screenerHref(current, { [axis]: preset.value } as Partial<ScreenerQuery>),
    selected: current[axis] === preset.value,
  }));
}

/**
 * 필터 바가 그릴 축 전부. 컴포넌트는 이 배열을 돌기만 한다.
 *
 * 축이 여섯이라 컴포넌트에서 하나씩 조립하면 같은 여섯 줄이 반복된다 — 그때 축
 * 하나의 링크 계산만 어긋나도 눈으로는 찾을 수 없다.
 */
export function screenerAxes(current: ScreenerQuery) {
  return [
    { key: "board", label: "시장", options: optionsFor("board", boardPresets(), current) },
    { key: "cap", label: "시가총액", options: optionsFor("cap", CAP_PRESETS, current) },
    { key: "per", label: "PER", options: optionsFor("per", PER_PRESETS, current) },
    { key: "pbr", label: "PBR", options: optionsFor("pbr", PBR_PRESETS, current) },
    { key: "div", label: "배당수익률", options: optionsFor("div", DIV_PRESETS, current) },
    { key: "roe", label: "ROE", options: optionsFor("roe", ROE_PRESETS, current) },
  ] as const;
}

function boardPresets(): readonly { value: string; label: string }[] {
  return RANKING_BOARDS.map((value) => ({ value, label: BOARD_LABELS[value] }));
}

/** 정렬 축 칩 목록. */
export function screenerSortOptions(
  current: ScreenerQuery,
): ScreenerFilterOption<ScreenerSort>[] {
  return SCREENER_SORTS.map((value) => ({
    value,
    label: SCREENER_SORT_LABELS[value],
    href: screenerHref(current, { sort: value }),
    selected: value === current.sort,
  }));
}
