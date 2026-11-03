import { apiPost, ApiError } from "@/lib/api";
import { readAnonOwnerKey, userOwnerKey } from "@/lib/watchlist/owner";

/**
 * 익명으로 모아 둔 관심종목을 로그인 계정으로 승계한다.
 *
 * ## 왜 서버에서만 도는가
 *
 * 익명 키는 httpOnly 쿠키라 브라우저 JS 가 읽지 못한다. 그게 이 승계를 **서버에서만**
 * 할 수 있는 이유이자, 안전한 이유다 — 클라이언트가 "이 키를 내 계정으로 옮겨 줘" 라고
 * 말할 수 있으면 아무 키나 넣어 남의 목록을 가져갈 수 있다.
 *
 * ## 왜 매 요청 부르지 않는가
 *
 * 승계는 **이동**이라 한 번 끝나면 익명 쪽이 비어 있고, 그다음부터는 옮길 것이 없다.
 * 그래도 매 요청 호출하면 관심종목 화면을 열 때마다 쓸모없는 왕복이 하나 붙는다.
 * 그래서 호출부(관심종목 화면)가 **익명 쿠키가 있고 로그인 상태일 때만** 부른다.
 *
 * 실패를 삼키는 것도 의도다. 승계가 안 됐다고 화면이 죽으면, 사용자는 로그인했다는
 * 이유로 관심종목을 아예 못 보게 된다 — 목록이 비어 보이는 편이 낫고, 다음 방문에
 * 다시 시도된다.
 */
export async function claimAnonymousWatchlist(userId: string): Promise<boolean> {
  const anonKey = await readAnonOwnerKey();
  if (!anonKey) return false;

  try {
    await apiPost(
      "/watchlist/claim",
      { from_key: anonKey },
      { headers: { "X-Owner-Key": userOwnerKey(userId) } },
    );
    return true;
  } catch (error) {
    // 400 은 "같은 소유자" — 배선이 틀린 경우라 조용히 넘기면 안 되지만, 그렇다고
    // 화면을 죽일 일도 아니다. 나머지(연결 실패 등)도 다음 방문에 다시 시도된다.
    if (error instanceof ApiError && error.status === 400) {
      console.warn("[watchlist] 같은 소유자로 승계를 시도했습니다 — 호출부 배선을 확인하세요.");
    }
    return false;
  }
}
