import { readOwnerKey } from "@/app/_data/owner";
import { apiPost, consumeRateLimit } from "@/lib/api";
import { NextResponse } from "next/server";
import { badRequest, toResponse } from "../../_helpers";

/**
 * 구매한 리포트의 결과 공유 링크 발급 BFF.
 *
 * 옆의 `../route.ts` 와 하는 일이 같아 보이지만 **받는 것이 다르다** — 저쪽은
 * 생년월일시, 이쪽은 결제로 받은 접근 토큰이다. 토큰이 가리키는 주문이 `paid`
 * 인지는 백엔드가 본다(`saju_order_service.share_paid_result`).
 *
 * ## 나가는 것은 리포트가 아니다
 *
 * 발급되는 주소는 무료 경로와 같은 `/saju/s/{shareId}` 이고, 담기는 것도 같다:
 * 여덟 글자와 무료 요약뿐이다. **`/saju/reports/{token}` 그 주소를 공유하지
 * 않는 이유**가 이 라우트의 존재 이유다 — 그 토큰은 로그인을 대신하는 자격
 * 증명이라, 받은 사람이 리포트 전문과 양력 생년월일을 보고 구매자의 남은 추가
 * 질문까지 쓸 수 있다.
 *
 * ## 토큰을 로그에 남기지 않는다
 *
 * 옆 라우트가 생년월일시를 남기지 않는 것과 같은 규칙이고, 여기서는 더 강하다 —
 * 이 값은 그 자체로 리포트를 여는 열쇠다. 그래서 본문을 그대로 흘려보내기만
 * 하고 아무것도 찍지 않는다.
 */

export const revalidate = 0;

/**
 * 소유자 하나가 한 시간에 발급할 수 있는 수. 옆 라우트와 **버킷을 공유한다** —
 * 상한이 둘로 나뉘면 한쪽을 다 쓴 스크립트가 다른 쪽으로 옮겨 가면 그만이다.
 *
 * 이쪽은 사실 훨씬 싸다: 서버가 발급한 id 를 주문에 기억하므로 두 번째부터는
 * 같은 값을 돌려줄 뿐 행이 생기지 않는다. 그래도 세는 이유는, 세지 않으면
 * 토큰 하나로 DB 왕복을 무한히 돌릴 수 있기 때문이다.
 */
const SHARE_RATE_LIMIT_MAX = 30;
const SHARE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== "object") return badRequest();

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
    // 실패 코드를 보존한다. 미결제(`saju_report_not_ready`)와 확인중
    // (`saju_payment_needs_attention`)이 둘 다 409 라, 코드가 없으면 화면이
    // 구분할 수 없다 (`_helpers.ts` 의 `toResponse` 주석).
    return NextResponse.json(await apiPost("/saju/shares/from-report", body), { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}
