// 쿼리 해석과 매칭 — 순수 함수. 서버(라우트 핸들러)와 클라이언트 양쪽에서 쓴다.

import type { SearchMode, Suggestion } from "./types";

const CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const CHO_STRIDE = 588;

/** 삼성전자 → ㅅㅅㅈㅈ. 백엔드 get_initial_consonants 와 같은 규칙. */
export function initialConsonants(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      out += CHO[Math.floor((code - HANGUL_BASE) / CHO_STRIDE)];
    } else if (CHO.includes(char)) {
      out += char;
    }
  }
  return out;
}

function isInitialsOnly(query: string): boolean {
  const stripped = query.replace(/\s/g, "");
  return stripped.length > 0 && [...stripped].every((c) => CHO.includes(c));
}

/**
 * 입력 모드는 쿼리에서 도출한다 — 사용자가 칩을 눌러 고르는 값이 아니다.
 * 디자인 시안에서 "삼성" 입력에 '코드' 칩이 활성인 것은 프로토타입 목 데이터의
 * 불일치이므로 재현하지 않는다.
 */
export function detectMode(query: string): SearchMode {
  const stripped = query.trim();
  if (!stripped) return "name";
  if (isInitialsOnly(stripped)) return "initials";
  // 6자리 코드 · 해외 티커(영문 대문자)
  if (/^\d{1,6}$/.test(stripped)) return "code";
  if (/^[A-Za-z.]{1,6}$/.test(stripped)) return "code";
  return "name";
}

/**
 * 명령형 프리픽스 문법 (4a 터미널).
 *   `>삼성`   이름·초성만
 *   `:005930` 6자리 코드만
 *   `@AAPL`   해외 티커만
 * 접두어가 없으면 통합 검색.
 */
export const SEARCH_PREFIXES = { ">": "name", ":": "code", "@": "ticker" } as const;

export type SearchScope = "all" | "name" | "code" | "ticker";

export interface ParsedQuery {
  /** 입력된 접두어. 없으면 null */
  prefix: ">" | ":" | "@" | null;
  /** 접두어를 떼고 앞뒤 공백을 없앤 실제 검색어 */
  query: string;
  scope: SearchScope;
  /** 모드 칩 활성 상태 — 접두어가 있으면 그것이, 없으면 쿼리 모양이 결정한다 */
  mode: SearchMode;
}

/**
 * 해외 티커 형태인가. 이 검사를 통과할 때만 "→ 해외 티커로 조회" 폴백 행을 띄운다.
 *
 * 판정은 [`lib/stocks/symbol`](../../../lib/stocks/symbol.ts) 이 소유한다 — 종목 상세가
 * "이 문자열을 상류로 보낼까" 를 물을 때 같은 모양을 본다. 정규식을 두 벌로 두면
 * 한쪽만 고치는 자리가 된다.
 */
export { isTickerLike } from "@/lib/stocks/symbol";

export function parseQuery(raw: string): ParsedQuery {
  const head = raw[0];
  if (head === ">" || head === ":" || head === "@") {
    const query = raw.slice(1).trim();
    const scope = SEARCH_PREFIXES[head];
    return {
      prefix: head,
      query,
      scope,
      // ':' 와 '@' 는 둘 다 코드 계열 칩을 켠다. '>' 는 초성이면 초성 칩.
      mode:
        scope === "name"
          ? isInitialsOnly(query)
            ? "initials"
            : "name"
          : "code",
    };
  }

  const query = raw.trim();
  return { prefix: null, query, scope: "all", mode: detectMode(query) };
}

/** 모드 칩에 보여줄 라벨. 초성 모드는 실제 초성을 함께 노출한다. */
export function modeChipLabel(mode: SearchMode, query: string): string {
  if (mode !== "initials") return mode === "code" ? "코드" : "한글";
  const initials = initialConsonants(query) || query.trim();
  return `초성 ${initials}`;
}

/** 이름에서 쿼리와 일치하는 구간. 초성 모드면 초성열에서 찾아 원문 인덱스로 되돌린다. */
export function nameMatch(
  name: string,
  query: string,
  mode: SearchMode,
): [number, number] | undefined {
  const q = query.trim();
  if (!q) return undefined;

  if (mode === "initials") {
    const at = initialConsonants(name).indexOf(initialConsonants(q));
    if (at === -1) return undefined;
    // 초성 1개 = 한글 1글자이므로 인덱스가 그대로 대응한다.
    return [at, at + initialConsonants(q).length];
  }

  const at = name.toLowerCase().indexOf(q.toLowerCase());
  if (at === -1) return undefined;
  return [at, at + q.length];
}

function matchesName(item: Suggestion, query: string, mode: SearchMode) {
  return nameMatch(item.name, query, mode) !== undefined;
}

function matchesCode(item: Suggestion, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return (
    item.code.toLowerCase().startsWith(q) ||
    item.symbol.toLowerCase().startsWith(q) ||
    (item.nameEn?.toLowerCase().startsWith(q) ?? false)
  );
}

/**
 * 후보를 이름·초성 그룹과 코드·티커 그룹으로 나눈다.
 * 한 종목이 양쪽에 중복되지 않도록 이름 매칭을 우선한다.
 */
export function splitByMatch(
  universe: Suggestion[],
  query: string,
  mode: SearchMode,
  limit: number,
): { byName: Suggestion[]; byCode: Suggestion[] } {
  const byName: Suggestion[] = [];
  const byCode: Suggestion[] = [];

  for (const item of universe) {
    if (matchesName(item, query, mode)) {
      byName.push({ ...item, match: nameMatch(item.name, query, mode) });
    } else if (matchesCode(item, query)) {
      byCode.push(item);
    }
  }

  // 이름 앞부분 일치를 먼저 — 백엔드 _rank 와 같은 방향
  byName.sort((a, b) => (a.match?.[0] ?? 0) - (b.match?.[0] ?? 0));

  return { byName: byName.slice(0, limit), byCode: byCode.slice(0, limit) };
}
