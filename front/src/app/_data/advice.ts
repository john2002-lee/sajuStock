import { AUTH_ENABLED } from "@/auth";
import { readAccountOwnerKey, readOwnerKey } from "./owner";

/**
 * AI 판단을 쓸 수 있는가 — **규칙의 유일한 출처다.**
 *
 * 쓸 수 있으면 백엔드에 붙일 소유자 키를 주고, 아니면 null 이다. BFF 라우트와
 * 화면이 같은 함수를 본다 — 갈라지면 버튼은 열려 있는데 라우트가 거절하는(또는
 * 그 반대) 상태가 생기고, 그건 사용자가 원인을 알 수 없는 실패다.
 *
 * ## 왜 로그인을 요구하는가
 *
 * 종목 하나를 분석하면 LLM 이 4회 나간다. 이 프로젝트에서 **돈이 나가는 유일한
 * 경로**이고(`back/app/services/advice_cache.stats` 주석), 익명 신원은 httpOnly
 * 쿠키 한 줄이다. 라우트에 소유자 단위 상한이 걸려 있지만(`ADVICE_RATE_LIMIT_MAX`)
 * 쿠키를 버리고 다시 오면 새 소유자이므로 그 상한은 우회된다. 계정을 요구하면
 * 우회 비용이 '쿠키 삭제' 에서 '가입' 으로 올라간다 — 그게 이 게이트가 사는 값이다.
 *
 * ## 로그인이 꺼져 있으면 요구하지 않는다
 *
 * `AUTH_ENABLED` 가 false 인 배치는 **로그인 수단이 아예 없다.** 그때도 요구하면 AI
 * 판단은 영구히 닿을 수 없는 기능이 되고, "로그인을 비워 두면 그때도 서비스는 다 쓸
 * 수 있다" 는 약속(`.env.local.example`)이 조용히 깨진다. 잠글 열쇠가 없을 때
 * 잠그는 것은 보안이 아니라 고장이다.
 *
 * 백엔드의 `advice_auth_enabled` 와 같은 판단이고 근거도 같다 — 미설정이면 통과시키고,
 * 잃는 것이 토큰이기 때문이다. **관리자 자물쇠와는 반대**인데 그 차이도 같은 곳에서
 * 나온다: 잃는 것이 권한이면 닫는다 (`back/app/api/auth.require_admin_key` 주석).
 */
export async function adviceOwnerKey(): Promise<string | null> {
  // 로그인이 없는 배치에서는 예전 규칙(로그인이면 계정, 아니면 브라우저)이 그대로다.
  if (!AUTH_ENABLED) return readOwnerKey();
  return readAccountOwnerKey();
}

/**
 * 화면이 AI 진입점을 **버튼으로 그릴지 로그인 링크로 그릴지.**
 *
 * `adviceOwnerKey()` 를 그대로 부른다 — 조건을 여기서 다시 적으면 두 규칙이 되고,
 * 둘이 어긋나는 순간을 아무도 눈치채지 못한다. 세션 해독은 요청 단위로 캐시되므로
 * (`currentUser`) 라우트와 화면이 같은 요청에서 각자 불러도 비용은 한 번이다.
 */
export async function canUseAdvice(): Promise<boolean> {
  return (await adviceOwnerKey()) !== null;
}
