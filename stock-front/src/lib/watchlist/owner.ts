import { cookies } from "next/headers";
import { isOwnerKey, OWNER_COOKIE } from "./anon-cookie";

/**
 * 익명 소유자 쿠키를 **읽는** 쪽.
 *
 * 쿠키를 만들고 알아보는 원시 부분은 `anon-cookie.ts` 에 있다 — 그 파일은
 * `next/headers` 조차 모르므로 Edge 런타임(`proxy.ts`)에서도 쓸 수 있다.
 *
 * ## 세션은 여기서 보지 않는다
 *
 * 예전에는 이 파일이 `@/auth` 를 import 해 "로그인이면 계정, 아니면 브라우저" 를
 * 판단했다. 그러면 `lib/` 이 NextAuth 에 묶여 "프레임워크 무관 어댑터" 계약이
 * 깨진다(CONVENTIONS 3). 그 판단은 `app/_data/owner.ts` 로 올렸다 — 신원과
 * 도메인을 엮는 조립은 app 계층의 몫이다.
 */

export { createOwnerKey, isOwnerKey, OWNER_COOKIE, userOwnerKey } from "./anon-cookie";

/**
 * 현재 요청의 익명 소유자 키. **읽기 전용이다.**
 *
 * 서버 컴포넌트에서는 쿠키를 구울 수 없다(Next 제약). 그래서 발급은 `proxy.ts` 가
 * 렌더보다 먼저 하고, 여기서는 그 값을 읽기만 한다. 그래도 없을 수 있는 경우
 * (proxy matcher 밖에서 호출)에는 빈 문자열을 돌려주고 호출부가 빈 목록으로
 * 처리한다 — 임의의 키를 지어내면 그 요청만 남의 것도 내 것도 아닌 목록을 만든다.
 */
export async function readAnonOwnerKey(): Promise<string> {
  const store = await cookies();
  const value = store.get(OWNER_COOKIE.name)?.value;
  return isOwnerKey(value) ? value : "";
}

