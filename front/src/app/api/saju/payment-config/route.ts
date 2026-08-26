import { apiGet } from "@/lib/api";
import { NextResponse } from "next/server";
import { toResponse } from "../_helpers";

/**
 * 결제 설정(사용 가능 여부·가격·보관기간).
 *
 * 가격을 프런트 상수로 두지 않는 이유: 화면·결제 요청·승인 검증 세 곳이 반드시 같은
 * 값을 봐야 하고, 복사본이 생기면 그 셋이 어긋나는 순간이 온다.
 */

export const revalidate = 0;

export async function GET() {
  try {
    return NextResponse.json(await apiGet("/saju/payment/config"));
  } catch (error) {
    return toResponse(error);
  }
}
