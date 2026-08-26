import { apiPost } from "@/lib/api";
import { NextResponse } from "next/server";
import { badRequest, toResponse } from "../../_helpers";

/**
 * 추가 질문 **접수** BFF.
 *
 * 리포트 쪽과 같은 이유다 — 답 하나에 LLM 한 번이라 브라우저 쪽 타임아웃(20초)을
 * 넘긴다. 접수만 하고 즉시 돌아오고, 기다림은 `[jobId]/route.ts` 폴링이 맡는다.
 *
 * 입력 검증(프리셋 위조·개행 주입·길이)은 여기가 아니라 백엔드가 **접수 시점에**
 * 한다. 그래서 잘못된 질문은 작업 번호를 받기 전에 422 로 돌아온다 — 화면이 한 번
 * 폴링한 뒤에야 거절을 알게 되는 일이 없다.
 */

export const revalidate = 0;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body === null) return badRequest();

  try {
    return NextResponse.json(await apiPost("/saju/followup/jobs", body));
  } catch (error) {
    return toResponse(error);
  }
}
