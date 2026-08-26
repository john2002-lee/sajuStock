import { apiPost } from "@/lib/api";
import { NextResponse } from "next/server";
import { badRequest, toResponse } from "../../_helpers";

/**
 * 리포트 생성 **시작** BFF.
 *
 * ## 왜 이 경로가 생겼나
 *
 * 옆의 `../route.ts`(동기 `POST /saju/report`)는 실측 **36초**가 걸린다. 그런데
 * 브라우저 → BFF 구간의 기본 타임아웃은 20초다(`lib/http/browser.ts`). 그래서
 * 사용자는 매번 20초 뒤에 "지금은 풀이를 들려드리기 어렵네" 를 봤다 — **백엔드는
 * 성공하고 있는데 화면은 실패를 보고 있었다.** 서버 쪽 타임아웃(120초)만 올려
 * 두었던 것이 문제를 가린 원인이다.
 *
 * 이 경로는 접수만 하고 즉시 돌아온다. 기다림은 `[jobId]/route.ts` 폴링이 맡으므로
 * **긴 요청이 아예 없어진다** — 타임아웃 숫자를 올려 미루는 것과 다르다.
 */

export const revalidate = 0;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body === null) return badRequest();

  try {
    return NextResponse.json(await apiPost("/saju/report/jobs", body));
  } catch (error) {
    return toResponse(error);
  }
}
