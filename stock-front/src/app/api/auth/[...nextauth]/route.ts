import { handlers } from "@/auth";
import { withBrowserSessionCookie } from "@/lib/auth/session-cookie";

/**
 * NextAuth 라우트 핸들러. 구성은 src/auth.ts 한 곳에만 둔다.
 * providers 가 비어 있는 동안에도 이 엔드포인트는 살아 있고
 * `/api/auth/session` 은 빈 세션(null)을 돌려준다.
 *
 * ## 왜 그대로 내보내지 않고 감싸나
 *
 * 세션 쿠키에서 만료 시각을 떼어 **브라우저를 닫으면 로그아웃**되게 만든다.
 * Auth.js 설정으로는 안 되는 일이라(근거는 `lib/auth/session-cookie` 파일 주석)
 * 응답 헤더에서 처리하고, 그 일을 할 수 있는 유일한 자리가 여기다.
 *
 * **여기 하나로 충분하다.** 서버 컴포넌트의 `auth()` 는 내부 Request 를 만들어
 * 세션 본문만 읽고 그 응답의 Set-Cookie 는 버리므로(`next-auth` 의 `getSession`),
 * 브라우저에 실제로 쿠키를 굽는 경로는 이 라우트뿐이다 — 로그인 콜백도,
 * 로그아웃도, `useSession` 이 폴링하는 `/api/auth/session` 도 전부 여기를 지난다.
 */
export async function GET(request: Parameters<typeof handlers.GET>[0]) {
  return withBrowserSessionCookie(await handlers.GET(request));
}

export async function POST(request: Parameters<typeof handlers.POST>[0]) {
  return withBrowserSessionCookie(await handlers.POST(request));
}
