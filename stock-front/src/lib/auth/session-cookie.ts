/**
 * 로그인 세션 쿠키의 **수명 정책**. 이름과 만료 규칙이 여기 한 곳에 있다.
 *
 * ## 왜 sessionStorage 가 아닌가
 *
 * "브라우저를 닫으면 로그아웃" 을 원할 때 가장 먼저 떠오르는 것이 sessionStorage
 * 인데, 이 앱에서는 쓸 수 없다. 토큰을 읽는 주체가 전부 **서버**이기 때문이다 —
 * `proxy.ts` 가 렌더보다 먼저 읽고(`/admin` 404 · `/dashboard` 307), 서버 컴포넌트가
 * `currentUser()` 로 읽고, BFF 라우트가 `readOwnerKey()` 로 읽는다. sessionStorage 는
 * 브라우저에만 있고 요청에 실려 나가지 않으므로 그 셋이 전부 "로그인 안 한 사람" 을
 * 보게 된다.
 *
 * 두 번째 이유는 `httpOnly` 다. 그 플래그가 **JS 가 토큰을 못 읽게** 하는 것이고
 * XSS 방어의 핵심인데, sessionStorage 는 페이지의 아무 스크립트나 읽는다.
 *
 * 그래서 관찰 가능한 성질만 쿠키로 그대로 만든다: **만료 시각이 없는 쿠키**는
 * 브라우저가 닫힐 때 사라진다. sessionStorage 와 정확히 같은 수명이면서 httpOnly 다.
 *
 * ## Auth.js 설정으로는 안 된다
 *
 * `cookies.sessionToken.options` 에 무엇을 적어도 소용없다. `SessionStore.chunk()` 가
 * `{ ...설정옵션, ...라이브러리가_넘긴_옵션 }` 순서로 병합하는데, 세션을 굽는 쪽이
 * 언제나 `expires` 를 계산해 넘기기 때문이다(`@auth/core` 0.41.3 실측). 즉 라이브러리
 * 값이 항상 이긴다. 그래서 설정이 아니라 **응답 헤더**에서 떼어낸다.
 *
 * 쿠키를 실제로 브라우저에 굽는 곳은 `/api/auth/*` 라우트 하나뿐이다 — 서버
 * 컴포넌트의 `auth()` 는 내부 Request 를 만들어 세션 **본문만** 읽고 그 응답의
 * Set-Cookie 는 버린다(`next-auth/lib/index.js` 의 `getSession`). 그래서 래퍼가
 * 한 자리로 끝난다.
 */

/**
 * NextAuth v5 의 세션 쿠키 이름. https 에서는 `__Secure-` 접두가 붙는다.
 *
 * 둘 다 봐야 하는 이유: 개발은 http, 배포는 https 라 한쪽만 보면 한쪽에서 안 먹는다.
 * 토큰이 4KB 를 넘으면 `이름.0`·`이름.1` 로 쪼개지므로 접두 일치도 함께 본다.
 */
export const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

/**
 * 토큰 자체의 수명(초). 쿠키가 살아남아도 이 시간이 지나면 무효다.
 *
 * **쿠키 수명과 별개인 것이 요점이다.** 브라우저를 안 닫고 며칠 켜 두는 사용자가
 * 실제로 있고, 그 경우 세션 쿠키만으로는 아무것도 만료되지 않는다. 예전 기본값은
 * 30일이었다.
 *
 * 서버가 세션을 즉시 무효화할 수 없다는 점(JWT 전략, `auth.ts` 주석)이 이 값을
 * 짧게 잡는 근거다 — 유출된 토큰을 회수할 방법이 없으면 남은 방어는 수명뿐이다.
 */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/**
 * jose 가 만료된 JWT 에 붙이는 코드. 클래스 이름(`JWTExpired`)이 아니라 이 값을 보는
 * 이유는, 번들러가 클래스 이름을 줄여도 `code` 는 문자열 리터럴이라 살아남기 때문이다.
 */
const JOSE_EXPIRED = "ERR_JWT_EXPIRED";

/** Auth.js 가 세션 복호화 실패에 붙이는 타입. */
const SESSION_DECODE_FAILED = "JWTSessionError";

