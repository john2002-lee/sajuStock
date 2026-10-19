import { apiPost } from "@/lib/api";
import { NextResponse } from "next/server";
import { badRequest, toResponse } from "../../_helpers";

/** 부적 결제 승인 BFF. 승인만 하므로(만들 것이 없다) 기본 타임아웃으로 충분하다. */

export const revalidate = 0;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body === null) return badRequest();
  try {
    return NextResponse.json(await apiPost("/talismans/payments/confirm", body));
  } catch (error) {
    return toResponse(error);
  }
}
