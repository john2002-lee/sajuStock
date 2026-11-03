import { USE_MOCK } from "@/lib/config/env";
import { detectMode, initialConsonants } from "../model/match";
import { MOCK_UNIVERSE } from "../model/mock";
import type { Suggestion } from "../model/types";
import { searchSuggestions } from "./searchSuggestions";

/**
 * 정규화에 실패한 입력에 대해 "이건가요?" 후보를 뽑는다 (와이어프레임 1d).
 *
 * ## 실 모드에서는 **실제 종목**을 준다
 *
 * 예전에는 `USE_MOCK` 과 무관하게 늘 `MOCK_UNIVERSE`(하드코딩된 대표 종목 몇 개)를
 * 뒤졌다. 그래서 오타를 낸 사용자에게 **자기 입력과 아무 상관 없는 종목**이
 * "이건가요?" 로 떠 있었다 — 이 화면의 목적이 정확히 그 반대인데도. 사이드바의
 * 다른 서비스들은 전부 `USE_MOCK` 가드를 갖고 있었고 여기만 빠져 있었다.
 *
 * 이제 백엔드 자동완성을 쓴다. 그쪽은 초성·부분 일치를 이미 처리하고
 * (`get_initial_consonants` + `repo.find_candidates`), 5분 캐시가 걸려 있어
 * 404 를 훑는 크롤러가 와도 상류 호출이 늘지 않는다.
 *
 * ## 빈 질의는 받지 않는다
 *
 * 예전에는 빈 문자열에 대표 종목을 돌려줬고 404 화면이 그것을 썼다. 그건 "후보"가
 * 아니라 그냥 아무 목록이라, 그 자리는 호출부가 시가총액 상위 같은 **뜻이 있는
 * 목록**으로 채우는 것이 맞다 (`app/not-found.tsx`).
 *
 * 서버 전용이다 — `@/lib/api` 를 타므로 `features/search/server.ts` 로만 나간다.
 */
export async function resolveCandidates(
  query: string,
  limit = 5,
): Promise<Suggestion[]> {
  const q = query.trim();
  if (!q) return [];

  if (USE_MOCK) return mockCandidates(q, limit);

  const result = await searchSuggestions({ query: q });
  // 그룹(이름·초성 / 최근 / 코드)을 가로질러 앞에서부터 채운다. 이 화면에는
  // 그룹 구분이 없고 "비슷한 것 몇 개" 만 있으면 된다.
  const flat = result.groups.flatMap((group) => group.items);

  const seen = new Set<string>();
  const unique: Suggestion[] = [];
  for (const item of flat) {
    if (seen.has(item.code)) continue;
    seen.add(item.code);
    unique.push(item);
    if (unique.length === limit) break;
  }
  return unique;
}

/**
 * 목 모드 전용 근사 매칭. 백엔드 없이 이 화면을 확인할 때 쓴다.
 *
 * 실 모드가 백엔드를 쓰게 된 뒤로 이 점수 규칙은 **데모용**이다 — 실제 순위는
 * 백엔드가 정한다.
 */
function mockCandidates(q: string, limit: number): Suggestion[] {
  const mode = detectMode(q);
  const lower = q.toLowerCase();
  const initials = initialConsonants(q);

  const scored = MOCK_UNIVERSE.map((item) => {
    let score = 0;
    // 가장 긴 공통 접두사 — "삼성전자우선주" 는 "삼성전자"와 4글자를 공유한다
    let shared = 0;
    while (
      shared < Math.min(q.length, item.name.length) &&
      q[shared] === item.name[shared]
    ) {
      shared += 1;
    }
    score += shared * 10;

    if (item.name.toLowerCase().includes(lower)) score += 40;
    if (item.code.toLowerCase().startsWith(lower)) score += 60;
    if (item.symbol.toLowerCase().startsWith(lower)) score += 60;
    if (item.nameEn?.toLowerCase().startsWith(lower)) score += 30;
    if (mode === "initials" && item.initials.startsWith(initials)) score += 50;

    return { item, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  // **하나도 안 걸리면 빈 손으로 돌아온다.** 예전에는 대표 종목을 그냥 얹었는데,
  // 이 화면이 하는 말이 "이건가요?" 라서 상관없는 종목을 얹는 순간 그 문장이
  // 거짓이 된다. 후보 0건은 호출부가 그리는 정당한 상태다 (`SymbolNotResolved`).
  return scored.slice(0, limit).map((entry) => entry.item);
}
