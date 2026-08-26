import type { DefaultSession } from "next-auth";

/**
 * NextAuth 세션에 우리 필드를 더한다 — **모듈 보강(module augmentation)이다.**
 *
 * `auth.ts` 의 `session()` 콜백이 `session.user.role` 을 채우는데, 라이브러리 타입에는
 * 그 필드가 없다. 보강하지 않으면 두 가지 중 하나가 된다: 콜백에서 타입 에러가 나거나,
 * `as any` 로 뭉개서 **읽는 쪽에서 오타가 조용히 `undefined`** 가 된다.
 *
 * 후자가 위험한 이유는 이 값이 권한이기 때문이다. `session.user.rol === "admin"` 은
 * 항상 false 라 아무도 못 들어가는 것으로 끝나지만, 반대로 비교 방향이 뒤집힌 실수는
 * 전원을 관리자로 만든다. 컴파일러가 잡게 두는 편이 비교할 수 없이 낫다.
 *
 * `shared/types/` 에 두는 것은 CONVENTIONS 의 "여러 도메인이 공유하는 타입" 자리라서다.
 * 이 파일은 import 없이 전역에 적용되므로 `index.ts` 로 내보내지 않는다.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** `users.role`. 어댑터가 `select *` 로 읽어 세션 콜백까지 실려 온다 */
      role: "user" | "admin";
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
  }
}

/**
 * 세션 전략이 `jwt` 라(비밀번호 로그인이 그것만 지원한다 — `auth.ts`) 권한은 **토큰을
 * 거쳐** 세션에 닿는다. `session({ session, token })` 이 읽는 필드라 여기도 보강한다.
 */
declare module "next-auth/jwt" {
  interface JWT {
    role?: "user" | "admin";
  }
}
