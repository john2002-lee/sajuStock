/**
 * 분석 이벤트에서 **자격 증명을 지운다.**
 *
 * ## 왜 필요한가
 *
 * 이 앱에는 주소 자체가 열쇠인 화면이 있다.
 *
 *   - `/saju/reports/<token>` — 백엔드가 명시한다: "**토큰이 곧 자격 증명이다.**
 *     주소를 아는 사람이 산 사람이므로 로그인이 없다"
 *     (`back/app/api/v1/endpoints/saju.py` 의 `read_saju_report`).
 *   - `/saju/pay/success?paymentKey=…&orderId=…` — 토스가 결제 자격 증명을 질의로
 *     돌려보낸다.
 *
 * 오토캡처의 페이지뷰는 **전체 URL** 을 이벤트 속성에 싣는다. 그대로 두면 구매한
 * 리포트의 토큰과 결제 키가 분석 도구에 저장되고, 그 순간 Amplitude 계정 접근
 * 권한이 남의 리포트를 열 권한이 된다.
 *
 * 백엔드는 같은 이유로 사주 LLM 호출을 `metadata_only` 로 보낸다
 * (`back/app/integrations/amplitude.py`). 프런트가 그 결정을 우회하면 안 된다.
 *
 * ## 무엇을 남기는가
 *
 * 경로 **모양**은 남긴다 — `/saju/reports/[token]` 은 여전히 "리포트를 열었다" 를
 * 말해 주므로 페이지뷰 분석이 죽지 않는다. 사라지는 것은 열쇠뿐이다.
 */

/** 지워진 자리에 남기는 표식. 값이 없었던 것과 구분되어야 한다. */
const TOKEN_PLACEHOLDER = "[token]";
const VALUE_PLACEHOLDER = "[redacted]";

/**
 * 하드 블록에 걸린 자리에 남기는 표식.
 *
 * 값을 지우지 않고 **키를 남기는** 이유: 이것이 걸렸다는 것은 계측 코드가 보내면
 * 안 되는 것을 보냈다는 뜻이고, 그건 고쳐야 할 버그다. 조용히 떨어뜨리면 아무도
 * 모른 채로 남는다. Amplitude 에 `[blocked]` 이 보이면 그 자리가 잘못됐다는
 * 신호다 — 값은 그래도 브라우저 밖으로 나가지 않는다.
 */
const BLOCKED_PLACEHOLDER = "[blocked]";

/**
 * 질의 문자열에서 지울 이름들.
 *
 * `amount` 까지 넣는 이유는 금액이 비밀이라서가 아니라, 토스 리다이렉트의 세 값이
 * **함께 있어야** 승인 요청을 만들 수 있기 때문이다. 하나를 지우면 조합이 깨진다.
 */
const SECRET_PARAMS = [
  "paymentKey",
  "orderId",
  "amount",
  "token",
  "access_token",
] as const;

