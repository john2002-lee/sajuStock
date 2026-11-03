import { currentUser } from "@/auth";
import { readAnonOwnerKey, userOwnerKey } from "@/lib/watchlist/owner";

/**
 * 이 요청이 볼 관심종목의 주인.
 *
 * **로그인했으면 계정, 아니면 브라우저.** 이 함수 하나가 그 규칙의 유일한 출처라
 * 화면·BFF 어디서도 "로그인했나" 를 다시 판단하지 않는다. 백엔드는 둘을 구분조차
 * 하지 않는다 — `owner_key` 가 불투명한 문자열이기 때문이다(9회차 설계).
 *
 * 로그인 상태에서 익명 쿠키는 그대로 남겨 둔다. 지우면 로그아웃했을 때 예전 목록을
 * 볼 수 없는데, 승계는 **이동**이라 그때 익명 쪽은 이미 비어 있다 — 쿠키만 남고
 * 목록은 계정에 있는 상태가 맞다.
 *
 * ## 왜 `lib/` 이 아니라 여기인가
 *
 * 쿠키를 읽는 부분(`readAnonOwnerKey`)과 키 모양(`userOwnerKey`)은 `lib/` 에 있다.
 * 여기가 하는 일은 **세션과 그 둘을 엮는 것**이고, 그러려면 NextAuth 를 알아야 한다.
 * `lib/` 이 그것을 알면 "프레임워크 무관 어댑터" 계약이 깨지고 단위 테스트도
 * NextAuth 를 띄워야 한다 (CONVENTIONS '예외적으로 허용되는 배치').
 */
export async function readOwnerKey(): Promise<string> {
  // 맨 `auth()` 가 아니라 `currentUser()` 다 — 그쪽은 React `cache` 로 묶여 있어
  // 한 요청 안에서 세션을 한 번만 푼다. 이 함수는 한 렌더에서 여러 번 불리고
  // (레이아웃·페이지·BFF 라우트), 세션 전략이 `database` 면 호출마다 Supabase
  // 조회가 하나씩 붙는다.
  const user = await currentUser();
  if (user?.id) return userOwnerKey(user.id);

  return readAnonOwnerKey();
}

/**
 * 로그인한 계정의 소유자 키. **익명이면 null 이다.**
 *
 * `readOwnerKey()` 와 같은 신원을 보지만 **질문이 다르다.** 저쪽은 "이 요청이 볼
 * 목록은 누구 것인가" 라 익명에게도 답이 있고, 이쪽은 "이 요청에 계정이 있는가" 라
 * 익명에게는 답이 없다. 익명에게 열어 줄 수 없는 기능(AI 판단)이 이것을 본다.
 *
 * 익명 쿠키로 얼버무리지 않는 것이 요점이다. `proxy.ts` 가 모든 방문자에게 익명
 * 쿠키를 구워 주므로 그 값이 있다는 사실은 "브라우저로 왔다" 이상을 말해 주지
 * 않는다 — 지우고 다시 오면 새 사람이라, 소유자 단위 상한이 그렇게 우회된다.
 */
export async function readAccountOwnerKey(): Promise<string | null> {
  // `readOwnerKey()` 와 같은 이유로 `currentUser()` 다 — 요청 단위 캐시를 공유해
  // 한 렌더에서 세션을 여러 번 풀지 않는다.
  const user = await currentUser();
  return user?.id ? userOwnerKey(user.id) : null;
}
