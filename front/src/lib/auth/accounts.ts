import { authPool } from "@/lib/auth/pool";
import { hashPassword } from "@/lib/auth/password";

/**
 * 비밀번호 로그인이 쓰는 `users` 조회·쓰기.
 *
 * ## 왜 FastAPI 가 아니라 여기인가
 *
 * `users`·`accounts`·`sessions`·`verification_token` 넷은 **NextAuth 어댑터의 것**이고
 * 프런트가 직접 붙는다 (`pool.ts`). 백엔드는 스키마만 소유한다. 비밀번호도 그 테이블에
 * 사는 값이라 같은 문을 쓴다 — 여기만 예외로 FastAPI 를 거치게 하면 같은 행을 두 곳이
 * 쓰게 되고, 어느 쪽이 주인인지 흐려진다.
 *
 * ## 이메일은 소문자로 저장·조회한다
 *
 * 구글이 주는 이메일과 사람이 타이핑한 이메일의 대소문자가 다를 수 있다. 다르게
 * 저장되면 `users_email_key`(유니크)가 **같은 사람을 두 계정으로** 만든다 — 그러면
 * 관심종목이 갈라지고, 어느 쪽이 진짜인지 사용자도 모른다.
 */

export interface CredentialUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: string;
  passwordHash: string | null;
  emailVerified: Date | null;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 대충 이메일 모양인가. 진짜 검증은 인증 메일이 한다 — 여기는 오타 거르기다. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
}

export async function findUserByEmail(email: string): Promise<CredentialUser | null> {
  const { rows } = await authPool().query<{
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
    role: string | null;
    password_hash: string | null;
    emailVerified: Date | null;
  }>(
    `select id, email, name, image, role, password_hash, "emailVerified"
       from users
      where lower(email) = $1
      limit 1`,
    [normalizeEmail(email)],
  );

  const row = rows[0];
  if (!row?.email) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    // 모르면 권한 없음이다 (`auth.ts` 의 session 콜백과 같은 기본값).
    role: row.role === "admin" ? "admin" : "user",
    passwordHash: row.password_hash,
    emailVerified: row.emailVerified,
  };
}

export interface CreateAccountInput {
  email: string;
  password: string;
  name?: string | null;
  /**
   * 이메일 인증을 건너뛸 것인가.
   *
   * 관리자가 만든 계정은 `true` 다 — 관리자가 이미 그 사람을 아는데 확인 메일을
   * 기다리게 할 이유가 없고, 그러면 메일이 안 갈 때 계정이 영영 잠긴다.
   * 공개 가입(개발자 모드)은 `false` 로 만들고 인증 링크를 보낸다.
   */
  verified: boolean;
}

export type CreateAccountResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "duplicate" };

/**
 * 계정을 만든다. 이미 있는 이메일이면 **덮어쓰지 않고** 거절한다.
 *
 * `on conflict do nothing` 으로 경쟁 상태까지 DB 가 판정하게 한다 — "먼저 조회하고
 * 없으면 삽입" 은 두 요청이 동시에 오면 둘 다 통과한다(유니크 제약이 뒤늦게 한쪽을
 * 터뜨린다). 판정을 한 문장 안에 두면 그 창이 없다.
 */
export async function createAccount(
  input: CreateAccountInput,
): Promise<CreateAccountResult> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);

  const { rows } = await authPool().query<{ id: string }>(
    `insert into users (email, name, password_hash, "emailVerified")
          values ($1, $2, $3, $4)
     on conflict (email) do nothing
       returning id`,
    [email, input.name?.trim() || null, passwordHash, input.verified ? new Date() : null],
  );

  const created = rows[0];
  if (!created) return { ok: false, reason: "duplicate" };
  return { ok: true, userId: created.id };
}

/**
 * 이미 있는 계정에 비밀번호를 붙이거나 바꾼다.
 *
 * 구글로 만든 계정에 비밀번호를 더하는 경로이기도 하다 — 같은 이메일이면 같은
 * 계정이므로(`users_email_key`), 두 수단이 한 사람을 가리킨다.
 */
export async function setPassword(userId: string, password: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  const { rowCount } = await authPool().query(
    `update users set password_hash = $2 where id = $1`,
    [userId, passwordHash],
  );
  return (rowCount ?? 0) > 0;
}

/** 인증 메일 링크를 눌렀을 때. 이미 인증돼 있으면 시각을 덮어쓰지 않는다. */
export async function markEmailVerified(email: string): Promise<boolean> {
  const { rowCount } = await authPool().query(
    `update users
        set "emailVerified" = now()
      where lower(email) = $1
        and "emailVerified" is null`,
    [normalizeEmail(email)],
  );
  return (rowCount ?? 0) > 0;
}
