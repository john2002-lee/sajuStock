import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/session-cookie";
import { legacyRedirect } from "@/lib/routing/legacy-paths";
import { stockRedirect } from "@/lib/routing/stock-paths";
import { createOwnerKey, isOwnerKey, OWNER_COOKIE } from "@/lib/watchlist/anon-cookie";

/**
 * 익명 소유자 쿠키를 발급한다.
 *
 * 관심종목을 위해 생긴 쿠키지만 주식이 별도 프로젝트로 나간 지금도 남는다 — 사주
 * 공유(`api/saju/shares`)·방문 기록(`api/visit`)이 같은 소유자 키(`_data/owner`)를 쓴다.
 *
 * **Next 16 에서는 `middleware.ts` 가 아니라 `proxy.ts` 다.** 파일 규약이 바뀌었고
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`),
 * 예전 이름으로 두면 파일이 조용히 무시되어 쿠키가 영영 안 심긴다 — 관심종목이
 * 항상 비어 보이는데 오류는 없는 상태가 된다.
 *
 * ## 왜 여기서 굽나
 *
 * 서버 컴포넌트는 쿠키를 **읽을 수만** 있다(Next 제약). 관심종목 화면은 서버
 * 컴포넌트라 첫 렌더에 이미 소유자가 정해져 있어야 하고, 그 일을 할 수 있는 곳은
 * 렌더보다 먼저 도는 여기뿐이다. 라우트 핸들러에서 구우면 "첫 방문에는 목록이 비고
 * 뭔가를 눌러야 신원이 생기는" 이상한 순서가 된다.
 *
 * ## 왜 응답에도 요청에도 심나
 *
 * 새로 발급한 값은 브라우저에 아직 없다. 응답에만 심으면 **이번 요청의 렌더는**
 * 여전히 쿠키를 못 읽어 첫 화면이 빈 목록이 된다. 요청 헤더에도 얹어 이번 렌더부터
 * 같은 신원을 보게 한다.
 */
// 세션 쿠키 이름은 `lib/auth/session-cookie` 가 갖는다 — 이름을 두 곳에 적어 두면
// 한쪽만 고쳤을 때 이 게이트가 조용히 모두를 통과시킨다.
const SESSION_COOKIES = SESSION_COOKIE_NAMES;

/**
 * 관리자 경로에 **세션 쿠키조차 없는 요청**을 렌더 전에 끊는다.
 *
 * ## 이건 인가가 아니다 — 인가는 `lib/auth/admin.requireAdmin()` 이 한다
 *
 * 여기는 Edge 런타임이라 DB 를 못 본다. 세션 전략이 `database` 이므로 쿠키 값이
 * 유효한지, 그 사람이 관리자인지 **여기서는 알 수 없다.** 알 수 있는 것은 "쿠키가
 * 아예 없다 = 로그인한 적이 없다" 하나뿐이고, 그 경우만 거른다.
 *
 * ## 그런데도 두는 이유 둘
 *
 * 1. **진짜 404 를 준다.** 페이지의 `notFound()` 는 내용을 막지만 상태 코드는
 *    200 이다 — 루트 `loading.tsx` 가 만든 Suspense 경계 때문에 헤더가 먼저
 *    나가기 때문이다(실측). 익명 요청은 대부분 스캐너이고, 그쪽에 200 을 주면
 *    "여기 뭔가 있다" 는 신호가 된다.
 * 2. **렌더를 아낀다.** 로그인도 안 한 요청에 세션 조회와 서버 컴포넌트 렌더를
 *    태울 이유가 없다.
 *
 * 로그인했지만 관리자가 아닌 사람은 여기를 그대로 지나가고, 페이지의
 * `requireAdmin()` 이 404 로 끊는다. **그 층이 없으면 안 된다** — 쿠키만 있으면
 * 통과하는 이 검사를 인가로 착각하는 순간 아무나 관리자 화면을 보게 된다.
 */
