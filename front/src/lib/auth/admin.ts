import type { Session } from "next-auth";

/**
 * 관리자 인가 **규칙** — 누가 관리자인가를 판단하는 순수 정책.
 *
 * ## 세션을 여기서 읽지 않는다
 *
 * 예전에는 이 파일이 `@/auth` 를 import 해 `requireAdmin()` 까지 들고 있었다.
 * 그러면 `lib/` 이 NextAuth(어댑터의 `pg`·`nodemailer` 포함)에 묶여
 * "React·프레임워크 무관 어댑터" 라는 계약이 깨진다(CONVENTIONS 3: `lib/` 은
 * 아무것도 import 하지 않는다). 실질적인 대가도 있었다 — 이 정책을 단위 테스트하려면
 * NextAuth 를 띄워야 했다.
 *
 * 그래서 **세션을 받아 판단하는 부분만** 남기고, 세션을 실제로 읽는 일은
 * `app/_data/admin.ts` 로 올렸다. 신원과 도메인을 엮는 것은 app 계층의 몫이라는
 * 규칙(CONVENTIONS '예외적으로 허용되는 배치')을 그대로 따른다.
 *
 * ## 두 겹인데 이쪽이 진짜다
 *
 *     브라우저 ──(세션 쿠키)──▶ Next /admin/*   ← 여기서 판단한다
 *                                  │
 *                                  └──(X-Admin-Key)──▶ FastAPI /admin/*
 *
 * 백엔드의 `X-Admin-Key` 는 **인증이 아니라 2차 방어선**이다. 그 키만 아는 사람은
 * 로그인 없이도 관리자 API 를 부를 수 있으므로, 백엔드는 "이 요청이 관리자에게서
 * 왔다" 를 검증할 수 없다 (`back/app/api/auth.require_admin_key` 주석). 그 판단은
 * 세션을 볼 수 있는 여기서만 가능하다.
 *
 * 따라서 **관리자 화면·라우트 핸들러는 예외 없이 `requireAdmin()` 을 먼저 부른다.**
 * 메뉴를 감추는 것은 보안이 아니다 — URL 을 직접 치면 그만이고, BFF 라우트는 화면
 * 없이도 불린다.
 *
 * ## `ADMIN_EMAILS` — 잠기지 않기 위한 마스터키
 *
 * 권한은 `users.role` 이 들지만, 그것만 두면 **자기 권한을 잘못 지웠을 때 복구
 * 경로가 DB 직접 수정뿐**이 된다. 서비스가 그 상태로 잠기는 것은 최악이라, 환경
 * 변수에 적힌 이메일은 DB 와 무관하게 항상 관리자로 인정한다.
 *
 * 백엔드에도 같은 규칙을 두지 않는 이유: 그쪽은 세션을 못 보므로 이메일을 알 수
 * 없고, 안다 해도 헤더로 받은 값이라 믿을 수 없다. 이 규칙은 **여기에만** 있어야
 * 뜻이 있다.
 */

/** DB 가 뭐라 하든 관리자인 이메일. 쉼표로 나눈다. */
const SEED_ADMINS = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),
);

/** 관리자 기능이 설정돼 있는가. 화면이 링크를 그릴지 정하는 데도 쓴다. */
export const ADMIN_CONFIGURED =
  SEED_ADMINS.size > 0 || Boolean(process.env.ADMIN_API_KEY);

export interface AdminActor {
  userId: string;
  email: string | null;
  /** 환경변수 씨앗으로 들어왔는가. 화면이 "이 권한은 DB 가 아니라 설정에서 온다" 를 말한다 */
  viaSeed: boolean;
}

/**
 * 이 세션이 관리자인가. **판단 규칙의 단일 출처다.**
 *
 * 이메일 비교는 소문자로 한다 — 구글이 주는 이메일의 대소문자가 환경변수에 적어 둔
 * 것과 다를 수 있고, 그때 "관리자인데 안 들어가진다" 는 원인을 찾기 어렵다.
 */
export function adminActorOf(session: Session | null): AdminActor | null {
  const user = session?.user;
  if (!user?.id) return null;

  const email = user.email ?? null;
  const seeded = Boolean(email && SEED_ADMINS.has(email.toLowerCase()));
  if (!seeded && user.role !== "admin") return null;

  return { userId: user.id, email, viaSeed: seeded };
}

/**
 * 관리자 API 를 부를 때 FastAPI 에 붙일 헤더.
 *
 * `X-Admin-Actor` 는 감사 로그용이다 — 백엔드는 이 값을 검증하지 않으며, 검증된
 * 것으로 취급해서도 안 된다. 그래서 **`requireAdmin()` 을 통과한 뒤에만** 이 함수를
 * 부른다. 그 순서가 깨지면 감사 로그가 "프런트가 그렇게 주장했다" 이상의 의미를 잃는다.
 */
export function adminHeaders(actor: AdminActor): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Admin-Actor": actor.userId,
  };
  if (process.env.ADMIN_API_KEY) headers["X-Admin-Key"] = process.env.ADMIN_API_KEY;
  if (actor.email) headers["X-Admin-Actor-Email"] = actor.email;
  return headers;
}
