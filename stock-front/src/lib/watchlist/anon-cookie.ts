/**
 * 익명 소유자 쿠키의 원시 부분 — **NextAuth 를 import 하지 않는다.**
 *
 * ## 왜 파일이 갈라져 있나
 *
 * `proxy.ts`(Next 16 의 미들웨어)는 **Edge 런타임**에서 돈다. 그런데 `owner.ts` 가
 * 세션을 읽으려고 `@/auth` 를 import 하면서, proxy 가 그 파일을 쓰는 것만으로
 * NextAuth 전체가 딸려 들어왔다 — 어댑터의 `pg`(Node 전용 소켓)와 `nodemailer` 까지.
 * 빌드가 `module-not-found` 로 깨졌고, 설령 통과해도 Edge 에서는 못 돈다.
 *
 * 그래서 **쿠키를 만들고 알아보는 일**(proxy 가 필요한 전부)만 여기 두고, 세션을
 * 보는 일은 `owner.ts` 에 남겼다. proxy 는 이 파일만 보므로 무거운 것이 안 따라온다.
 *
 * ## 이 쿠키가 하는 일
 *
 * 관심종목은 이 프로젝트에서 사용자가 소유하는 데이터인데 로그인은 선택이다.
 * 그래서 브라우저마다 서버가 난수 ID를 발급해 소유자로 쓴다.
 *
 *     로그인 전  anon:9f3c…   (이 쿠키)
 *     로그인 후  user:42      (세션의 사용자 ID)
 *
 * 로그인하면 익명으로 모아 둔 목록이 계정으로 **승계**된다 (`claim.ts`).
 *
 * ## httpOnly 인 이유
 *
 * **이것은 인증이 아니라 식별이다.** 남의 키를 알면 그 목록을 볼 수 있다. 그래서
 * 최소한 브라우저 JS 가 읽지 못하게 두고(XSS 표면을 줄인다), 값도 브라우저가 아니라
 * 서버가 만든다 — 클라이언트가 만들면 아무 값이나 넣어 남의 목록을 조회할 수 있다.
 *
 * `sameSite: "lax"` 는 외부 사이트에서 걸어온 POST 에 이 쿠키가 실려 나가지 않게 한다.
 */

const COOKIE = "ledger.owner";
/** 1년. 익명 신원이 며칠 만에 사라지면 담아 둔 목록도 함께 사라진 것처럼 보인다. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** 익명 소유자임을 드러내는 접두사. 로그인 뒤 `user:` 와 한 컬럼에 섞여 산다. */
export const ANON_PREFIX = "anon:";
/** 로그인 사용자. 값은 NextAuth `users.id`(uuid)다. */
export const USER_PREFIX = "user:";

/**
 * 새 소유자 키. `crypto.randomUUID()` 는 Node·Edge 런타임 모두에 있다.
 *
 * 추측 불가능해야 한다 — 순번이나 타임스탬프로 만들면 남의 키를 세어 볼 수 있다.
 */
export function createOwnerKey(): string {
  return `${ANON_PREFIX}${crypto.randomUUID()}`;
}

export function isOwnerKey(value: string | undefined): value is string {
  return typeof value === "string" && value.startsWith(ANON_PREFIX);
}

/** 로그인 사용자의 소유자 키. `users.id`(uuid)에서 만든다. */
export function userOwnerKey(userId: string): string {
  return `${USER_PREFIX}${userId}`;
}

export const OWNER_COOKIE = {
  name: COOKIE,
  maxAge: MAX_AGE_SECONDS,
  /** 서버 컴포넌트·라우트 핸들러·proxy 가 같은 옵션으로 굽도록 한 곳에 둔다 */
  options: {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    // 로컬 개발은 http 라 secure 를 켜면 쿠키가 아예 안 심긴다.
    secure: process.env.NODE_ENV === "production",
  },
} as const;
