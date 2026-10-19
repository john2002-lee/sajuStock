import { apiPost } from "@/lib/api";
import { NextResponse } from "next/server";
import { badRequest, toResponse } from "../_helpers";

/** 부적 주문 생성 BFF. 금액·주문명은 백엔드가 정해 돌려준다. */

export const revalidate = 0;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body === null) return badRequest();
  try {
    return NextResponse.json(await apiPost("/talismans/orders", body));
  } catch (error) {
    return toResponse(error);
  }
}
