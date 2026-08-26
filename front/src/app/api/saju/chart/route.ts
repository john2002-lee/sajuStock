import { apiPost } from "@/lib/api";
import { NextResponse } from "next/server";
import { toResponse } from "../_helpers";

/**
 * 사주 계산 BFF.
 *
 * 브라우저는 FastAPI 를 직접 부르지 않는다(CONVENTIONS) — 백엔드 주소가 노출되지
 * 않고, 실패 계약이 한 곳에 모인다.
 *
 * **소유자 키를 붙이지 않는다.** 이 경로는 아무것도 저장하지 않으므로 소유자가
 * 필요 없고(백엔드 `endpoints/saju.py` 모듈 주석), 온보딩은 로그인보다 앞설 수
 * 있어야 한다. 저장은 사용자가 슬라이더를 만진 뒤 `/api/profile` 이 받는다.
 *
 * **생년월일시를 로그에 남기지 않는다.** 민감정보이고, 이 라우트는 그것이 지나가는
 * 유일한 프런트 지점이다. 실패해도 백엔드가 준 문장만 옮긴다.
 */

export const revalidate = 0;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    return NextResponse.json(await apiPost("/saju/chart", body));
  } catch (error) {
    return toResponse(error);
  }
}
