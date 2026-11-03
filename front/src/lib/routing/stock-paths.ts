/**
 * 주식 주소를 주식 사이트로 보낸다.
 *
 * ## 왜 있나
 *
 * 주식은 별도 프로젝트(`stock-front`)로 갈라져 나갔고 이 앱에는 주식 화면이 없다.
 * 그래도 예전에 공유된 링크·북마크(`/stocks/005930?ai=1`, AI 판단 공유
 * `/verdict/{id}`)는 바깥에 남아 있다. 그것들이 404 로 끝나지 않게 **경로와 쿼리를
 * 그대로 살려** 새 도메인으로 옮긴다.
 *
 * ## 왜 이 파일이 따로 있나 — `legacy-paths` 와 같은 이유
 *
 * `proxy.ts` 는 `NextRequest` 를 끌고 와 테스트에서 직접 부를 수 없다. 판정만 순수
 * 함수로 떼어 두면 "사주 주소를 건드리지 않는다" 를 값으로 확인할 수 있다.
 *
 * ## 목적지는 환경 변수다 (`STOCK_SITE_URL`)
 *
 * 도메인이 아직 정해지지 않았다. 값이 없거나 URL 이 아니면 `null` — 리다이렉트하지
 * 않고, 라우트가 없으므로 404 가 된다. 잘못된 값 하나로 proxy 가 던지면 사주까지
 * 모든 요청이 죽으므로, 여기서는 절대 던지지 않는다.
 */

/** 주식 프로젝트로 옮겨 간 최상위 경로. 경로 조각 단위로 일치시킨다. */
const STOCK_ROOTS = ["/stock", "/stocks", "/dashboard", "/watchlist", "/verdict"] as const;

function isStockPath(pathname: string): boolean {
  // `startsWith("/stock")` 로 적으면 `/stockholm` 같은 주소까지 남의 도메인으로 나간다.
  return STOCK_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

/**
 * 주식 주소면 주식 사이트의 같은 주소(쿼리 포함)를, 아니면 `null` 을 준다.
 *
 * @param pathname `request.nextUrl.pathname`
 * @param search   `request.nextUrl.search` — `?` 를 포함하거나 빈 문자열
 * @param siteUrl  `process.env.STOCK_SITE_URL`
 */
export function stockRedirect(
  pathname: string,
  search: string,
  siteUrl: string | undefined,
): string | null {
  if (!siteUrl || !isStockPath(pathname)) return null;

  let base: URL;
  try {
    base = new URL(siteUrl);
  } catch {
    return null;
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") return null;

  return `${base.origin}${pathname}${search}`;
}
