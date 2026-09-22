import { readOwnerKey } from "@/app/_data/owner";
import { apiPost, consumeRateLimit } from "@/lib/api";
import { NextResponse } from "next/server";
import { badRequest, toResponse } from "../_helpers";

/**
 * 결과 공유 링크 발급 BFF.
 *
 * 브라우저는 FastAPI 를 직접 부르지 않는다(CONVENTIONS) — 백엔드 주소가 노출되지
 * 않고, 실패 계약이 한 곳에 모인다.
 *
 * **생년월일시를 로그에 남기지 않는다.** `api/saju/chart` 와 같은 규칙이고, 그
 * 값이 지나가는 프런트 지점이 이제 둘이다. 백엔드도 저장하지 않는다 — 계산해서
 * 여덟 글자를 만들고 버린다(`endpoints/saju_shares.py`).
 *
 * **소유자 키를 인증으로 쓰지 않는다.** 이 제품의 무료 경로에는 계정이 없다. 아래
 * 레이트리밋의 버킷 이름으로만 쓴다.
 *
 * ## 레이트리밋은 소프트하다
 *
 * 백엔드의 `POST /saju/shares` 는 인증 없는 쓰기 문이라 남용의 상한이 필요하다.
 * 그런데 `consumeRateLimit` 은 **프로세스 메모리**이므로 인스턴스가 늘면 상한도
 * 비례해서 늘어난다(그 모듈 주석이 같은 말을 한다). 진짜 상한은 백엔드에 있어야
 * 한다 — 여기 있는 것은 실수로 연타한 사람과 단순한 스크립트를 막는 정도다.
 * 최악의 경우에도 표가 커지는 것이 전부이고, 그건 7일 TTL 이 되돌린다.
 */

export const revalidate = 0;

/** 소유자 하나가 한 시간에 발급할 수 있는 링크 수. */
const SHARE_RATE_LIMIT_MAX = 30;
const SHARE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== "object") return badRequest();

  // `proxy.ts` 가 모든 요청에 익명 소유자 쿠키를 심으므로 값은 항상 있다.
  // 계정을 보는 `readAccountOwnerKey` 가 아닌 이유는 위 주석에 있다.
  const owner = (await readOwnerKey()) ?? "anon:unknown";
  if (!consumeRateLimit(`saju-share:${owner}`, SHARE_RATE_LIMIT_MAX, SHARE_RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json(
      {
        error: {
          code: "saju_share_rate_limited",
          message: "공유 링크를 너무 많이 만들었습니다. 잠시 후 다시 시도해 주세요.",
        },
      },
      { status: 429 },
    );
  }

  try {
    // 본문을 그대로 흘려보낸다 — 와이어 변환은 클라이언트가 이미 했다
    // (`fromBirthInput`). `api/saju/chart` 와 같은 모양이다.
    //
    // 실패는 백엔드가 준 코드와 상태로 옮긴다 — 생년월일시 검증(422)의 문장이
    // 폼 아래에 떠야 한다 (`_helpers.ts` 의 `toResponse` 주석).
    return NextResponse.json(await apiPost("/saju/shares", body), { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}
