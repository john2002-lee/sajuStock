import { cache } from "react";
import PostgresAdapter from "@auth/pg-adapter";
import NextAuth, { AuthError, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { findUserByEmail } from "@/lib/auth/accounts";
import { isSeedAdmin } from "@/lib/auth/admin";
import {
  isExpiredSessionError,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session-cookie";
import { burnPasswordTime, verifyPassword } from "@/lib/auth/password";
import { authPool } from "@/lib/auth/pool";

/**
 * NextAuth v5 (Auth.js) 구성.
 *
 * v4 가 아니라 v5(beta)를 쓰는 이유는 v4 가 Next 16 App Router 를 지원하지 않아서다.
 *
 * ## 프로바이더는 **환경 변수가 있을 때만** 켜진다
 *
 * 자격 증명이 없는 채로 프로바이더를 등록하면 로그인 버튼이 보이는데 누르면 깨진다.
 * 그보다는 **아예 없는 편**이 정직하다 — 로그인이 꺼져 있어도 관심종목은 익명 신원
 * (`anon:` 쿠키)으로 그대로 동작하므로 화면이 죽지 않는다.
 *
 * 키가 생기면 `.env.local` 에 넣기만 하면 된다. 코드는 안 고친다.
 *
 * ## 수단이 둘이다 — 비밀번호와 구글
 *
 * 이메일 매직링크(Nodemailer 프로바이더)는 2026-08-18 에 걷어냈다. 비밀번호 로그인이
 * 생기면서 "비밀번호 없이 메일로 들어가는 길" 이 겹쳤고, 로그인 화면에 같은 성격의
 * 입구가 셋이면 어느 것이 본체인지 흐려진다.
 *
 * **`nodemailer` 패키지는 남아 있다.** 프로바이더로는 안 쓰지만 개발자 모드 회원가입의
 * **인증 메일**을 그것으로 보낸다 (`lib/auth/signup.ts`). `EMAIL_SERVER`·`EMAIL_FROM`
 * 도 그래서 계속 읽힌다 — 용도만 로그인에서 가입 인증으로 옮겨 갔다.
 *
 * ## 어댑터는 남는다
 *
 * 세션 전략이 JWT 로 바뀌어(아래) `sessions` 는 안 쓰이지만, `users`·`accounts` 는
 * 구글 로그인이 계속 쓰고 `verification_token` 은 가입 인증이 쓴다. 스키마는 alembic 이
 * 만들고(`b3f1c2d47a90`·`d41c9f0b8e75`), 자동 생성이 그 테이블을 지우려 들지 않도록
 * `alembic/env.py` 가 막는다.
 *
 * ## 관심종목과의 접점
 *
 * 로그인하면 소유자가 `anon:<uuid>` → `user:<uuid>` 로 바뀐다. 익명으로 모아 둔
 * 목록은 로그인 뒤 한 번 승계된다 (`lib/watchlist/owner.ts`).
 */

const googleId = process.env.AUTH_GOOGLE_ID;
const googleSecret = process.env.AUTH_GOOGLE_SECRET;
/**
 * DB 가 있으면 비밀번호 로그인이 가능하다 — 해시가 `users` 에 살기 때문이다.
 * 어댑터도 같은 조건이라 한 곳에서 판단한다.
 */
const hasDatabase = Boolean(process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL);

/** 이메일·비밀번호 칸을 그릴지. 화면이 이 값을 보고 정한다. */
export const PASSWORD_LOGIN_ENABLED = hasDatabase;

/** 로그인 수단이 하나라도 설정돼 있는가. UI 가 로그인 버튼을 그릴지 정한다. */
export const AUTH_ENABLED = Boolean(
  (googleId && googleSecret) || hasDatabase,
);

const providers: NextAuthConfig["providers"] = [];

if (googleId && googleSecret) {
  providers.push(Google({ clientId: googleId, clientSecret: googleSecret }));
}

if (hasDatabase) {
  /**
   * 이메일 + 비밀번호.
   *
   * ## Auth.js 는 이 방식을 권하지 않는다 — 그래도 쓰기로 한 결정이다
   *
   * 프로바이더 문서가 "intentionally limited to discourage the use of passwords" 라고
   * 적어 두었다. 봇 차단·크리덴셜 스터핑 방어·비밀번호 재설정·유출 대응을 전부 직접
   * 지어야 한다는 뜻이다. 그 비용을 알고 고른 것이며(2026-08-18), 구글 로그인을 함께
   * 남긴 것도 그래서다.
   *
   * ## 실패 이유를 화면에 알려주지 않는다
   *
   * "없는 계정" 과 "비밀번호 틀림" 을 구분해 주면 **어떤 이메일이 가입돼 있는지**
   * 알려주는 것이 된다. `null` 하나로 합치고, 시간까지 맞춘다
   * (`burnPasswordTime` — 없는 계정만 빨리 끝나면 시간으로 새어 나간다).
   *
   * ## 인증 안 된 계정은 못 들어온다
   *
   * `emailVerified` 가 비어 있으면 거절한다. 공개 가입(개발자 모드)은 인증 메일을
   * 거치라는 뜻이고, 관리자가 만든 계정은 만들 때 이미 인증 표시가 붙는다
   * (`createAccount({ verified: true })`).
   */
  providers.push(
    Credentials({
      id: "password",
      name: "이메일",
      credentials: {
        email: { label: "이메일", type: "email" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(raw) {
        const email = typeof raw?.email === "string" ? raw.email : "";
        const password = typeof raw?.password === "string" ? raw.password : "";
        if (!email || !password) return null;

        const user = await findUserByEmail(email);

        // 계정이 없거나 비밀번호를 붙인 적이 없는 계정(구글 전용)이다. 어느 쪽이든
        // 같은 시간을 쓰고 같은 답을 준다.
        if (!user?.passwordHash) {
          await burnPasswordTime(password);
          return null;
        }

        if (!(await verifyPassword(password, user.passwordHash))) return null;
        if (!user.emailVerified) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  // 어댑터는 DB 가 있을 때만 붙인다. 없는 상태에서 만들면 쓰지도 않을 Supabase
  // 연결을 잡고, 첫 로그인에서야 주소가 없다는 것을 알게 된다.
  adapter: hasDatabase ? PostgresAdapter(authPool()) : undefined,
  providers,
  /**
   * **JWT 다. 고른 것이 아니라 강제된 것이다.**
   *
   * 원래는 DB 세션이었다(`sessions` 테이블). 비밀번호 로그인을 붙이면서 바뀌었다 —
   * Auth.js 의 Credentials 프로바이더는 "can only be used if JSON Web Tokens are
   * enabled for sessions" 라고 명시한다. 어댑터를 그대로 두어도 `handle-login.js` 가
   * `useJwtSession` 이면 `createSession` 을 건너뛴다(실측).
   *
   * ## 무엇이 달라졌나
   *
   * - `sessions` 테이블은 **더 이상 쓰이지 않는다.** 스키마는 남겨 둔다 — 되돌릴 수
   *   있어야 하고, 지우는 마이그레이션이 그 자체로 되돌리기 어려운 결정이다.
   * - **서버에서 세션을 즉시 무효화할 수 없다.** 로그아웃해도 쿠키를 지울 뿐이고,
   *   그 전에 복사된 토큰은 만료(기본 30일)까지 유효하다. 유출 대응이 필요해지면
   *   토큰에 버전을 실어 DB 와 대조하는 층을 따로 얹어야 한다.
   * - 사용자·계정 행은 **그대로 저장된다.** 어댑터가 있으면 `createUser`·`linkAccount`
   *   는 전략과 무관하게 돈다 — 구글 로그인이 계속 같은 계정을 만든다.
   */
  /**
   * 수명이 **두 겹**이다. 하나만으로는 둘 다 못 막는다.
   *
   *   쿠키   — 만료 시각을 아예 안 붙여 브라우저를 닫으면 사라진다
   *            (`app/api/auth/[...nextauth]/route.ts` 가 응답에서 떼어낸다)
   *   토큰   — 여기 `maxAge`. 브라우저를 며칠 켜 둬도 8시간이면 무효다
   *
   * 쿠키만 손보면 창을 안 닫는 사용자에게는 아무것도 만료되지 않고, 토큰만
   * 짧게 잡으면 공용 PC 에서 창을 닫아도 그 시간 동안 쿠키가 남는다.
   *
   * 8시간인 근거는 바로 위 JWT 주석에 있다 — **서버가 세션을 즉시 무효화할 수
   * 없다.** 로그아웃은 쿠키를 지울 뿐이고 그 전에 복사된 토큰은 만료까지 유효하다.
   * 회수할 방법이 없으면 남은 방어는 수명뿐이라, 예전 기본값 30일은 너무 길다.
   */
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  /**
   * 로그를 **심각도에 맞게** 남긴다.

   * 기본 로거는 `JWTSessionError` 를 ERROR 세 줄로 찍는다 — 제목, 스택,
   * 그리고 디코드하려던 JWT 페이로드 전문(`[auth][details]`). 그런데 그 오류의
   * 대부분은 **8시간이 지난 세션 쿠키**이고, 그건 우리가 그렇게 설계한 결과다
   * (`lib/auth/session-cookie` 의 두 수명). 브라우저를 하루 켜 둔 사람의 매 요청마다
   * 그 세 줄이 쌓이면, 배포 로그에서 진짜 오류를 찾을 수 없게 된다.
   *
   * 그래서 **그 경우만** 한 줄 info 로 낮춘다. 개인정보도 함께 빠진다 — 그 세 번째
   * 줄에는 이름·이메일·프로필 사진 주소가 들어 있다.
   *
   * 나머지는 기본 로거와 같은 내용을 그대로 남긴다. ANSI 색만 뺐다 — 개발 콘솔에서는
   * 색이 읽기 좋지만 Cloud Run·Vercel 로그에서는 `[31m` 같은 제어문자로 보인다.
   */
  logger: {
    error(error) {
      if (isExpiredSessionError(error)) {
        // 세 줄이 아니라 한 줄이고, 페이로드를 찍지 않는다. 화면은 정상이다 —
        // 세션을 `null` 로 보고 로그아웃 상태를 그린다.
        console.info("[auth] 만료된 세션 쿠키를 무시했습니다 — 다시 로그인하면 됩니다");
        return;
      }

      const name = error instanceof AuthError ? error.type : error.name;
      console.error(`[auth][error] ${name}: ${error.message}`);

      const cause = error.cause;
      if (cause && typeof cause === "object" && "err" in cause) {
        const { err, ...data } = cause as { err: unknown } & Record<string, unknown>;
        if (err instanceof Error) console.error("[auth][cause]:", err.stack);
        console.error("[auth][details]:", JSON.stringify(data, null, 2));
      } else if (error.stack) {
        console.error(error.stack);
      }
    },
  },

  pages: {
    signIn: "/login",
    /**
     * 실패도 **우리 화면**에서 받는다.
     *
     * 기본값은 Auth.js 가 들고 있는 `/api/auth/error` 인데, 그 화면은 검은 배경에
     * "Server error — There is a problem with the server configuration." 만 띄운다.
     * 제호도 없고 돌아갈 링크도 없어서 사용자는 사이트를 벗어난 것처럼 느낀다.
     *
     * **가장 흔한 도착 경로가 '취소' 라서 더 나쁘다.** 구글 OAuth 를 취소하면
     * `error=access_denied` 로 돌아오는데, 구글의 discovery 가
     * `authorization_response_iss_parameter_supported: true` 를 광고하므로 Auth.js 는
     * 응답에 `iss` 를 요구한다. 그런데 구글은 **성공 응답에만** `iss` 를 싣는다.
     * 그래서 취소는 "access_denied" 로 도착하지 못하고 `iss` 검증에서 먼저 터지며,
     * 그 실패가 `CallbackRouteError` → 에러 페이지의 `error=Configuration` 이 된다.
     *
     * 즉 **취소가 서버 설정 오류처럼 보인다.** 로그인만 취소했을 뿐인 사람에게
     * 그 화면을 보여줄 이유가 없다. `/login` 으로 돌려보내면 그 자리에서 다시
     * 시도할 수 있고, 무슨 일이 있었는지도 화면이 말한다 (`app/login/page.tsx`).
     */
    error: "/login",
  },
  callbacks: {
    /**
     * 로그인 문턱 — **관리자가 아니면 들이지 않는다.**
     *
     * ## 왜 문턱이 필요한가
     *
     * 공개 회원가입은 닫혀 있고(`lib/auth/signup`), 비밀번호 계정은 관리자가 발급한다.
     * 그러니 로그인하는 사람은 운영자뿐이어야 하는데 **구글 버튼은 아무나 누를 수
     * 있다.** 막지 않으면 지나가던 사람의 구글 계정이 `role = 'user'` 로 생기고,
     * 그 사람은 회원도 아닌데 계정만 갖게 된다. 정리할 대상이 조용히 쌓인다.
     *
     * ## 거절이 **계정 생성보다 먼저** 온다
     *
     * Auth.js 의 콜백 경로는 `handleAuthorized`(이 콜백) → `handleLoginOrRegister`
     * (어댑터가 `users`·`accounts` 를 만드는 자리) 순서다
     * (`@auth/core/lib/actions/callback/index.js`). 여기서 `false` 를 내면 행이
     * 아예 만들어지지 않는다 — 만들고 지우는 것보다 안 만드는 편이 낫다.
     *
     * ## 화면에는 "회원이 아닙니다" 로 도착한다
     *
     * `false` 는 `AccessDenied` 가 되고, 그 타입은 클라이언트에 그대로 전달되는
     * 목록에 있어 `/login?error=AccessDenied` 로 돌아온다(`pages.error`). 문구는
     * 로그인 화면의 `ERROR_MESSAGES` 가 갖는다.
     *
     * ## 판단은 이메일로 한다
     *
     * 구글로 처음 들어오는 사람에게는 아직 DB 행이 없어 `user.role` 을 믿을 수 없다.
     * 씨앗 관리자(`ADMIN_EMAILS`)를 먼저 보고, 그다음 `users.role` 을 읽는다 —
     * 관리자 판단의 두 갈래가 `lib/auth/admin` 과 같은 순서다.
     *
     * 이메일이 없으면 거절한다. 판단할 근거가 없는데 들이는 쪽으로 기울 이유가 없다.
     */
    async signIn({ user }) {
      const email = user.email ?? null;
      if (!email) return false;

      if (isSeedAdmin(email)) return true;

      // DB 가 없으면 `users.role` 을 물을 곳이 없다. 그 구성에서 인정되는 관리자는
      // 씨앗뿐이고, 위에서 이미 봤다.
      if (!hasDatabase) return false;

      const known = await findUserByEmail(email);
      return known?.role === "admin";
    },

    /**
     * 토큰에 사용자 ID 와 권한을 싣는다. **권한은 매 요청 DB 에서 다시 읽는다.**
     *
     * 로그인 시점 값을 그대로 들고 다니면, 관리자를 강등해도 그 사람의 토큰이 만료될
     * 때까지(기본 30일) 관리자로 남는다. 권한은 그렇게 오래 틀려 있어도 되는 값이
     * 아니다 — 그래서 조회를 감수한다.
     *
     * 비용은 **DB 세션일 때와 같다.** 그때도 매 요청 `sessions`+`users` 를 읽었고,
     * 지금은 PK 로 `users` 한 줄을 읽는다. 늘어난 것이 없다.
     */
    async jwt({ token, user }) {
      // 로그인 직후. `user` 는 credentials 의 authorize 반환값이거나 어댑터가 만든 행이다.
      if (user?.id) token.sub = user.id;

      if (!token.sub) return token;

      const { rows } = await authPool().query<{ role: string | null }>(
        `select role from users where id = $1`,
        [token.sub],
      );

      // 계정이 지워졌다면 토큰을 무효로 만든다 — 남은 쿠키로 계속 도는 것을 막는
      // 유일한 자리다(JWT 라 서버가 세션을 지울 수 없다).
      if (rows.length === 0) return null;

      // **기본값이 `"user"` 인 것이 중요하다.** 컬럼이 없는 환경(마이그레이션 전)에서
      // `undefined` 가 그대로 흐르면, 그 값을 비교하는 쪽이 실수 한 번으로 통과시킬
      // 여지가 생긴다. 모르면 권한 없음이다.
      token.role = rows[0].role === "admin" ? "admin" : "user";
      return token;
    },

    /**
     * 세션에 사용자 ID 와 권한을 실어 준다.
     *
     * 관심종목 소유자 키(`user:<id>`)가 `id` 에서 나온다 — 없으면 로그인해도 익명
     * 목록을 계속 보게 된다. JWT 전략에서는 `user` 가 아니라 **`token`** 으로 온다
     * (`@auth/core/lib/actions/session.js`).
     */
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.role = token.role === "admin" ? "admin" : "user";
      return session;
    },
    /**
     * 미들웨어 단계에서는 아무것도 막지 않는다. 관심종목·종목 상세·시장 현황은
     * 익명으로 쓸 수 있어야 하고, 로그인이 필요한 곳(`/dashboard`)은 그 화면이
     * 직접 `currentUser()` 로 판단한다 — 규칙이 한 군데 더 생기는 것보다
     * 그 화면 옆에 있는 편이 읽기 쉽다.
     */
    authorized: () => true,
  },
});

/**
 * 지금 로그인한 사용자. 없으면 `null`.
 *
 * **한 요청 안에서 세션을 한 번만 읽는다.** 로그인이 켜져 있으면 세션 전략이
 * `database` 라 `auth()` 한 번이 Supabase 조회 한 번이다. 제호(`AccountMenu`)와
 * 탭바가 각자 부르고 화면까지 부르면 한 페이지에 세 번이 된다 — React `cache` 로
 * 묶어 첫 호출 결과를 나머지가 받는다.
 */
export const currentUser = cache(async () => (await auth())?.user ?? null);
