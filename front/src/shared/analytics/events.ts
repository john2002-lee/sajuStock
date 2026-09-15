/**
 * 사주 이벤트 택소노미의 **계약**. 설계 문서와 1:1 로 대응한다
 * (`docs/analytics/saju-amplitude-taxonomy.md`).
 *
 * ## 왜 상수로 두는가
 *
 * 이벤트 이름 오타는 빌드를 깨지 않고, 화면도 멀쩡하고, 콘솔에도 안 나온다.
 * Amplitude 에 이벤트가 하나 더 생길 뿐이다. 몇 주 뒤 퍼널을 그릴 때에야 같은
 * 행동이 두 이름으로 갈려 쌓여 있는 것을 발견하게 되고, 그때는 이미 늦다.
 *
 * ## 이 파일은 SDK 를 모른다
 *
 * 순수 모듈이라 `node --test` 가 그대로 돌린다. SDK 를 부르는 자리는
 * `./track.ts` 하나이고, 사주 컨텍스트를 붙이는 자리는
 * `features/saju/model/analytics.ts` 하나다. 셋을 나눈 이유는 파일 수가 아니라
 * **테스트할 수 있는 부분을 SDK 에서 떼어내기 위해서**다.
 */

/** 이벤트 이름. 값은 절대 바꾸지 않는다 — 바꾸면 과거 데이터와 갈라진다. */
export const SAJU_EVENT = {
  // --- C1 saju_purchase ---
  entryViewed: "saju_entry_viewed",
  birthSubmitted: "saju_birth_submitted",
  chartCalculated: "saju_chart_calculated",
  chartFailed: "saju_chart_failed",
  teaserViewed: "saju_teaser_viewed",
  purchaseClicked: "saju_purchase_clicked",
  checkoutOpened: "saju_checkout_opened",
  paymentConfirmed: "saju_payment_confirmed",
  paymentFailed: "saju_payment_failed",
  // 생성 완료(`saju_report_generated`)를 따로 두지 않는다. 무료 경로에서는 잡이
  // 끝나는 순간이 곧 렌더되는 순간이고, 유료 경로에서는 생성이 서버에서 끝나 있어
  // 관측되지 않는다. 기다린 시간은 아래 이벤트의 `generation_ms` 가 들고 있고,
  // "결제했는데 못 읽은 사람" 은 확정 이벤트와의 차이로 나온다.
  reportViewed: "saju_report_viewed",
  reportFailed: "saju_report_failed",

  // --- C2 saju_engagement ---
  followUpAsked: "saju_followup_asked",
  followUpAnswered: "saju_followup_answered",
  followUpFailed: "saju_followup_failed",
  reportReopened: "saju_report_reopened",
  siteShared: "saju_site_shared",

  // --- Phase 2 ---
  introCompleted: "saju_intro_completed",
  expiredReportOpened: "saju_expired_report_opened",
  followUpInputAbandoned: "saju_followup_input_abandoned",
} as const;

export type SajuEventName = (typeof SAJU_EVENT)[keyof typeof SAJU_EVENT];

/**
 * 분석에서 유료 리포트를 가리키는 이름.
 *
 * **가격이나 구성이 바뀌면 `v2` 로 올린다.** 같은 id 로 두면 개편 전후 매출이 한
 * 칸에 섞여 "값을 올린 뒤 무슨 일이 있었나" 를 물을 수 없게 된다.
 */
export const SAJU_PRODUCT_ID = "saju_report_v1";

/**
 * 이벤트에 실을 수 있는 값.
 *
 * `null` 은 허용하고 `undefined` 는 조립 단계에서 떨어진다 — 아래 `buildPayload`
 * 주석이 그 구분의 이유를 적는다.
 */
export type EventPropertyValue = string | number | boolean | null;

export type EventProperties = Record<string, EventPropertyValue | undefined>;

// --- 상속 컨텍스트의 어휘 -------------------------------------------------
//
// 저장은 `features/saju/model/analytics-context.ts` 가 하지만, **무엇이 실릴 수
// 있는가** 는 택소노미의 계약이므로 여기 둔다. 그래야 features → shared 라는
// 의존 방향이 지켜진다.

