import { ApiError } from "@/lib/api";
import { NextResponse } from "next/server";

/**
 * AI 판단 기록 BFF 가 함께 쓰는 응답 규약.
 *
 * **봉투는 사주 쪽(`api/saju/_helpers.ts`) 모양을 따른다** — `{ error: { code,
 * message } }`. 관심종목 쪽은 `{ error: "문장" }` 으로 납작한데, 사주 헬퍼가 그것을
 * 바꾼 이유를 이미 적어 두었다: **코드가 사라진다.** 브라우저 쪽 `toBffError` 가
 * 문자열 본문을 보면 `http_409` 를 붙이므로 화면은 409 가 무엇인지 알 수 없다.
 *
 * 여기서 그 구분이 실제로 필요하다 — 공유 켜기의 404 는 "기록이 아직 없다"(AI
 * 판단을 먼저 받아야 한다)이고, 401 은 "로그인이 필요하다" 다. 둘에 화면이
 * 다르게 반응해야 한다.
 */

/** 신원이 없으면 401. AI 판단은 계정 필수라 익명으로 얼버무릴 수 없다. */
export function unauthorized() {
  return NextResponse.json(
    {
      error: {
        code: "advice_requires_account",
        message: "AI 판단 기록은 로그인한 뒤에 쓸 수 있습니다.",
      },
    },
    { status: 401 },
  );
}

/** 본문이 JSON 이 아니거나 필수 값이 빠졌을 때. */
export function badRequest(message = "요청 형식이 올바르지 않습니다.") {
  return NextResponse.json(
    { error: { code: "invalid_request", message } },
    { status: 400 },
  );
}

/** 백엔드 실패 → 같은 상태 코드로 옮긴다. 그 밖(연결 실패 등)은 502 다. */
export function toResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: "advice_upstream_unreachable",
        message: "판단 기록 서버에 연결하지 못했습니다.",
      },
    },
    { status: 502 },
  );
}
