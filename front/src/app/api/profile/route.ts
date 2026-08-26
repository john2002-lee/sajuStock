import { apiGet, apiSend } from "@/lib/api";
import { readOwnerKey } from "@/app/_data/owner";
import { NextResponse } from "next/server";
import { toResponse } from "../saju/_helpers";

/**
 * 투자 성향 프로파일 BFF — 조회·저장.
 *
 * **사주 온보딩이 끝나는 지점이다.** `/api/saju/chart` 가 낸 초안을 사용자가 보정한
 * 뒤, 그 결과가 여기로 와서 저장된다. 통합 기획 5.1 의 데이터 흐름
 * (`생년월일시 → 사주엔진 → 초안 → 사용자 보정 → 저장`)에서 마지막 화살표다.
 *
 * 관심종목과 같은 소유자 규약을 쓴다 — 쿠키는 httpOnly 라 브라우저 JS 가 읽지
 * 못하고, 헤더로 옮기는 일은 이 서버 코드가 한다.
 *
 * **저장되는 것은 숫자 6개와 표시용 문장 하나뿐이다.** 생년월일시는 저장하지
 * 않는다 (백엔드 `models/investor_profile.py` 의 "생년월일시를 저장하지 않는다" 절).
 */

export const revalidate = 0;

function unauthorized() {
  return NextResponse.json(
    { error: "소유자 식별자가 없습니다. 새로고침해 주세요." },
    { status: 401 },
  );
}

export async function GET() {
  const owner = await readOwnerKey();
  if (!owner) return unauthorized();

  try {
    return NextResponse.json(await apiGet("/profile", { headers: { "X-Owner-Key": owner } }));
  } catch (error) {
    return toResponse(error);
  }
}

export async function PUT(request: Request) {
  const owner = await readOwnerKey();
  if (!owner) return unauthorized();

  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await apiSend("put", "/profile", body, { headers: { "X-Owner-Key": owner } }),
    );
  } catch (error) {
    return toResponse(error);
  }
}
