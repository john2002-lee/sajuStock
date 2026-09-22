/**
 * 지금 결제가 **진짜 돈을 움직이는가**를 판정한다.
 *
 * ## 왜 손으로 켜는 플래그가 아닌가
 *
 * 화면에 "실제 돈이 결제되지 않습니다" 라고 적으려면 그 말이 항상 참이어야 한다.
 * 손으로 내리는 플래그를 두면 언젠가 **라이브 키만 바꾸고 문구는 그대로 두는** 배포가
 * 나온다. 그 순간 화면은 돈을 받으면서 받지 않는다고 말한다 — 결제 화면에서 이것보다
 * 나쁜 거짓말은 없다.
 *
 * 그래서 근거를 키 자체에 둔다. 토스 클라이언트 키는 `test_ck_…` / `live_ck_…` 로
 * 시작하므로, 라이브 키를 넣는 순간 이 고지는 **스스로 사라진다.** 잊어버릴 단계가
 * 하나도 남지 않는다.
 *
 * 이 저장소가 이미 쓰는 방식이다 — `public.ts` 의 `resolveSupportEmail` 은 예약
 * 도메인을 프로덕션에서 떨어뜨리고, "천원의 행복" 배지는 가격이 실제로 1,000원일
 * 때만 붙는다(`TeaserView`). 값에서 파생시키면 화면이 거짓을 말할 수 없다.
 *
 * ## 모르면 고지하지 않는다
 *
 * 접두사가 `test_` 가 아니면 — 라이브든, 미설정이든, 우리가 모르는 형식이든 —
 * 테스트가 **아닌** 것으로 친다. 판정이 한쪽으로 틀릴 수밖에 없다면, "돈이 나갈 수
 * 있다" 쪽으로 틀리는 편이 안전하다. 반대로 틀리면 실제 결제를 무료라고 안내한다.
 */

/** 토스 테스트 키의 접두사. 시크릿 키(`test_sk_`)도 같은 규칙을 따른다. */
const TEST_PREFIX = "test_";

/**
 * 이 키가 토스 **테스트** 키인가.
 *
 * 대소문자를 가리지 않는 것은 관대해서가 아니라 안전한 쪽이기 때문이다 — 어쩌다
 * 대문자로 적힌 테스트 키를 라이브로 오인하면 고지가 빠진다.
 *
 * 접두사로만 본다. 키 **안에** `test_` 가 들어 있는 라이브 키를 테스트로 오인하면
 * 안 되기 때문이다.
 */
export function isTestPaymentKey(key: string | undefined | null): boolean {
  return (key ?? "").trim().toLowerCase().startsWith(TEST_PREFIX);
}

/**
 * 이 빌드가 테스트 결제를 쓰는가.
 *
 * `NEXT_PUBLIC_*` 는 **빌드 시점에 리터럴 치환**되므로 반드시 이렇게 통째로 적어야
 * 한다(`public.ts` 머리말). 계산된 키 조회는 브라우저에서 `undefined` 가 된다.
 */
export const IS_TEST_PAYMENT = isTestPaymentKey(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY);

/**
 * 테스트 결제 중임을 알리는 문구. **한 곳에 둔다** — 팝업과 결제 버튼이 같은 말을
 * 해야 하고, 두 벌로 적어 두면 한쪽만 고쳐지는 날이 온다.
 */
export const TEST_PAYMENT_NOTICE =
  "결제는 테스트 용도입니다. 실제 돈이 결제되지 않습니다.";

/**
 * 결제창을 열 재료가 다 있는가.
 *
 * `PayButton` 은 토스 클라이언트 키와 **절대 URL** 두 개가 모두 있어야
 * `requestPayment` 를 부를 수 있다(토스가 상대 경로를 거부한다). 둘 중 하나라도
 * 없으면 그 버튼은 **누를 때마다 반드시 실패한다.**
 *
 * 순수 함수로 갈라 둔 것은 위 `isTestPaymentKey` 와 같은 이유다 — 판정이 틀렸을 때
 * 테스트로 잡을 수 있어야 한다.
 *
 * 공백만 있는 값은 없는 것으로 본다. `.env` 에 `NEXT_PUBLIC_TOSS_CLIENT_KEY=` 만
 * 적혀 있으면 빈 문자열이 인라인되는데, 그것으로 `loadTossPayments` 를 부르면
 * 결제창에서야 실패한다.
 */
export function isCheckoutConfigured(
  clientKey: string | undefined | null,
  appOrigin: string | undefined | null,
): boolean {
  return Boolean((clientKey ?? "").trim()) && Boolean((appOrigin ?? "").trim());
}

/**
 * 이 빌드가 결제창을 열 수 있는가.
 *
 * ## 이 값이 없어서 생긴 일
 *
 * 서버는 팔 수 있다고 답하고(`payment.enabled === true`) 화면은 정상 판매 카드를
 * 그렸는데, 클라이언트 키가 빌드에 없어 버튼이 조용히 실패했다. 사용자가 본 것은
 * "결제를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요." 였다 — **다시 시도해도
 * 영원히 안 되는 상태에서** 재시도를 권하는 문구다.
 *
 * 원인은 판매 가능 여부의 판단이 두 곳으로 갈려 있던 것이다. 서버는 자기 키
 * (`toss_secret_key`·`saju_access_token_secret`)만 보고, 화면은 그 답만 믿었다.
 * 어느 쪽도 **브라우저 번들에 클라이언트 키가 들어왔는지**는 보지 않았다.
 *
 * 그래서 화면이 결제 카드를 그리기 **전에** 이 값을 본다(`PurchaseCard`).
 *
 * `NEXT_PUBLIC_*` 는 빌드 시점 리터럴 치환이라 통째로 적어야 한다(위 주석).
 */
export const CHECKOUT_CONFIGURED = isCheckoutConfigured(
  process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
  process.env.NEXT_PUBLIC_APP_ORIGIN,
);

/**
 * 결제 재료가 없을 때 화면이 하는 말. **재시도를 권하지 않는 것이 요점이다** —
 * 빌드에 박히는 값이라 눌러도 바뀌지 않고, "잠시 후 다시" 는 거짓이다.
 *
 * 사용자 잘못이 아님을 분명히 한다. 입력을 고쳐 볼 여지를 주면 그 사람은 자기
 * 생년월일시를 의심하며 시간을 쓴다.
 */
export const CHECKOUT_UNAVAILABLE_NOTICE =
  "지금은 결제를 진행할 수 없습니다. 서비스 설정 문제이며, 입력하신 정보에는 문제가 없습니다.";
