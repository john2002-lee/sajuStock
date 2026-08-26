import type { ListedCompaniesStatus } from "@/features/stock/search";
import { mockListedStatus, parseListedSource } from "@/features/stock/search/server";
import { apiGetCached } from "@/lib/api";
import { USE_MOCK } from "@/lib/config/env";

/**
 * 상장사 목록 준비 상태 (BFF). 검색 팔레트가 2초 간격으로 폴링한다.
 *
 * 백엔드 `GET /stocks/listed-companies` 는 수집을 유발하지 않고 상태만 읽는다.
 * 응답 스키마가 프런트 타입과 이미 같아(ready/loaded/total/source/steps) 그대로 넘긴다.
 *
 * 목 모드의 워밍업 시뮬레이션은 feature 가 소유한다(`features/search/server`) —
 * 파이프라인 순서는 검색 도메인 지식이지 라우팅이 아니다.
 */

/**
 * 요청마다 실행하되 fetch 캐시는 살려 둔다 (`force-dynamic` 이 아닌 이유는
 * `/api/stocks/suggestions` 주석과 같다).
 */
export const revalidate = 0;

/**
 * 상태 조회를 이 시간 동안 재사용한다.
 *
 * 이 값은 **모든 사용자에게 같다.** 그런데 팔레트가 열려 있는 동안 2초마다
 * 폴링하므로, 캐시가 없으면 동시 접속자 수에 비례해 백엔드를 친다(팔레트 50개면
 * 초당 25건). 준비 완료가 최대 3초 늦게 보이는 대신 호출이 상수로 떨어진다 —
 * 이 배너는 "왜 느린지"를 설명하는 보조 정보라 그 지연이 문제가 되지 않는다.
 */
const STATUS_REVALIDATE = 3;

/** 목 워밍업의 기준 시각. 이 서버가 뜬 순간부터 채워지는 것처럼 보인다 */
const BOOTED_AT = Date.now();

export async function GET(request: Request) {
  const forced = parseListedSource(new URL(request.url).searchParams.get("source"));

  if (USE_MOCK) {
    return Response.json(mockListedStatus(forced, BOOTED_AT, Date.now()), {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const result = await apiGetCached<ListedCompaniesStatus>(
      "/stocks/listed-companies",
      { revalidate: STATUS_REVALIDATE },
    );
    // 지연도 "지금은 모른다"로 취급한다 — 아래 catch 와 같은 결론이다.
    if (!result.ok) return new Response(null, { status: 204 });
    return Response.json(result.data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // 상태 조회 실패는 조용히 넘긴다 — 배너가 안 보일 뿐 검색은 동작한다.
    return new Response(null, { status: 204 });
  }
}
