import { cache } from "react";
import { currentUser } from "@/auth";
import type { Watchlist } from "@/features/stock/watchlist";
import { getWatchlist } from "@/features/stock/watchlist/server";
import { claimAnonymousWatchlist } from "@/lib/watchlist/claim";
import { readOwnerKey } from "@/app/_data/owner";

/**
 * 지금 사용자의 관심종목 한 벌. **한 요청 안에서 한 번만 조회된다.**
 *
 * `app/_data/` 에 있는 이유: 신원(세션·쿠키)을 도메인과 엮는 **조립**이라
 * app 계층의 일인데, 관심종목 화면과 대시보드 **두 라우트**가 쓴다. 한쪽의
 * `_components/` 에 두면 다른 쪽이 남의 라우트 내부를 깊게 참조하게 된다
 * (CONVENTIONS: 두 번째 사용처가 생기면 옮긴다). `_` 접두사라 라우팅에서 빠진다.
 *
 * 레이아웃(목록)과 페이지(기본 선택·담김 여부)가 같은 목록을 봐야 하는데, 레이아웃은
 * 자식에게 값을 내려줄 수단이 없다(Next 는 layout → page 로 props 를 넘기지 않는다).
 * 그래서 둘 다 이 함수를 부르고, React 의 `cache` 가 같은 렌더 패스 안의 두 번째
 * 호출을 첫 번째 결과로 돌려준다 — 백엔드 조회는 하나다.
 *
 * 익명 목록 승계(`claimAnonymousWatchlist`)도 여기 있다. **부수효과가 있는 일이라
 * 두 번 돌면 안 되고**, 그 보장을 같은 `cache` 가 준다.
 */
export const loadWatchlist = cache(async (): Promise<Watchlist> => {
  // 맨 `auth()` 가 아니라 `currentUser()` 다 — 아래 `readOwnerKey()` 도 같은 것을
  // 보므로, 둘이 각자 `auth()` 를 부르면 한 렌더에 세션 해독이 두 번 일어난다.
  const user = await currentUser();
  const userId = user?.id;

  // 로그인 상태에서 익명 쿠키가 아직 남아 있으면 그쪽 목록을 한 번 가져온다.
  // 승계는 **이동**이라 한 번 끝나면 옮길 것이 없고, 그다음부터는 익명 쿠키가
  // 있어도 0건이라 비용이 거의 없다 (lib/watchlist/claim.ts).
  if (userId) await claimAnonymousWatchlist(userId);

  // 소유자 = 로그인했으면 계정, 아니면 브라우저. 그 규칙의 출처는 readOwnerKey 하나다.
  // 익명 쿠키는 렌더보다 먼저 도는 proxy.ts 가 굽는다 — 서버 컴포넌트는 쿠키를
  // 읽을 수만 있다(Next 제약).
  const ownerKey = await readOwnerKey();
  return getWatchlist(ownerKey);
});
