import { apiPost } from "@/lib/api";
import { NextResponse } from "next/server";
import { toResponse } from "../_helpers";

/**
 * 사주 리포트 BFF.
 *
 * `/chart` 와 갈라 둔 이유는 **비용과 지연**이다. 차트는 순수 계산이라 즉시 끝나고
 * LLM 을 부르지 않는다. 리포트는 LLM 1~2회를 태우므로 수 초가 걸린다 — 온보딩이
 * 그것을 기다리게 하면, 성향 카드 한 장을 보려던 사용자가 리포트 생성을 대신
 * 기다린다.
 */

export const revalidate = 0;

/**
 * 리포트는 LLM 을 태우므로 기본 타임아웃(20초)으로는 짧다. 정책 위반 시 재생성이
 * 한 번 더 붙는 최악의 경우까지 감안한 값이다.
 */
const REPORT_TIMEOUT_MS = 120_000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await apiPost("/saju/report", body, { timeoutMs: REPORT_TIMEOUT_MS }),
    );
  } catch (error) {
    return toResponse(error);
  }
}
