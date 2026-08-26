import { apiPost } from "@/lib/api";
import { NextResponse } from "next/server";
import { toResponse } from "../_helpers";

/**
 * 사주 추가 질문 BFF.
 *
 * 리포트와 같은 이유로 타임아웃이 길다 — LLM 을 태우고, 정책 위반이면 한 번 더
 * 태운다.
 *
 * **생년월일시가 이 라우트를 지나간다.** 저장하지도, 로그에 남기지도 않는다.
 * 서버가 사주를 갖고 있지 않으므로 질문마다 다시 계산해야 하기 때문이고
 * (백엔드 `schemas/saju.FollowUpRequest` 주석), 순수 계산이라 비용은 없다.
 */

export const revalidate = 0;

const FOLLOWUP_TIMEOUT_MS = 120_000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await apiPost("/saju/followup", body, { timeoutMs: FOLLOWUP_TIMEOUT_MS }),
    );
  } catch (error) {
    return toResponse(error);
  }
}
