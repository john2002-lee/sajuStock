import type { SearchMode } from "@/features/stock/search";
import { searchSuggestions, type SearchScope } from "@/features/stock/search/server";

const SCOPES: SearchScope[] = ["all", "name", "code", "ticker"];
const MODES: SearchMode[] = ["name", "initials", "code"];

/**
 * 자동완성 BFF. 브라우저는 FastAPI 를 직접 부르지 않는다.
 *
 * 디바운스(200ms)는 호출하는 쪽(useSuggestions)에 있다 — 서버는 매 요청을 그대로 처리한다.
 *
 * ## 상한이 여기 있어야 하는 이유
 *
 * 이 라우트는 **요청 1건이 백엔드 1 + N 건으로 팬아웃된다** (검색어 1회 + 최근 검색
 * 코드마다 1회). 디바운스는 브라우저 쪽 예의일 뿐이고, 이 주소는 브라우저 없이도
 * 불릴 수 있다. 상한을 서비스가 아니라 라우트에 두는 것은 여기가 외부에서 닿는
 * 경계라서다.
 */

/** 검색어 길이 상한. 백엔드 `/stocks/suggestions` 의 `max_length` 와 같은 값이다. */
const MAX_QUERY_LENGTH = 40;

/** 최근 검색 팬아웃 상한. 서비스의 GROUP_LIMIT 과 같다 — 그보다 많이 받아도 버려진다. */
const MAX_RECENT = 5;

/** 최근 검색으로 받아들이는 모양. 6자리 코드가 아닌 것은 조회하지 않는다. */
const CODE = /^\d{6}$/;

/**
 * 요청마다 실행하되(검색어가 매번 다르다) **fetch 캐시는 살려 둔다.**
 *
 * `force-dynamic` 이 아닌 이유는 페이지 쪽과 같다 — 그 설정은 이 라우트의 모든
 * fetch 를 `no-store` 로 강제해서, `searchSuggestions` 가 붙여 둔
 * `force-cache` + revalidate(5분)를 통째로 무력화한다. 그러면 흔한 접두어가
 * 사용자 수만큼 백엔드 검색이 된다.
 */
export const revalidate = 0;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  // 자르지 않고 **잘라서 넘긴다.** 40자를 넘는 검색어는 어차피 종목명이 아니고,
  // 400 으로 끊으면 붙여넣기 한 번에 오류 화면이 뜬다.
  const query = (params.get("q") ?? "").slice(0, MAX_QUERY_LENGTH);
  // 코드 모양만 통과시킨다. 예전에는 임의 문자열 10개가 그대로 백엔드 검색 10회가 됐다.
  const recentCodes = (params.get("recent")?.split(",") ?? [])
    .filter((code) => CODE.test(code))
    .slice(0, MAX_RECENT);

  // 프리픽스 파싱은 입력 핸들러(클라이언트)가 하고, 결과만 넘겨받는다.
  const rawScope = params.get("scope");
  const rawMode = params.get("mode");
  const scope = SCOPES.includes(rawScope as SearchScope)
    ? (rawScope as SearchScope)
    : "all";
  const mode = MODES.includes(rawMode as SearchMode)
    ? (rawMode as SearchMode)
    : undefined;

  const result = await searchSuggestions({ query, recentCodes, scope, mode });

  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