/**
 * 이 오류가 **수명이 다한 세션 쿠키**인가.
 *
 * ## 왜 판정이 필요한가
 *
 * 토큰 수명은 8시간인데 쿠키는 브라우저를 닫을 때까지 남는다(위 두 상수). 그래서
 * **브라우저를 하루 켜 둔 사람**은 만료된 토큰을 계속 보내고, Auth.js 는 그때마다
 * `JWTSessionError` 를 ERROR 로 세 줄 남긴다 — `[auth][error]`·`[auth][cause]`(스택)
 * ·`[auth][details]`. 매 요청이다.
 *
 * 그런데 이것은 **오류가 아니라 설계대로 일어난 일**이다. 화면도 정상으로 동작한다
 * (세션을 `null` 로 보고 로그아웃 상태를 그린다). 정상적인 사건이 진짜 오류와 같은
 * 높이로 쌓이면 로그에서 진짜를 못 찾는다.
 *
 * ## 로그에 개인정보가 실린다
 *
 * `[auth][details]` 는 디코드하려던 **JWT 페이로드를 통째로** 찍는다 — 이름·이메일·
 * 구글 프로필 사진 주소가 서버 로그에 남는다. 이 저장소는 계측에서도 그런 값을
 * 빼기로 했다(`back/app/integrations/amplitude.py`). 같은 기준을 로그에도 적용한다.
 *
 * ## 판정을 좁게 잡는다
 *
 * 세션 복호화 실패(`JWTSessionError`)이면서 원인이 **만료**인 경우만이다. 서명이
 * 안 맞거나(`AUTH_SECRET` 교체) 형식이 깨진 토큰은 그대로 ERROR 로 남아야 한다 —
 * 그쪽은 실제로 무언가 잘못된 것이다.
 */
export function isExpiredSessionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ((error as { type?: unknown }).type !== SESSION_DECODE_FAILED) return false;

  // Auth.js 는 원인을 `cause.err` 에 넣고 나머지 키를 메타데이터로 쓴다.
  const cause = (error as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") return false;

  const inner = (cause as { err?: unknown }).err;
  if (!inner || typeof inner !== "object") return false;

  return (inner as { code?: unknown }).code === JOSE_EXPIRED;
}

function cookieName(setCookie: string): string {
  const eq = setCookie.indexOf("=");
  return (eq === -1 ? setCookie : setCookie.slice(0, eq)).trim();
}

function isSessionCookie(name: string): boolean {
  return SESSION_COOKIE_NAMES.some(
    // `이름.0` 같은 청크까지 포함한다.
    (known) => name === known || name.startsWith(`${known}.`),
  );
}

function cookieValue(setCookie: string): string {
  const eq = setCookie.indexOf("=");
  if (eq === -1) return "";
  return setCookie.slice(eq + 1).split(";")[0].trim();
}

/**
 * Set-Cookie 한 줄에서 `Expires`·`Max-Age` 를 떼어낸다. 세션 쿠키가 아니면 그대로.
 *
 * **값이 빈 쿠키는 손대지 않는다.** Auth.js 는 로그아웃할 때 값을 비우고
 * `Max-Age=0` 을 붙여 지우는데(`SessionStore.clean()`), 거기서 만료를 떼면 그것이
 * 삭제 지시가 아니라 "빈 값을 세션 동안 유지하라" 가 된다. 로그아웃이 조용히
 * 반쯤만 되는 상태라 겉으로는 잘 안 보인다.
 */
export function toBrowserSessionCookie(setCookie: string): string {
  const name = cookieName(setCookie);
  if (!isSessionCookie(name)) return setCookie;
  if (cookieValue(setCookie) === "") return setCookie;

  const kept = setCookie
    .split(";")
    .filter((part) => !/^\s*(expires|max-age)\s*=/i.test(part));

  return kept.join(";");
}

/**
 * 응답의 세션 쿠키를 **브라우저 세션 쿠키**로 바꾼다. 나머지 쿠키는 건드리지 않는다
 * (`authjs.callback-url`·`authjs.csrf-token`·PKCE 는 각자의 수명이 있다).
 */
export function withBrowserSessionCookie(response: Response): Response {
  const cookies = response.headers.getSetCookie();
  if (cookies.length === 0) return response;

  const rewritten = cookies.map(toBrowserSessionCookie);
  if (rewritten.every((cookie, i) => cookie === cookies[i])) return response;

  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  for (const cookie of rewritten) headers.append("set-cookie", cookie);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
