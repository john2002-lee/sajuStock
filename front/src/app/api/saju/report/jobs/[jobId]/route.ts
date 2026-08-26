import { apiGet } from "@/lib/api";
import { NextResponse } from "next/server";
import { toResponse } from "../../../_helpers";

/**
 * 리포트 생성 **진행 상황** BFF. 화면이 이 경로를 폴링한다.
 *
 * 조회 하나하나는 즉시 끝나므로 기본 타임아웃으로 충분하다 — 긴 기다림을 여러 번의
 * 짧은 요청으로 바꾼 것이 이 구조의 전부다.
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
      await apiGet(`/saju/report/jobs/${encodeURIComponent(jobId)}`),
    );
  } catch (error) {
    return toResponse(error);
  }
}
