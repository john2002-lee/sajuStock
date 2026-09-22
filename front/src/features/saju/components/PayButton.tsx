"use client";

import { useRef, useState } from "react";
import { ANONYMOUS, loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { ApiError, bff } from "@/lib/http/browser";
import { SAJU_EVENT, SAJU_PRODUCT_ID } from "@/shared/analytics/events";
import type { BirthInput } from "../model/types";
import { trackSaju } from "../model/analytics";
import { secondsSince } from "../model/analytics-context";
import {
  CHECKOUT_CONFIGURED,
  CHECKOUT_UNAVAILABLE_NOTICE,
  IS_TEST_PAYMENT,
  TEST_PAYMENT_NOTICE,
} from "@/lib/config/payment-mode";
import { REPORT_PRODUCT_NAME } from "@/shared/legal/product";
import { fromBirthInput } from "../services/wire";
import { PillToggle } from "./PillToggle";

/**
 * 토스 결제 CTA. SDK 의 비위젯 `payment()` + `requestPayment()`(리다이렉트 방식)을
 * 쓴다 — 브라우저가 토스가 호스팅하는 결제창으로 갔다가 돌아온다.
 *
 * ## 결제 수단을 여기서 고르게 하는 이유
 *
 * `requestPayment` 는 **한 번에 한 수단만** 받고, 결제창 자체에는 수단 선택이 없다.
 * 카드로 고정해 두면 카드사 본인인증(앱카드 푸시·SMS)이 완료되지 않는 사람은
 * **아예 살 수 없다.** 계좌이체는 그 인증이 필요 없고 서버 쪽 처리는 완전히 같다 —
 * `TossPaymentsProvider.confirm` 은 `status === "DONE"` 만 보고 수단은 보지 않는다.
 *
 * ## 주문을 먼저 만든다
 *
 * 결제창을 열기 전에 서버에 주문을 만들어 **금액과 주문번호를 서버가 정하게** 한다.
 * 클라이언트가 정한 금액으로 결제하면 100원짜리 요청으로 리포트를 살 수 있다.
 *
 * `successUrl`/`failUrl` 은 **절대 URL 이어야 한다** — 토스가 상대 경로를 거부한다.
 */

export interface PayButtonProps {
  birth: BirthInput;
  amount: number;
  orderName?: string;
  /**
   * 눌리지 않게 막는다. 지금 이걸 쓰는 곳은 청약철회 동의 전의 구매 카드다
   * (`PurchaseCard`) — 동의를 받기 전에 결제창이 열리면 그 동의는 형식이 된다.
   */
  disabled?: boolean;
}

/** 토스가 아는 식별자다. 자유 문자열이 아니며, 틀리면 결제창에서야 드러난다. */
type PaymentMethod = "CARD" | "TRANSFER";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CARD", label: "카드" },
  { value: "TRANSFER", label: "계좌이체" },
];

const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN;

interface OrderCreated {
  order_id: string;
  amount: number;
}

