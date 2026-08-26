import { apiGet } from "@/lib/api";
import { NextResponse } from "next/server";
import { toResponse } from "../../_helpers";

/**
 * 추가 질문 프리셋과 상한.
 *
 * 화면이 이 목록을 상수로 복사해 두지 않게 하려고 서버에서 받아 온다. 복사본이
 * 생기면 갈라지고, 그러면 **버튼이 서버가 거절할 요청을 활성화한다**.
 */

export const revalidate = 0;

export async function GET() {
  try {
    return NextResponse.json(await apiGet("/saju/followup/presets"));
  } catch (error) {
    return toResponse(error);
  }
}
