/**
 * 로그인 뒤 돌려보낼 주소가 **우리 사이트 안인지** 판정한다.
 *
 * ## 왜 검사가 필요한가
 *
 * `?next=` 는 사용자가 주는 값이고, 그 값으로 `redirect()` 를 부른다. 검사 없이
 * 쓰면 오픈 리다이렉트다 — 공격자가 `/login?next=https://evil.example` 를 뿌리고,
 * 사용자는 **우리 도메인의 로그인 화면**을 지나 남의 사이트에 도착한다. 도메인이
 * 맞았기 때문에 사용자가 의심할 근거가 없는 것이 이 취약점의 값이다.
 *
 * ## 세 가지를 막는다
 *
 * 1. **`//evil.example`** — 스킴 없는 절대 주소다. `/` 로 시작하니 상대 경로처럼
 *    보이지만 브라우저는 외부 호스트로 간다. `startsWith("/")` 만 보는 검사가
 *    이것 하나로 뚫린다.
 * 2. **`/\evil.example`** — 브라우저는 URL 의 역슬래시를 `/` 로 정규화하므로 위와
 *    같은 것이 된다. 문자 하나 차이로 1번 검사를 우회한다.
 * 3. **제어문자·개행** — 이 값이 `Location` 헤더에 실리는 경로에서 응답 분할이
 *    된다. 파싱하기 전에 버린다.
 *
 * 그리고 통과한 값도 **파서로 한 번 더 확인한다.** 위 규칙을 손으로 적었으니
 * 빠뜨린 모양이 있을 수 있고, 그때는 우리 판단보다 URL 파서를 믿는 편이 낫다.
 *
 * ## `lib/` 에 있는 이유
 *
 * 세션도 쿠키도 보지 않는 **순수 함수**다. 문자열 하나를 받아 문자열이나 null 을
 * 낸다 — 그래서 NextAuth 없이 단위 테스트할 수 있고, 실제로 그렇게 한다
 * (`next-path.test.ts`). 신원과 엮는 일은 `app/` 의 몫이다 (CONVENTIONS).
 */

/** 파싱용 가짜 출처. 결과가 이것과 다르면 값이 사이트를 벗어난 것이다. */
const DUMMY_ORIGIN = "http://localhost";

/**
 * 링크 하나에 담길 만한 길이의 상한. 넘는 값은 정상적인 화면 주소가 아니다 —
 * 막아서 잃는 것이 없고, 두면 우리 도메인으로 만든 긴 미끼 주소가 가능해진다.
 */
const MAX_LENGTH = 512;

/**
 * 값에 섞이면 곧바로 버리는 문자들 — 제어문자·개행·DEL·역슬래시.
 * 역슬래시가 여기 함께 있는 이유는 위 2번이다.
 */
function hasUnsafeChars(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    // 제어문자(개행 포함)와 DEL. 정규식 이스케이프 대신 문자코드로 본다 —
    // 이 검사는 소스에 제어문자를 넣지 않고 적을 수 있어야 한다.
    if (code < 0x20 || code === 0x7f) return true;
    // 역슬래시. 브라우저가 `/` 로 정규화하므로 `//` 검사보다 먼저 걸러야 한다.
    if (char === String.fromCharCode(0x5c)) return true;
  }
  return false;
}

/**
 * 돌려보내도 되는 경로면 정규화해서, 아니면 null.
 *
 * 프래그먼트(`#...`)는 버린다 — 서버에 오지도 않는 값이라 들고 다닐 이유가 없다.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > MAX_LENGTH) return null;

  if (hasUnsafeChars(raw)) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;

  let url: URL;
  try {
    url = new URL(raw, DUMMY_ORIGIN);
  } catch {
    return null;
  }
  // 손으로 적은 규칙을 통과했어도 파서가 다르게 읽으면 그쪽을 믿는다.
  if (url.origin !== DUMMY_ORIGIN) return null;

  // 로그인 화면으로 돌려보내면 고리가 된다. 뒤 슬래시만 다른 형태도 같이 막는다.
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/login") return null;

  // BFF 라우트는 화면이 아니다 — 브라우저를 그리로 보내면 JSON 이나 SSE 가 뜬다.
  if (path === "/api" || path.startsWith("/api/")) return null;

  return `${url.pathname}${url.search}`;
}

/**
 * 로그인 화면으로 가는 링크. 돌아올 자리를 함께 싣는다.
 *
 * 돌려보낼 값이 없거나 안전하지 않으면 **`next` 를 붙이지 않는다.** 못 쓸 값을
 * 주소에 남겨 두면 로그인 화면이 그것을 다시 검사해 버려야 하고, 그러면 같은
 * 판단이 두 곳에 생긴다.
 */
export function loginHref(next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}
