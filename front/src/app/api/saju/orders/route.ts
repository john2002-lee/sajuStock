import { apiPost } from "@/lib/api";
import { NextResponse } from "next/server";
import { toResponse } from "../_helpers";

/**
 * 유료 리포트 주문 생성 BFF.
 *
 * **금액을 여기서 만들지 않는다.** 서버가 정한 값을 그대로 돌려받아 화면에 넘기고,
 * 승인 때 서버가 다시 대조한다 — 이 라우트가 금액을 손대면 그 대조가 의미를 잃는다.
 */

export const revalidate = 0;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  try {
    return NextResponse.json(await apiPost("/saju/orders", body));
  } catch (error) {
    return toResponse(error);
  }
}
