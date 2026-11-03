"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

/**
 * `useSession()` 을 쓸 수 있게 하는 컨텍스트.
 *
 * `session={null}` 을 명시적으로 넘긴다. 이 prop 이 undefined 면 SessionProvider 가
 * 마운트 즉시 `/api/auth/session` 을 부르는데, providers 가 비어 있는 지금은
 * 결과가 항상 null 이라 순수한 낭비다 (게다가 AUTH_SECRET 이 없으면 500 이 난다).
 * 로그인을 켤 때 이 prop 을 지우거나 서버에서 `await auth()` 결과를 내려주면 된다.
 *
 * refetchOnWindowFocus 도 끈다 — 기본값이면 탭을 옮길 때마다 세션을 다시 부른다.
 * JWT 세션이라 만료 전까지 다시 물을 이유가 없다.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider
      session={null}
      refetchOnWindowFocus={false}
      refetchInterval={0}
    >
      {children}
    </NextAuthSessionProvider>
  );
}
