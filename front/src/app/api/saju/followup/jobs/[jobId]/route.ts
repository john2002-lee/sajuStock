import { apiGet } from "@/lib/api";
import { NextResponse } from "next/server";
import { toResponse } from "../../../_helpers";

/**
 * 추가 질문 **진행 상황** BFF. 리포트 작업 조회와 같은 규약이다.
 *
 * Next 16 은 동적 세그먼트를 Promise 로 준다 — 라우트 핸들러도 await 한다.
 */

export const revalidate = 0;

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { jobId } = await context.params;

  try {
    return NextResponse.json(
      await apiGet(`/saju/followup/jobs/${encodeURIComponent(jobId)}`),
    );
  } catch (error) {
    return toResponse(error);
  }
}