const REPORT_TOKEN = /(\/saju\/reports\/)[^/?#\s]+/g;
const SECRET_QUERY = new RegExp(
  `([?&])(${SECRET_PARAMS.join("|")})=[^&#\s]*`,
  "gi",
);

/**
 * URL 하나에서 자격 증명을 지운다. 전체 URL 과 경로 조각 둘 다 받는다 —
 * SDK 가 `[Amplitude] Page URL`(전체)과 `[Amplitude] Page Path`(경로)를 따로
 * 싣기 때문이다.
 */
export function redactUrl(value: string): string {
  return value
    .replace(REPORT_TOKEN, `$1${TOKEN_PLACEHOLDER}`)
    .replace(SECRET_QUERY, `$1$2=${VALUE_PLACEHOLDER}`);
}

/**
 * URL 을 싣는 속성 이름들. SDK 에서 실제로 확인한 목록이고, 추측이 아니다.
 *
 * 새 이름이 생기면 여기 빠진 채로 조용히 새어 나간다 — 그래서 아래
 * `redactProperties` 는 이 목록에 없어도 `http` 로 시작하거나 `/saju/reports/` 를
 * 담은 문자열이면 함께 지운다. **목록은 최적화이고, 안전망은 값 검사다.**
 */
const URL_PROPERTIES = new Set([
  "[Amplitude] Page URL",
  "[Amplitude] Page Location",
  "[Amplitude] Page Path",
  "[Amplitude] Previous Page Location",
  "[Amplitude] URL",
  "[Amplitude] URL Query",
  "[Amplitude] URL Fragment",
  "referrer",
  "referring_domain",
]);

/**
 * **절대 나가면 안 되는 속성 이름들.**
 *
 * 위의 URL 리댁션은 값이 URL 처럼 보일 때만 동작한다. `birth_year: 1990` 은
 * URL 이 아니므로 그 그물을 그냥 통과한다 — 계측 코드가 한 번만 실수하면
 * 생년월일시가 그대로 나간다. 택소노미 문서는 그 실수를 막지 못하고, 이 목록만
 * 막는다 (`docs/analytics/saju-amplitude-taxonomy.md` 6절).
 *
 * 왜 이 값들인가: 백엔드가 사주 LLM 호출을 `metadata_only` 로 보내는 것과 같은
 * 이유다 — **네 기둥과 대운의 조합은 생년월일시로 역산된다**
 * (`back/app/integrations/amplitude.py`). 일간 하나(`day_master`)는 10분의 1로만
 * 좁히므로 역산이 불가능해 통과시킨다.
 *
 * 이름은 **평탄화해서** 본다(소문자 + 영숫자만). `paymentKey` 와 `payment_key`,
 * `PaymentKey` 가 한 규칙에 걸리게 하려는 것이고, 표기법이 바뀌어도 구멍이
 * 생기지 않는다.
 */
const BLOCKED_KEYS = new Set([
  "paymentkey",
  "orderid",
  "luckcycle",
  "luckcycles",
  "daeun",
  "reportmarkdown",
  "reportbody",
  "questiontext",
  "answertext",
  "freetext",
  "sajusummary",
]);

/**
 * 목록에 없는 이름까지 막는 규칙.
 *
 *   - `birth…` — 생년월일시와 출생지 전부. `has_birth_place` 는 `has` 로 시작하므로
 *     통과한다. 그것이 의도다: 골랐는지 여부는 분석에 쓰고 값은 안 쓴다.
 *   - `…pillar(s)` — 기둥은 어떤 이름으로 와도 막는다.
 *   - `…token` — 이 앱에는 주소가 곧 자격 증명인 화면이 있다.
 */
function isBlockedKey(key: string): boolean {
  const flat = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    flat.startsWith("birth") ||
    flat.endsWith("pillar") ||
    flat.endsWith("pillars") ||
    flat.endsWith("token") ||
    BLOCKED_KEYS.has(flat)
  );
}

/** 값이 URL 처럼 보이는가. 이름을 몰라도 지우기 위한 안전망이다. */
function looksLikeUrl(value: string): boolean {
  return (
    value.startsWith("http") ||
    value.startsWith("/") ||
    value.includes("/saju/reports/")
  );
}

/**
 * 속성 묶음 하나를 정리해 **새 객체로** 돌려준다.
 *
 * 원본을 고치지 않는다 — SDK 가 같은 객체를 다른 곳에서도 참조할 수 있고,
 * 이 저장소의 규약이기도 하다.
 */
export function redactProperties<T extends object>(
  properties: T | undefined,
): T | undefined {
  if (!properties) return properties;

  let changed = false;
  const next: Record<string, unknown> = {};

  // `T extends object` 로 받는 이유: SDK 의 `event_properties` 는 일반 사전과
  // `RevenueEventProperties` 의 합집합이라 `Record<string, unknown>` 으로 못 받는다.
  for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
    // 값의 **타입을 보지 않는다.** 막을 것은 숫자로도(생년) 배열로도(네 기둥)
    // 온다. 이 검사가 URL 검사보다 먼저 와야 하는 이유이기도 하다.
    if (isBlockedKey(key)) {
      changed = true;
      next[key] = BLOCKED_PLACEHOLDER;
      continue;
    }

    if (typeof value === "string" && (URL_PROPERTIES.has(key) || looksLikeUrl(value))) {
      const cleaned = redactUrl(value);
      if (cleaned !== value) changed = true;
      next[key] = cleaned;
      continue;
    }

    // **한 겹 안쪽까지 본다.** `identify` 이벤트의 user_properties 는 값이 아니라
    // 연산자로 감싸여 온다 — `{ $set: { … }, $add: { … } }`. 겉만 훑으면 그
    // 안쪽 키는 그물을 그냥 통과하고, 유저 속성은 이벤트와 달리 **영구히** 남는다.
    //
    // 배열은 파고들지 않는다: 원소에는 키가 없으므로 이름으로 막을 것이 없다.
    if (isPlainObject(value)) {
      const cleaned = redactProperties(value);
      if (cleaned !== value) changed = true;
      next[key] = cleaned;
      continue;
    }

    next[key] = value;
  }

  return changed ? (next as T) : properties;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
