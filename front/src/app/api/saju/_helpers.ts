import { ApiError } from "@/lib/api";
import { NextResponse } from "next/server";

/**
 * 사주 BFF 라우트가 함께 쓰는 응답 규약.
 *
 * `app/api/watchlist/_helpers.ts` 와 같은 이유로 한곳에 모은다 — 문구가 갈라지면
 * 같은 실패에 화면이 다른 말을 한다.
 */

/**
 * 백엔드 실패 → 같은 상태 코드로 옮긴다. 그 밖(연결 실패 등)은 502 다.
 *
 * ## 왜 봉투 모양을 그대로 유지하나
 *
 * 예전에는 `{ error: "문장" }` 으로 납작하게 눌러 내보냈다. 그러면 **코드가
 * 사라진다** — 브라우저 쪽 `toBffError` 가 문자열 본문을 보고 `http_409` 를 붙이므로
 * 화면은 409 가 무엇인지 알 수 없다.
 *
 * 그것이 실제로 문제가 되는 자리가 생겼다. 유료 리포트 조회는 409 를 두 가지로
 * 쓴다: `saju_report_generating`(만들고 있다 — 기다리면 나온다)과
 * `saju_report_not_ready`(결제가 확인되지 않았다 — 기다려도 안 나온다). 코드가 없으면
 * 화면은 둘을 구분할 수 없어 **둘 중 하나에서 반드시 틀린 행동**을 한다: 영원히
 * 폴링하거나, 다 된 리포트를 포기하거나.
 *
 * 문장은 그대로 보존된다. `toApiError` 는 코드가 있는 봉투에서도 `error.message` 를
 * 읽으며, 검증 실패의 상세 사유는 이미 `ApiError.message` 안에 녹아 있다(서버 쪽
 * `validationDetail` 이 먼저 합쳐 놓는다).
 *
 * **422 를 보존하는 것이 특히 중요하다.** 생년월일시 검증은 전부 백엔드에 있고
 * (`schemas/saju.BirthInput`), 그 메시지가 폼 아래에 그대로 뜬다 — "1920년 이전
 * 출생은 지원하지 않습니다" 같은 문장이 여기서 뭉개지면 사용자는 무엇이 잘못됐는지
 * 알 수 없다.
 */
export function toResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: { code: "saju_upstream_unreachable", message: "사주 서버에 연결하지 못했습니다." } },
    { status: 502 },
  );
}

/** 본문이 JSON 이 아닐 때. 라우트마다 같은 문장을 적지 않도록 여기 둔다. */
export function badRequest() {
  return NextResponse.json(
    { error: { code: "invalid_request", message: "요청 형식이 올바르지 않습니다." } },
    { status: 400 },
  );
}