function blockAnonymousAdmin(request: NextRequest): NextResponse | null {
  if (!request.nextUrl.pathname.startsWith("/admin")) return null;

  const signedIn = SESSION_COOKIES.some((name) => request.cookies.get(name)?.value);
  if (signedIn) return null;

  // 403 이 아니라 404 다. 403 은 "여기 뭔가 있는데 권한이 부족하다" 를 알려 준다 —
  // 관리자 화면은 존재 자체를 광고할 이유가 없다 (`requireAdmin` 과 같은 판단).
  return new NextResponse(null, { status: 404 });
}

/**
 * 주식 주소를 주식 사이트로 보낸다 — 주식은 별도 프로젝트(`stock-front`)로 갈라져 나갔다.
 *
 * 판정은 `lib/routing/stock-paths` 가 한다(`legacy-paths` 와 같은 이유). 목적지
 * `STOCK_SITE_URL` 이 없으면 보내지 않고, 라우트가 없으므로 404 가 된다.
 *
 * 경로와 쿼리를 살린다 — 공유된 `/stocks/005930?ai=1` 이 그 종목으로 가야 한다.
 * 307 인 이유는 아래 `redirectMovedPaths` 와 같다. 도메인이 아직 정해지지 않았고,
 * 영구 리다이렉트는 브라우저가 캐시해 되돌리기 어렵다.
 */
function redirectToStockSite(request: NextRequest): NextResponse | null {
  const target = stockRedirect(
    request.nextUrl.pathname,
    request.nextUrl.search,
    process.env.STOCK_SITE_URL,
  );
  if (target === null) return null;

  return NextResponse.redirect(target, 307);
}

/**
 * 제품 구조가 바뀌며 옮겨 간 주소를 새 자리로 보낸다 — 지금은 `/saju` → `/` 하나다.
 *
 * ## 왜 판정이 여기 없나
 *
 * 어느 주소가 어디로 갔는지는 `lib/routing/legacy-paths` 가 안다. 이 파일은
 * `NextRequest` 를 끌고 오므로 테스트에서 직접 부를 수 없고, **틀리면 가장 비싼
 * 실수**(`/saju/reports/{token}` 을 함께 튕겨 구매자가 리포트를 잃는 것)가 바로
 * 그 판정에서 난다. 값으로 확인할 수 있는 자리에 두었다.
 *
 * 페이지의 `redirect()` 가 아니다 —
 * 그쪽은 meta refresh 로 내려가 빈 화면이 1초 스친다. **랜딩에서는 특히 안 된다.**
 *
 * 308 이 아니라 307 인 것도 같은 판단이다. 영구 리다이렉트는 브라우저가 캐시해
 * 되돌리기 어렵다.
 */
function redirectMovedPaths(request: NextRequest): NextResponse | null {
  const moved = legacyRedirect(request.nextUrl.pathname);
  if (moved === null) return null;

  return NextResponse.redirect(new URL(moved + request.nextUrl.search, request.nextUrl));
}

export function proxy(request: NextRequest) {
  const blocked = blockAnonymousAdmin(request);
  if (blocked) return blocked;

  const toStockSite = redirectToStockSite(request);
  if (toStockSite) return toStockSite;

  const relocated = redirectMovedPaths(request);
  if (relocated) return relocated;

  const existing = request.cookies.get(OWNER_COOKIE.name)?.value;
  if (isOwnerKey(existing)) return NextResponse.next();

  const owner = createOwnerKey();

  // 요청 쿠키를 먼저 고친 뒤 그 헤더를 상류로 넘긴다. 문서가 명시한 형태는
  // `NextResponse.next({ request: { headers } })` 이고, `{ headers }` (request 없이)
  // 는 **클라이언트용 응답 헤더**라 이번 렌더에는 닿지 않는다.
  request.cookies.set(OWNER_COOKIE.name, owner);
  const response = NextResponse.next({
    request: { headers: new Headers(request.headers) },
  });

  // 브라우저가 다음 요청부터 같은 신원을 보내도록 응답에도 굽는다.
  response.cookies.set(OWNER_COOKIE.name, owner, OWNER_COOKIE.options);
  return response;
}

/**
 * 정적 자산·이미지에는 돌지 않는다. 쿠키가 필요한 것은 화면과 BFF 라우트뿐이고,
 * proxy 는 매 요청 도는 코드라 범위를 좁힐수록 좋다.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
