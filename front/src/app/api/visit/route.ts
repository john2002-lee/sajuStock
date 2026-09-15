import { apiPost } from "@/lib/api";
import { readOwnerKey } from "@/app/_data/owner";
import { NextResponse } from "next/server";

/**
 * 접속 기록 BFF.
 *
 * ## 소유자 키를 본문으로 받지 않는다
 *
 * 관심종목 BFF 와 같은 규약이고(`app/api/watchlist/route.ts`), 여기서는 그것이
 * **숫자의 신뢰성**을 지킨다. 쿠키는 httpOnly 라 브라우저 JS 가 읽지 못하고, 헤더로
 * 옮기는 일은 이 서버 코드가 한다. 본문으로 받으면 아무나 남의 키나 지어낸 키를
 * 보내 접속자수를 부풀릴 수 있다.
 *
 * ## 응답에 본문이 없다
 *
 * 비콘이 부르는 자리다. 화면이 이 응답으로 아무것도 그리지 않으므로 204 로 끝낸다 —
 * 프런트가 파싱을 시도하지도 않는다.
 *
 * ## 실패를 에러로 올리지 않는다
 *
 * 소유자 쿠키가 없거나 백엔드가 죽어도 **204 를 준다.** 다른 BFF 는 401/502 를
 * 내려 화면이 상태를 말하게 하지만, 통계 기록은 사용자가 요청한 일이 아니다.
 * 여기서 4xx/5xx 를 주면 콘솔에 붉은 줄이 남고 오류 추적에 잡히는데, 정작
 * 사용자가 할 수 있는 일이 없다. 기록은 다음 방문에 다시 시도된다.
 *
 * 쿠키가 없는 경우는 실제로 드물다 — `proxy.ts` 가 첫 요청에 굽는다. 정적 자산만
 * 받아간 경로(matcher 제외)나 쿠키를 막은 브라우저 정도다.
 */

export const revalidate = 0;

export async function POST() {
  const owner = await readOwnerKey();
  if (!owner) return new NextResponse(null, { status: 204 });

  try {
    await apiPost("/visits/touch", undefined, {
      headers: { "X-Owner-Key": owner },
    });
  } catch {
    // 위 주석의 이유로 삼킨다. 백엔드 쪽 실패는 그쪽 로그에 남는다.
  }

  return new NextResponse(null, { status: 204 });
}
