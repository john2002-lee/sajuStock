import { apiGet, apiPost } from "@/lib/api";
import { readOwnerKey } from "@/app/_data/owner";
import { NextResponse } from "next/server";
import { toResponse, unauthorized } from "./_helpers";

/**
 * 관심종목 BFF — 조회·추가.
 *
 * 브라우저는 FastAPI 를 직접 부르지 않는다(CONVENTIONS). 그 규칙이 여기서 값을
 * 하는 지점이 하나 더 있다: **소유자 키가 브라우저를 거치지 않는다.** 쿠키는
 * httpOnly 라 JS 가 읽지 못하고, 헤더로 옮기는 일은 이 서버 코드가 한다.
 */

export const revalidate = 0;

export async function GET() {
  const owner = await readOwnerKey();
  if (!owner) return unauthorized();

  try {
    return NextResponse.json(
      await apiGet("/watchlist", { headers: { "X-Owner-Key": owner } }),
    );
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(request: Request) {
  const owner = await readOwnerKey();
  if (!owner) return unauthorized();

  const { symbol = "", group } = (await request.json().catch(() => ({}))) as {
    symbol?: string;
    group?: string;
  };

  try {
    return NextResponse.json(
      await apiPost(
        "/watchlist",
        { symbol, group },
        { headers: { "X-Owner-Key": owner } },
      ),
    );
  } catch (error) {
    return toResponse(error);
  }
}
