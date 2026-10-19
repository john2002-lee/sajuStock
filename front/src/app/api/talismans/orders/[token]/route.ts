import { apiGet } from "@/lib/api";
import { NextResponse } from "next/server";
import { toResponse } from "../../_helpers";

/** 구매한 부적 정보(이름·다운로드 기한). 원본 바이트는 `/download` 만 싣는다. */

export const revalidate = 0;

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  try {
    return NextResponse.json(await apiGet(`/talismans/orders/${encodeURIComponent(token)}`));
  } catch (error) {
    return toResponse(error);
  }
}