export function PayButton({
  birth,
  amount,
  orderName = REPORT_PRODUCT_NAME,
  disabled = false,
}: PayButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 카드가 먼저다 — 대부분이 그것을 먼저 집는다. 계좌이체는 카드사 인증이
  // 끝나지 않을 때의 출구다.
  const [method, setMethod] = useState<PaymentMethod>("CARD");
  /** 이 주문의 몇 번째 시도인가. 재시도 버튼이 실제로 쓰이는지 본다. */
  const attempts = useRef(0);

  async function handleClick() {
    setError(null);

    // **누를 때마다 반드시 실패하는 경로를 먼저 끊는다.**
    //
    // 예전에는 이 검사가 아래 `try` 안에서 `throw` 였다. 그 오류는 `ApiError` 가
    // 아니므로 `catch` 가 "결제를 시작할 수 없습니다. **잠시 후 다시 시도해
    // 주세요.**" 로 덮었는데, 빌드에 박히는 값이 없는 상태라 재시도로는 영원히
    // 해결되지 않는다 — 화면이 고객에게 거짓말을 하고 있었다.
    //
    // `PurchaseCard` 가 이미 렌더 시점에 막으므로 여기까지 오는 일은 없어야 한다.
    // 그래도 남겨 두는 것은 이 컴포넌트가 `index.ts` 로 공개돼 있어 다른 화면이
    // 카드 없이 들 수 있기 때문이다.
    if (!CHECKOUT_CONFIGURED) {
      trackSaju(SAJU_EVENT.paymentFailed, {
        failure_stage: "config",
        error_code: "checkout_not_configured",
        http_status: 0,
        is_duplicate: false,
        payment_method: method === "CARD" ? "card" : "transfer",
        price_krw: amount,
        retry_index: attempts.current,
      });
      setError(CHECKOUT_UNAVAILABLE_NOTICE);
      return;
    }

    setLoading(true);

    const retryIndex = attempts.current;
    attempts.current += 1;

    // 토스가 아는 식별자는 대문자지만, 이벤트 값은 소문자 snake_case 로 고정한다
    // (`docs/analytics/saju-amplitude-taxonomy.md` 8절).
    const paymentMethod = method === "CARD" ? "card" : "transfer";

    trackSaju(SAJU_EVENT.purchaseClicked, {
      price_krw: amount,
      payment_method: paymentMethod,
      product_id: SAJU_PRODUCT_ID,
      teaser_seconds: secondsSince("teaser_viewed"),
      retry_index: retryIndex,
    });

    // 실패 이벤트가 **어느 칸에서** 났는지 말할 수 있어야 한다. 주문 생성 실패와
    // 결제창을 못 연 것은 고치는 사람도 고치는 방법도 다르다.
    let stage: "order" | "checkout" = "order";
    const startedAt = Date.now();
    try {
      // 위 `CHECKOUT_CONFIGURED` 가 통과했으므로 둘 다 값이 있다. 타입을 좁히기
      // 위한 단정이고, 판정은 한곳(`payment-mode`)에만 둔다 — 조건을 여기서 다시
      // 적으면 두 규칙이 되고 둘이 어긋나는 날을 아무도 눈치채지 못한다.
      if (!CLIENT_KEY || !APP_ORIGIN) throw new Error("결제 설정이 없습니다.");

      // 1) 서버가 주문번호와 금액을 정한다.
      const order = await bff.post<OrderCreated>("/api/saju/orders", {
        birth: fromBirthInput(birth),
      });
      if (!order) throw new Error("주문을 만들지 못했습니다.");
      stage = "checkout";

      // 2) 토스 결제창으로 넘긴다. 금액은 **서버가 준 값**을 쓴다.
      const tossPayments = await loadTossPayments(CLIENT_KEY);
      const payment = tossPayments.payment({ customerKey: ANONYMOUS });

      // 바로 아래 `requestPayment` 가 브라우저를 토스로 **넘겨 버린다.** 그 전에
      // 쏴야 이 이벤트가 나갈 기회를 얻는다. 주문번호는 싣지 않는다 — 결제
      // 자격증명의 한 조각이다.
      trackSaju(SAJU_EVENT.checkoutOpened, {
        price_krw: order.amount,
        payment_method: paymentMethod,
        product_id: SAJU_PRODUCT_ID,
        order_created_ms: Date.now() - startedAt,
      });

      const request = {
        amount: { currency: "KRW", value: order.amount } as const,
        orderId: order.order_id,
        orderName,
        successUrl: `${APP_ORIGIN}/saju/pay/success`,
        failUrl: `${APP_ORIGIN}/saju/pay/fail`,
      };

      // `RequestPayment` 는 수단별 오버로드의 **교집합**이라 각각 리터럴 `method` 를
      // 요구한다. 유니온 변수를 그대로 넘기면 어느 오버로드에도 맞지 않는다 —
      // 분기가 이 코드를 건전하게 만드는 것이지 취향이 아니고, `as` 로 덮으면
      // 타입 검사가 잡아 준 실수를 도로 감춘다.
      if (method === "CARD") {
        await payment.requestPayment({ method: "CARD", ...request });
      } else {
        await payment.requestPayment({ method: "TRANSFER", ...request });
      }
    } catch (err) {
      trackSaju(SAJU_EVENT.paymentFailed, {
        failure_stage: stage,
        error_code: err instanceof ApiError ? err.code : "checkout_error",
        http_status: err instanceof ApiError ? err.status : 0,
        is_duplicate: err instanceof ApiError && err.status === 409,
        payment_method: paymentMethod,
        price_krw: amount,
        retry_index: retryIndex,
      });
      setError(
        err instanceof ApiError
          ? err.message
          : "결제를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      );
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <PillToggle
          options={METHODS}
          value={method}
          onChange={setMethod}
          groupLabel="결제 수단"
        />
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={loading || disabled}
        className="w-full rounded-pill bg-button-gradient px-6 py-3.5 text-[15px] font-bold text-on-primary shadow-cta transition-opacity disabled:opacity-60"
      >
        {loading ? "결제창을 여는 중…" : `${amount.toLocaleString("ko-KR")}원 결제하고 보기`}
      </button>

      {/* **진짜 고지는 여기다.** 돈이 걸리는 버튼 바로 아래이고 닫을 수 없다.
          첫 화면의 팝업(`NoticePopup`)은 같은 문장을 한 번 크게 알릴 뿐이고,
          그쪽은 닫히면 다시 뜨지 않는다.

          조건은 토스 클라이언트 키 접두사다 — 라이브 키로 다시 빌드하면 이 줄이
          저절로 사라진다. 손으로 내리는 플래그였다면 키만 바꾸고 문구를 남기는
          배포가 언젠가 나온다(`lib/config/payment-mode` 머리말). */}
      {IS_TEST_PAYMENT && (
        <p className="mt-3 text-center text-[12.5px] font-semibold leading-relaxed text-gold-text-strong">
          {TEST_PAYMENT_NOTICE}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-card-sm border border-hairline bg-surface-warm px-4 py-3 text-[13.5px] leading-relaxed text-wuxing-fire"
        >
          {error}
        </p>
      )}
    </div>
  );
}
