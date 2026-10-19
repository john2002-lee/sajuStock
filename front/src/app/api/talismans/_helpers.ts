import { ApiError } from "@/lib/api";
import { NextResponse } from "next/server";

/**
 * 부적 BFF 라우트의 응답 규약. 사주 쪽(`app/api/saju/_helpers.ts`)과 같은 봉투를
 * 쓴다 — 백엔드의 **코드**를 보존해야 화면이 409 의 두 뜻(미결제 · 사람이 확인 중)을
 * 가를 수 있다. 사주 헬퍼를 가져다 쓰지 않는 것은 연결이 끊겼을 때의 문장이
 * "사주 서버" 라서다.
 */
export function toResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: { code: "talisman_upstream_unreachable", message: "서버에 연결하지 못했습니다." } },
    { status: 502 },
  );
}

export function badRequest() {
  return NextResponse.json(
    { error: { code: "invalid_request", message: "요청 형식이 올바르지 않습니다." } },
    { status: 400 },
  );
}
