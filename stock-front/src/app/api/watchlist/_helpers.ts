import { ApiError } from "@/lib/api";
import { NextResponse } from "next/server";

/**
 * 관심종목 BFF 세 라우트(`/`·`/[code]`·`/order`)가 함께 쓰는 응답 규약.
 *
 * 세 파일이 같은 두 함수를 글자 그대로 복사해 갖고 있었고, `/order` 는 그마저도
 * 핸들러 안에 인라인한 세 번째 변형이었다. 문구가 갈라지면 같은 실패에 화면이
 * 다른 말을 한다 — 실제로 갈라지기 전에 한 곳으로 모은다.
 */

/** 신원이 없으면 401. 빈 목록으로 얼버무리면 화면이 "비었다"와 구분하지 못한다. */
export function unauthorized() {
  return NextResponse.json(
    { error: "소유자 식별자가 없습니다. 새로고침해 주세요." },
    { status: 401 },
  );
}

/**
 * 백엔드 실패 → 같은 상태 코드로 옮긴다. 그 밖(연결 실패 등)은 502 다.
 *
 * 상태 코드를 보존하는 이유: 404(없는 종목)와 502(백엔드 다운)에 화면이 다르게
 * 반응해야 하는데, 여기서 뭉개면 브라우저는 둘을 구분할 방법이 없다.
 */
export function toResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { error: "관심종목 서버에 연결하지 못했습니다." },
    { status: 502 },
  );
}
