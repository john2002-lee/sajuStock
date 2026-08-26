"use client";

import { useState } from "react";
import { ANONYMOUS, loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { ApiError, bff } from "@/lib/http/browser";
import type { BirthInput } from "../model/types";
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

export function PayButton({ birth, amount, orderName = "천명 정밀 사주 리포트" }: PayButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 카드가 먼저다 — 대부분이 그것을 먼저 집는다. 계좌이체는 카드사 인증이
  // 끝나지 않을 때의 출구다.
  const [method, setMethod] = useState<PaymentMethod>("CARD");

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      if (!CLIENT_KEY || !APP_ORIGIN) {
        throw new Error("결제 설정이 없습니다.");
      }

      // 1) 서버가 주문번호와 금액을 정한다.
      const order = await bff.post<OrderCreated>("/api/saju/orders", {
        birth: fromBirthInput(birth),
      });
      if (!order) throw new Error("주문을 만들지 못했습니다.");

      // 2) 토스 결제창으로 넘긴다. 금액은 **서버가 준 값**을 쓴다.
      const tossPayments = await loadTossPayments(CLIENT_KEY);
      const payment = tossPayments.payment({ customerKey: ANONYMOUS });

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
        disabled={loading}
        className="w-full rounded-pill bg-button-gradient px-6 py-3.5 text-[15px] font-bold text-on-primary shadow-cta transition-opacity disabled:opacity-60"
      >
        {loading ? "결제창을 여는 중…" : `${amount.toLocaleString("ko-KR")}원 결제하고 보기`}
      </button>

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
