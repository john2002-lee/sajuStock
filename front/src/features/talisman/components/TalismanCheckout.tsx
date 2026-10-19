"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ANONYMOUS, loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { ApiError, bff } from "@/lib/http/browser";
import {
  CHECKOUT_CONFIGURED,
  CHECKOUT_UNAVAILABLE_NOTICE,
  IS_TEST_PAYMENT,
  TEST_PAYMENT_NOTICE,
} from "@/lib/config/payment-mode";
import {
  TALISMAN_DELIVERY_NOTE,
  TALISMAN_EFFICACY_NOTICE,
  TALISMAN_FORMAT_NOTE,
  TALISMAN_LICENSE_NOTE,
  TALISMAN_PRICE,
  TALISMAN_REFUND_LIMIT,
} from "@/shared/legal/talisman";
import type { TalismanItem } from "../model/catalog";

/**
 * 부적 결제 패널 — 고지 · 동의 · 결제 수단 · 결제 버튼.
 *
 * 흐름은 사주의 `PayButton` 과 같다: **서버가 주문번호와 금액을 정하고**, 브라우저는
 * 그 값으로 토스 결제창(리다이렉트)을 연다. 돌아오는 자리는 `/talisman/pay/success`.
 *
 * 사주 컴포넌트를 가져다 쓰지 않는다. 부적은 사주와 별개 상품이고, 사주 feature 를
 * 접을 때 이 화면이 함께 깨지면 안 된다(로또와 같은 규칙).
 */

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
  order_name: string;
}

const NOTES: readonly string[] = [
  TALISMAN_DELIVERY_NOTE,
  TALISMAN_EFFICACY_NOTICE,
  TALISMAN_LICENSE_NOTE,
];

export function TalismanCheckout({ item }: { item: TalismanItem }) {
  const [agreed, setAgreed] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("CARD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agreeId = useId();

  async function handlePay() {
    setError(null);
    // `CHECKOUT_CONFIGURED` 가 참이면 둘 다 있다. 타입을 좁히려는 검사다.
    if (!CHECKOUT_CONFIGURED || !CLIENT_KEY || !APP_ORIGIN) {
      setError(CHECKOUT_UNAVAILABLE_NOTICE);
      return;
    }
    setLoading(true);
    try {
      const order = await bff.post<OrderCreated>("/api/talismans/orders", {
        talisman_id: item.id,
      });
      if (!order) throw new Error("주문을 만들지 못했습니다.");

      const tossPayments = await loadTossPayments(CLIENT_KEY);
      const payment = tossPayments.payment({ customerKey: ANONYMOUS });
      const request = {
        // 금액·주문명은 **서버가 준 값**이다. 화면의 표시용 가격을 싣지 않는다.
        amount: { currency: "KRW", value: order.amount } as const,
        orderId: order.order_id,
        orderName: order.order_name,
        successUrl: `${APP_ORIGIN}/talisman/pay/success`,
        failUrl: `${APP_ORIGIN}/talisman/pay/fail`,
      };
      // 수단별 오버로드가 리터럴 `method` 를 요구한다(`PayButton` 주석).
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
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px] leading-relaxed">
        <dt className="text-muted-3">상품명</dt>
        <dd className="text-ink-body">{item.name}</dd>
        <dt className="text-muted-3">가격</dt>
        <dd className="text-ink-body">{TALISMAN_PRICE.toLocaleString("ko-KR")}원 (부가세 포함)</dd>
        <dt className="text-muted-3">구성</dt>
        <dd className="text-ink-body">{TALISMAN_FORMAT_NOTE}</dd>
      </dl>

      <ul className="mt-3 list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-muted">
        {NOTES.map((note) => (
          <li key={note}>{note}</li>
        ))}
        <li className="font-semibold text-ink-body">{TALISMAN_REFUND_LIMIT}</li>
      </ul>

      <label htmlFor={agreeId} className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-ink-body">
        <input
          id={agreeId}
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 accent-[var(--color-gold-accent)]"
        />
        <span>
          위 내용과{" "}
          <Link href="/terms" className="underline underline-offset-2">
            이용약관
          </Link>
          ·
          <Link href="/refund" className="underline underline-offset-2">
            환불정책
          </Link>
          을 확인했습니다.
        </span>
      </label>

      <div role="group" aria-label="결제 수단" className="mt-4 flex gap-1 rounded-pill bg-surface p-1">
        {METHODS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={opt.value === method}
            onClick={() => setMethod(opt.value)}
            className={
              "flex min-h-[var(--tap)] flex-1 items-center justify-center rounded-pill px-4 text-sm font-semibold transition " +
              (opt.value === method ? "bg-gold-gradient text-on-primary shadow-card-sm" : "text-ink-body")
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {CHECKOUT_CONFIGURED ? (
        <button
          type="button"
          onClick={handlePay}
          disabled={!agreed || loading}
          className="mt-4 w-full rounded-pill bg-button-gradient px-6 py-3.5 text-[15px] font-bold text-on-primary shadow-cta transition-opacity disabled:opacity-60"
        >
          {loading
            ? "결제창을 여는 중…"
            : `${TALISMAN_PRICE.toLocaleString("ko-KR")}원 결제하고 받기`}
        </button>
      ) : (
        <p className="mt-4 text-center text-[13px] text-muted">{CHECKOUT_UNAVAILABLE_NOTICE}</p>
      )}

      {IS_TEST_PAYMENT && (
        <p className="mt-3 text-center text-[12.5px] font-semibold leading-relaxed text-gold-text-strong">
          {TEST_PAYMENT_NOTICE}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-card-sm border border-hairline bg-surface px-4 py-3 text-[13.5px] leading-relaxed text-wuxing-fire"
        >
          {error}
        </p>
      )}
    </div>
  );
}
