import { apiPost } from "@/lib/api";
import { NextResponse } from "next/server";
import { toResponse } from "../../_helpers";

/**
 * 결제 승인 BFF.
 *
 * 승인 뒤에 리포트 생성(LLM 1~2회)이 이어지므로 타임아웃이 길다. 여기서 끊기면
 * **결제는 됐는데 화면은 실패로 보이는** 최악의 조합이 된다 — 서버는 그 경우에도
 * 리포트를 저장해 두므로 다시 승인 요청을 보내면 저장된 것을 돌려준다.
 */

export const revalidate = 0;

const CONFIRM_TIMEOUT_MS = 180_000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await apiPost("/saju/payments/confirm", body, { timeoutMs: CONFIRM_TIMEOUT_MS }),
    );
  } catch (error) {
    return toResponse(error);
  }
}
