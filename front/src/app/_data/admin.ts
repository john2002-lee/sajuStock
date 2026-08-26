import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { adminActorOf, type AdminActor } from "@/lib/auth/admin";

/**
 * 이 요청이 관리자인가 — **세션을 읽어 정책에 묻는다.**
 *
 * ## 왜 `lib/` 이 아니라 여기인가
 *
 * 판단 규칙 자체(`adminActorOf`)는 세션을 인자로 받는 순수 함수라 `lib/auth/admin`
 * 에 있다. 반면 **세션을 실제로 읽는 일**은 NextAuth 에 묶이고, `lib/` 이 그것을
 * 알면 "프레임워크 무관 어댑터" 계약이 깨진다. 신원(세션·쿠키)을 도메인과 엮는
 * 조립은 app 계층의 몫이라는 규칙을 따른다 (CONVENTIONS '예외적으로 허용되는 배치',
 * `_data/watchlist.ts` 와 같은 자리).
 *
 * ## 관리자가 아니면 404 다
 *
 * 403 은 "여기 뭔가 있는데 네 권한이 부족하다" 를 알려 준다. 관리자 화면은 존재
 * 자체를 광고할 이유가 없고, 로그인 화면으로 보내는 것도 "이 경로는 실재한다" 는
 * 신호다. 없는 것처럼 보이는 편이 낫다.
 *
 * **관리자 화면·서버 액션·라우트 핸들러는 예외 없이 이것을 먼저 부른다.** 메뉴를
 * 감추는 것은 보안이 아니다 — URL 을 직접 치면 그만이고, 서버 액션은 화면을 거치지
 * 않고도 액션 ID 로 불린다.
 */
export async function requireAdmin(): Promise<AdminActor> {
  const actor = adminActorOf(await auth());
  if (!actor) notFound();
  return actor;
}
