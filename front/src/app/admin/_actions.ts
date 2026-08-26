"use server";

import { deleteUser, updateRole } from "@/features/common/admin";
import { createAccount, looksLikeEmail, normalizeEmail } from "@/lib/auth/accounts";
import { passwordProblem } from "@/lib/auth/password";
import { ApiError } from "@/lib/api";
import { requireAdmin } from "@/app/_data/admin";
import type { Role } from "@/features/common/admin";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FLASH_PASSWORD_COOKIE } from "./_flash-password";

/**
 * 관리자 변경 동작 — 권한 수정과 회원 삭제.
 *
 * ## 가드가 **여기에도** 있는 이유
 *
 * 화면(`page.tsx`)이 이미 `requireAdmin()` 을 부르지만, 서버 액션은 **화면과 별개의
 * 진입점**이다. 브라우저는 액션 ID 로 직접 POST 할 수 있고 그때 페이지 컴포넌트는
 * 실행되지 않는다. 즉 화면의 가드는 이 함수를 보호하지 못한다.
 *
 * "메뉴를 숨기는 것은 보안이 아니다" 와 같은 말이고, 서버 액션 버전이다.
 *
 * ## 실패를 예외로 던지지 않고 **주소로 옮긴다**
 *
 * 백엔드의 거절 메시지("마지막 관리자입니다")는 사용자에게 그대로 보여줄 말이다.
 * 예외로 던지면 error.tsx 의 일반 오류 화면이 되어 그 문장이 사라진다. 그래서
 * `?error=` 로 되돌려 보내고 화면이 읽는다 — 로그인 실패를 `/login?error=` 로
 * 받는 것과 같은 방식이다.
 */

function backTo(userId: string, params: Record<string, string>): never {
  const query = new URLSearchParams(params).toString();
  redirect(`/admin/users/${encodeURIComponent(userId)}${query ? `?${query}` : ""}`);
}

/** 백엔드가 준 거절 사유. 없으면 일반 문장으로 떨어뜨린다. */
function reasonOf(error: unknown): string {
  if (error instanceof ApiError && error.message) return error.message;
  return "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!userId || (role !== "user" && role !== "admin")) {
    backTo(userId, { error: "요청이 올바르지 않습니다." });
  }

  try {
    await updateRole(actor, userId, role as Role);
  } catch (error) {
    backTo(userId, { error: reasonOf(error) });
  }

  // 목록도 함께 무효화한다 — 권한 뱃지와 관리자 수가 그 화면에 있다.
  revalidatePath("/admin/users");
  backTo(userId, { done: role === "admin" ? "granted" : "revoked" });
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const typed = String(formData.get("confirmEmail") ?? "").trim();
  const expected = String(formData.get("expectedEmail") ?? "").trim();

  // **이메일을 직접 입력하게 한다.** 확인 버튼 하나는 습관적으로 눌린다 —
  // 되돌릴 수 없는 일에는 "지금 무엇을 지우는지" 를 손으로 쓰게 하는 마찰이 필요하다.
  if (!expected || typed.toLowerCase() !== expected.toLowerCase()) {
    backTo(userId, {
      confirm: "delete",
      error: "이메일이 일치하지 않습니다. 지울 계정의 이메일을 그대로 입력하세요.",
    });
  }

  try {
    await deleteUser(actor, userId);
  } catch (error) {
    backTo(userId, { confirm: "delete", error: reasonOf(error) });
  }

  revalidatePath("/admin/users");
  // 지워진 회원의 상세로 돌아갈 수 없다 — 목록으로 보낸다.
  redirect("/admin/users?done=deleted");
}

/**
 * 계정 발급 — **지금 이 서비스에서 계정이 생기는 유일한 경로다.**
 *
 * 공개 가입(`/signup`)은 개발자 모드에서만 열리므로, 배포에서는 여기가 전부다.
 *
 * ## 왜 FastAPI 가 아니라 프런트가 쓰는가
 *
 * 이 액션은 `users` 에 **비밀번호 해시와 함께** 행을 만든다. 그 테이블은 NextAuth
 * 어댑터의 것이고 프런트가 직접 붙는다 (`lib/auth/pool.ts`). 권한 변경·삭제가
 * FastAPI 를 거치는 것과 달라 보이지만, 그쪽은 관심종목·투자 성향까지 함께 지우는
 * **도메인 작업**이라 백엔드의 일이다. 계정 생성은 인증 테이블 안에서 끝난다.
 *
 * ## 만들자마자 인증 표시를 붙인다
 *
 * `verified: true` 다. 관리자가 이미 그 사람을 알고 발급하는 것이라 확인 메일을
 * 기다릴 이유가 없고, 그렇게 두면 메일이 안 갈 때 계정이 영영 잠긴다
 * (`auth.ts` 의 authorize 가 `emailVerified` 를 본다).
 *
 * ## 비밀번호를 화면에 한 번 보여주고 끝낸다
 *
 * 해시만 저장하므로 **다시 볼 방법이 없다.** 그래서 발급 직후 화면에 한 번 띄우고,
 * 관리자가 그것을 당사자에게 전달한다. `FLASH_PASSWORD_COOKIE` 로 실어 보낸다 —
 * 임시 비밀번호이고, 받은 사람이 바꾸는 것이 전제다. (변경 화면은 아직 없다.
 * 남은 일이다.)
 */
export async function createAccountAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const name = String(formData.get("name") ?? "");
  const password = String(formData.get("password") ?? "");

  const back = (params: Record<string, string>): never => {
    const query = new URLSearchParams(params).toString();
    redirect(`/admin/users${query ? `?${query}` : ""}`);
  };

  if (!looksLikeEmail(email)) back({ error: "이메일 주소를 확인해 주세요." });

  const problem = passwordProblem(password);
  if (problem) back({ error: problem });

  const created = await createAccount({ email, password, name, verified: true });

  // 여기서는 중복을 **그대로 알려준다.** 공개 가입 폼과 달리 이 화면은 이미 관리자만
  // 볼 수 있고, 회원 목록에서 같은 사실을 검색으로 확인할 수 있다. 숨기면 관리자가
  // "왜 안 만들어졌지" 를 알 방법이 없다.
  if (!created.ok) back({ error: `${email} 은(는) 이미 등록된 이메일입니다.` });

  const jar = await cookies();
  jar.set(FLASH_PASSWORD_COOKIE, password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin/users",
    maxAge: 60,
  });

  revalidatePath("/admin/users");
  back({ created: email });
}