/**
 * 최초 진입 퍼널.
 *
 * **마케팅 채널이 아니다.** `ad` 나 `naver_search` 같은 값이 여기 없는 이유는
 * 오토캡처의 attribution 이 이미 utm·referrer 를 채워 주기 때문이다. 같은 것을
 * 두 번 수집하면 두 값이 언젠가 어긋나고, 그때 어느 쪽이 맞는지 아무도 모른다.
 *
 * 여기서 답하는 것은 **제품 안에서 어느 문으로 들어왔는가** 다.
 *
 *   - `root` — 루트(`/`)로 바로 들어왔다. 검색·광고·직접 입력이 전부 여기다
 *     (어느 채널이었는지는 attribution 이 말한다)
 *   - `intro` — 소개 웹툰을 읽고 넘어왔다
 *   - `unknown` — 리퍼러를 해석하지 못했다. 추측하지 않는다
 *
 * 옛 `/saju` 주소로 들어온 사람은 여기서 구분하지 않는다. 307 리다이렉트는
 * 리퍼러를 바꾸지 않으므로 브라우저에서는 보이지 않고, 보이게 하려면 주소에 표식을
 * 붙이거나(깨끗한 주소를 포기) 분석만을 위한 쿠키를 굽어야 한다. **그 질문은 서버
 * 로그가 이미 답한다** — Amplitude 가 답할 질문이 아니다.
 */
export type RootPath = "root" | "intro" | "unknown";

export type ReportTier = "free" | "paid";

/** 일간 10종. 한자·한글이 아니라 로마자다 — 값이 표기나 문구에 묶이면 안 된다. */
export type DayMaster =
  | "jia"
  | "yi"
  | "bing"
  | "ding"
  | "wu"
  | "ji"
  | "geng"
  | "xin"
  | "ren"
  | "gui";

export type DominantElement = "wood" | "fire" | "earth" | "metal" | "water";

/**
 * 퍼널 전 구간에 함께 실리는 값들.
 *
 * 다섯 개뿐인 이유: Amplitude 퍼널의 Holding Constant 가 실제로 필요한 축만
 * 남겼다. 상속이 늘면 앞 단계가 없을 때 뒤 단계 값이 비고, 그러면 경로를 바꾸는
 * 순간 데이터가 조용히 왜곡된다.
 */
export interface SajuAnalyticsContext {
  root_path?: RootPath;
  report_tier?: ReportTier;
  day_master?: DayMaster;
  dominant_element?: DominantElement;
  is_time_unknown?: boolean;
}

/**
 * 상속 컨텍스트와 호출부 속성을 합쳐 **전송할 한 벌**을 만든다.
 *
 * ## 호출부가 이긴다
 *
 * 같은 이름이 양쪽에 있으면 호출부 값을 쓴다. 그 순간에 관측한 값이 세션 내내
 * 들고 다닌 값보다 구체적이기 때문이다 (예: 티저에서 확정되기 전의
 * `report_tier`).
 *
 * ## `undefined` 는 떨어뜨리고 `null` 은 남긴다
 *
 * 둘이 다른 뜻이다. `null` 은 **해당 없음**이고(자유입력 질문의 `preset_key`),
 * `undefined` 는 **모름**이다(마크가 없어 못 잰 `elapsed_ms`). `null` 을 생략하면
 * "프리셋을 안 썼다" 와 "계측이 빠졌다" 를 나중에 구분할 수 없다.
 *
 * 호출부의 `undefined` 는 컨텍스트 값을 덮지 **않는다** — 객체 전개로 합치면
 * 덮어 버리므로 한 키씩 본다.
 */
export function buildPayload(
  properties: EventProperties,
  context: SajuAnalyticsContext,
): Record<string, EventPropertyValue> {
  const payload: Record<string, EventPropertyValue> = {};

  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined) payload[key] = value as EventPropertyValue;
  }
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined) payload[key] = value;
  }

  return payload;
}
