import { apiGet } from "@/lib/api";
import { NextResponse } from "next/server";
import { toResponse } from "../../_helpers";

/**
 * 구매한 리포트 조회 BFF.
 *
 * ## 이 파일이 없었다
 *
 * `PaidReportScreen` 은 처음부터 `/api/saju/reports/{token}` 을 부르고 있었는데
 * 이 라우트가 존재하지 않았다 — Next 가 404 를 돌려주므로 **유료 리포트 화면이 늘
 * "리포트를 열지 못했네" 였다.** 결제 경로를 붙일 때 빠뜨린 자리고, 폴링을 넣으면서
 * 드러났다.
 *
 * ## 토큰을 로그에 남기지 않는다
 *
 * 토큰이 곧 자격 증명이다(`/saju/reports/[token]` 페이지 주석). 여기서 토큰을 별도로
 * 기록하지 않고 그대로 백엔드에 넘긴다.
 *
 * ## 409 를 그대로 흘려보낸다
 *
 * 백엔드는 409 를 두 가지로 쓴다: `saju_report_generating`(만들고 있다)과
 * `saju_report_not_ready`(결제가 확인되지 않았다). `toResponse` 가 코드를 보존하므로
 * 화면이 앞의 것만 계속 기다릴 수 있다.
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
      await apiGet(`/saju/reports/${encodeURIComponent(token)}`),
    );
  } catch (error) {
    return toResponse(error);
  }
}
