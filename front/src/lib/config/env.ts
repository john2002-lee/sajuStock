/**
 * 서버 전용 환경 설정. 브라우저 번들에 들어가면 안 되므로 NEXT_PUBLIC_ 접두사를
 * 쓰지 않는다 — 백엔드 주소는 BFF 라우트와 서버 컴포넌트만 알면 된다.
 */

function required(name: string, fallback: string): string {
  const value = process.env[name];
  if (!value) {
    // 프로덕션에서 이 값이 비어 있으면 모든 SSR 호출이 조용히 localhost 를
    // 찾다가 실패한다 — "배포했는데 전부 network_error" 로만 보이고 원인은
    // 로그를 뒤져야 나온다. 기동 시점에 크게 알려서 그 탐색을 없앤다.
    if (process.env.NODE_ENV === "production") {
      console.error(
        `[config] ${name} 이 설정되지 않았습니다 — 프로덕션에서는 localhost 로 폴백하지 않아야 합니다.`,
      );
    }
    return fallback;
  }
  return value.replace(/\/+$/, "");
}

/** FastAPI 베이스 URL. `/api/v1` 까지 포함한다. */
export const API_BASE_URL = required(
  "STOCK_API_BASE_URL",
  "http://localhost:8000/api/v1",
);

/**
 * mock ↔ real 전환 플래그.
 *
 * 목 데이터는 지우지 않는다 — 백엔드 없이 화면을 띄우는 데모·스크린샷·회귀 확인에
 * 계속 쓴다. `USE_MOCK=1` 이면 services 가 features/*\/model/mock.ts 를 돌려준다.
 */
export const USE_MOCK = process.env.USE_MOCK === "1";

/** 일반 조회 타임아웃. yfinance 가 느릴 때 무한정 매달리지 않게 한다. */
export const API_TIMEOUT_MS = Number(process.env.STOCK_API_TIMEOUT_MS ?? 20_000);

/**
 * AI 판단 스트림의 **최후 안전판**. 백엔드 실행 예산의 복제본이 아니다 —
 * 예산이 안 먹혔을 때만 걸려야 한다.
 *
 * 이 값이 예산보다 짧으면 백엔드가 만든 '규칙 기반 착지'(stage 4)가 도착하기
 * **직전에** 스트림이 잘리고, 사용자는 그 자리에서 원인 불명 에러를 본다 —
 * 이번 변경이 없애려던 바로 그 화면이다. 지켜야 할 부등식:
 *
 *     AI_TIMEOUT_MS/1000  ≥  advice_budget_seconds(90)
 *                            + 스트림 개시 전 조회(resolve_listing ≤ 20)
 *                            + 여유(10)
 *
 * `AbortSignal.timeout` 은 헤더가 아니라 **본문 스트림까지** 자르고, 하트비트가
 * 도착해도 연장되지 않는 벽시계 마감이다. 그래서 "조용하지만 살아 있는" 구간을
 * 이 값으로 구분할 수 없다 — 그 일은 하트비트와 백엔드 예산이 한다.
 */
export const AI_TIMEOUT_MS = Number(process.env.STOCK_AI_TIMEOUT_MS ?? 120_000);

/**
 * AI 판단 엔드포인트를 여는 공유 비밀키 (백엔드 `ADVICE_API_KEY` 와 같은 값).
 *
 * **`NEXT_PUBLIC_` 을 절대 붙이지 않는다.** 붙이는 순간 이 키가 클라이언트 번들에
 * 인라인되어 자물쇠가 무의미해진다 — 브라우저에 있는 키는 키가 아니다. 이 값을
 * 읽는 곳은 `app/api/stocks/advice/route.ts`(BFF) 하나뿐이고, 그 파일은 서버에서만
 * 돈다. 비어 있으면 헤더를 아예 붙이지 않는다(백엔드도 미설정이면 통과시킨다).
 */
export const ADVICE_API_KEY = process.env.ADVICE_API_KEY ?? "";

