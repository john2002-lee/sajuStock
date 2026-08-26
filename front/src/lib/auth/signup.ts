import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import { authPool } from "@/lib/auth/pool";
import { normalizeEmail } from "@/lib/auth/accounts";

/**
 * 공개 회원가입과 이메일 인증 — **개발자 모드에서만 동작한다.**
 *
 * ## 왜 잠가 두는가
 *
 * 지금 계정은 관리자가 만든다(2026-08-18 결정). 가입 화면을 미리 만들어 두되 열지는
 * 않는 이유는, 열려 있는 가입 폼이 **봇 등록·메일 발송 남용의 입구**이기 때문이다 —
 * 크리덴셜 방식이 원래 안고 있는 위험이고, 지금 그것을 감당할 방어(레이트 리밋·
 * 캡차·이상 탐지)가 아직 없다.
 *
 * ## `NODE_ENV` 로 판단한다 — 환경변수 스위치가 아니라
 *
 * 별도 플래그를 두면 배포 환경에서 **실수로 켤 수 있다.** `next build` 로 만든
 * 산출물은 `NODE_ENV=production` 이라, 이 조건은 배포에서 어떤 설정으로도 참이 되지
 * 않는다. 나중에 진짜로 열 때는 이 상수를 플래그로 바꾸는 **명시적인 커밋**이 남는다.
 */
export const SIGNUP_ENABLED = process.env.NODE_ENV === "development";

/** 인증 링크 수명. 짧을수록 좋지만 메일이 늦게 도착하는 경우가 있다. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 토큰은 **해시로 저장한다.**
 *
 * 원문을 저장하면 DB 를 한 번 읽은 사람이 그 링크를 그대로 쓸 수 있다 — 비밀번호를
 * 해시하는 것과 같은 이유다. 여기는 고엔트로피 난수라 느린 KDF 가 필요 없고,
 * SHA-256 이면 충분하다.
 */
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * 인증 토큰을 만들어 저장하고 **원문**을 돌려준다.
 *
 * 같은 이메일로 여러 번 요청하면 이전 것을 지운다 — 안 지우면 옛 링크가 계속 유효해
 * 살아 있는 열쇠가 쌓인다.
 */
export async function createVerificationToken(email: string): Promise<string> {
  const identifier = normalizeEmail(email);
  const raw = randomBytes(32).toString("base64url");

  const client = authPool();
  await client.query(`delete from verification_token where identifier = $1`, [identifier]);
  await client.query(
    `insert into verification_token (identifier, token, expires) values ($1, $2, $3)`,
    [identifier, hashToken(raw), new Date(Date.now() + TOKEN_TTL_MS)],
  );

  return raw;
}

/**
 * 토큰을 한 번 쓰고 없앤다.
 *
 * `delete ... returning` 한 문장이다. "조회 → 검사 → 삭제" 로 나누면 같은 링크를
 * 동시에 두 번 눌렀을 때 둘 다 통과하는 창이 생긴다.
 *
 * 만료는 삭제 뒤에 검사한다 — 만료된 토큰도 어차피 없애야 하기 때문이다.
 */
export async function consumeVerificationToken(
  email: string,
  rawToken: string,
): Promise<boolean> {
  const identifier = normalizeEmail(email);
  const digest = hashToken(rawToken);

  const { rows } = await authPool().query<{ token: string; expires: Date }>(
    `delete from verification_token
      where identifier = $1 and token = $2
      returning token, expires`,
    [identifier, digest],
  );

  const row = rows[0];
  if (!row) return false;

  // 길이가 같은 hex 문자열끼리의 비교라 timingSafeEqual 을 쓸 수 있다. 위 쿼리가
  // 이미 일치를 판정했지만, 비교를 한 번 더 두어 **어디서 판정하는지**를 명확히 한다.
  const stored = Buffer.from(row.token, "utf8");
  const given = Buffer.from(digest, "utf8");
  if (stored.length !== given.length || !timingSafeEqual(stored, given)) return false;

  return row.expires.getTime() > Date.now();
}

/**
 * 인증 메일을 보낸다. **주소는 서버 로그에도 남긴다.**
 *
 * 개발자 모드 전용 기능이라 메일이 실제로 도착하지 않는 환경(SMTP 미설정·샌드박스
 * 수신 제한)이 흔하다. 그때 링크를 볼 방법이 없으면 가입을 끝낼 수 없어 기능 자체를
 * 확인하지 못한다. 콘솔에 찍어 두면 메일 없이도 흐름을 탈 수 있다.
 *
 * 운영에서 이 함수가 불릴 일은 없다 — 가입이 `SIGNUP_ENABLED` 뒤에 있다.
 */
export async function sendVerificationEmail(email: string, url: string): Promise<void> {
  console.info(`[signup] 인증 링크 (${email}): ${url}`);

  const server = process.env.EMAIL_SERVER;
  const from = process.env.EMAIL_FROM;
  if (!server || !from) return;

  try {
    await nodemailer.createTransport(server).sendMail({
      to: email,
      from,
      subject: "종목 원장 — 이메일 인증",
      text: `아래 주소를 열면 가입이 끝납니다. 24시간 안에 열어 주세요.\n\n${url}\n`,
    });
  } catch (error) {
    // 메일 실패로 가입 자체를 되돌리지 않는다 — 계정은 이미 만들어졌고, 링크는
    // 로그에 있다. 다시 보내는 경로는 아직 없다(개발자 모드 한정 기능).
    console.error("[signup] 인증 메일 발송 실패", error);
  }
}
