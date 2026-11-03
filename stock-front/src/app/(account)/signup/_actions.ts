"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAccount, looksLikeEmail, normalizeEmail } from "@/lib/auth/accounts";
import { passwordProblem } from "@/lib/auth/password";
import {
  createVerificationToken,
  sendVerificationEmail,
  SIGNUP_ENABLED,
} from "@/lib/auth/signup";

/**
 * 공개 회원가입 — **개발자 모드에서만 동작한다.**
 *
 * ## 가드가 화면과 **따로** 있어야 한다
 *
 * `page.tsx` 가 이미 `SIGNUP_ENABLED` 를 보고 404 를 내지만, 서버 액션은 **화면과
 * 별개의 진입점**이다. 브라우저는 액션 ID 로 직접 POST 할 수 있고 그때 페이지
 * 컴포넌트는 실행되지 않는다 — 즉 화면의 가드는 이 함수를 보호하지 못한다.
 * `admin/_actions.ts` 가 `requireAdmin()` 을 두 번 부르는 것과 같은 이유다.
 *
 * ## 가입 여부를 알려주지 않는다
 *
 * 이미 있는 이메일이어도 **성공과 같은 화면**으로 보낸다. 다르게 답하면 이 폼이
 * "이 이메일이 가입돼 있는지" 를 확인해 주는 도구가 된다. 실제로 만들어지지 않았으니
 * 인증 메일도 안 가고, 그 계정 주인에게는 아무 일도 일어나지 않는다.
 */
export async function signUpAction(formData: FormData): Promise<void> {
  if (!SIGNUP_ENABLED) redirect("/login");

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");

  if (!looksLikeEmail(email)) {
    redirect("/signup?error=" + encodeURIComponent("이메일 주소를 확인해 주세요."));
  }

  const problem = passwordProblem(password);
  if (problem) redirect("/signup?error=" + encodeURIComponent(problem));

  // 인증 전에는 로그인할 수 없다 — `auth.ts` 의 authorize 가 emailVerified 를 본다.
  const created = await createAccount({ email, password, name, verified: false });

  if (created.ok) {
    const token = await createVerificationToken(email);
    const url = `${await originOfRequest()}/verify?email=${encodeURIComponent(
      email,
    )}&token=${encodeURIComponent(token)}`;
    await sendVerificationEmail(email, url);
  }

  redirect("/signup?sent=1");
}

/**
 * 인증 링크에 쓸 주소.
 *
 * 환경변수(`AUTH_URL`)를 먼저 보고, 없으면 **이번 요청의 호스트**를 쓴다. 개발자
 * 모드 전용 기능이라 대개 `localhost:3000` 이고, 포트를 바꿔 띄웠을 때 링크가 3000 을
 * 가리키면 열리지 않는다 — 요청에서 읽으면 그런 일이 없다.
 */
async function originOfRequest(): Promise<string> {
  const configured = process.env.AUTH_URL?.replace(/\/+$/, "");
  if (configured) return configured;

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
