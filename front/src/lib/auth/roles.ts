/**
 * `users.role` 의 세 값과 그 값이 무엇을 여는가.
 *
 *   admin  — 로그인 + `/admin` + 주식 서비스
 *   viewer — 로그인 + 주식 서비스. `/admin` 은 404 다 (`adminActorOf` 가 admin 만 본다)
 *   user   — 로그인 문턱에서 돌아간다
 *
 * `viewer` 는 운영 권한 없이 주식 서비스만 보여 줄 공용 계정(guest)을 위해 생겼다.
 * 계정 관리·감사 로그는 여전히 admin 뿐이다.
 *
 * ## 모르면 권한 없음이다
 *
 * 컬럼은 `String(20)` 이라 무엇이든 들어갈 수 있다(ENUM 이 아닌 이유는 마이그레이션
 * `c9b3e7d21a08` 에 있다). 낯선 값이 그대로 흐르면 그것을 비교하는 쪽이 실수 한 번으로
 * 통과시킬 여지가 생기므로 **읽는 즉시** 세 값으로 좁힌다.
 */

export type Role = "user" | "viewer" | "admin";

export function toRole(raw: unknown): Role {
  return raw === "admin" || raw === "viewer" ? raw : "user";
}

/** 로그인 문턱(`auth.ts` 의 `signIn` 콜백)을 넘는가. */
export function canSignIn(role: unknown): boolean {
  const known = toRole(role);
  return known === "admin" || known === "viewer";
}

/**
 * 돌아갈 자리 없이 로그인했을 때 첫 화면.
 *
 * 관리자는 운영 현황이고, 그 밖은 주식 서비스다 — 열람자를 `/admin` 으로 보내면
 * 로그인에 성공하고도 404 를 보게 된다.
 *
 * 역할이 아니라 **관리자 판단 결과**를 받는다. 관리자는 `users.role` 말고도
 * `ADMIN_EMAILS` 씨앗으로 정해지고, 그 판단은 `adminActorOf` 한 곳에만 있다.
 */
export function homePathFor(isAdmin: boolean): string {
  return isAdmin ? "/admin" : "/stock";
}
