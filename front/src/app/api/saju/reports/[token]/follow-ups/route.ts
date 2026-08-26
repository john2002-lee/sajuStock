import { apiGet } from "@/lib/api";
import { NextResponse } from "next/server";
import { toResponse } from "../../../_helpers";

/**
 * 구매한 리포트의 추가 질문 상태 BFF.
 *
 * 답 하나가 끝난 뒤 화면이 서버와 다시 맞추는 데 쓴다. 리포트 본문(수 KB)을 다시
 * 받지 않으려고 갈라 둔 경로다 — 여기서 필요한 것은 숫자 둘과 짧은 목록이다.
 *
 * **왜 다시 맞춰야 하는가:** 답이 우리 쪽 문제로 실패하면 서버가 슬롯을 돌려준다.
 * 화면이 낙관적으로 하나 올려 두었다면 그 순간 남은 개수가 서버와 어긋나고, 고객은
 * 산 질문 하나를 잃은 것으로 본다.
 *
 * Next 16 은 동적 세그먼트를 Promise 로 준다 — 라우트 핸들러도 await 한다.
 */

export const revalidate = 0;

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;

  try {
    return NextResponse.json(
      await apiGet(`/saju/reports/${encodeURIComponent(token)}/follow-ups`),
    );
  } catch (error) {
    return toResponse(error);
  }
}
