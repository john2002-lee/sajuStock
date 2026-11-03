import { apiSend } from "@/lib/api";
import { readOwnerKey } from "@/app/_data/owner";
import { NextResponse } from "next/server";
import { toResponse, unauthorized } from "../_helpers";

/**
 * 관심종목 BFF — 순서 변경.
 *
 * `/watchlist/[code]` 가 아니라 별도 세그먼트인 이유: 순서는 종목 하나의 속성이
 * 아니라 **목록 전체의 속성**이다. 드래그 한 번이 여러 행의 상대 순서를 바꾸므로
 * 코드별 PATCH 로 표현하면 중간 상태가 생긴다.
 *
 * `order` 가 6자리 코드와 겹칠 일은 없다 — 코드는 숫자 6자리 고정이다.
 */

export const revalidate = 0;

export async function PUT(request: Request) {
  const owner = await readOwnerKey();
  if (!owner) return unauthorized();

  const { codes = [] } = (await request.json().catch(() => ({}))) as {
    codes?: string[];
  };
  if (codes.length === 0) {
    return NextResponse.json({ error: "순서가 비어 있습니다." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await apiSend(
        "put",
        "/watchlist/order",
        { codes },
        { headers: { "X-Owner-Key": owner } },
      ),
    );
  } catch (error) {
    return toResponse(error);
  }
}
