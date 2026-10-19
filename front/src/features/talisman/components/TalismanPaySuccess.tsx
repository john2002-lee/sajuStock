"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, bff } from "@/lib/http/browser";
import { SUPPORT_EMAIL } from "@/lib/config/public";
import { orderPath, parseConfirmParams } from "../model/checkout";

/**
 * 부적 결제 성공 화면 — 토스가 돌려보낸 값으로 **승인**을 마치고 구매 완료 화면으로
 * 보낸다. 승인을 부르지 않으면 결제는 일정 시간 뒤 자동 취소된다.
 *
 * 실패의 갈래는 사주 쪽(`PaySuccessScreen`)과 같다.
 *  - 409 `talisman_payment_needs_attention` — 모른다. 사람이 대조한다.
 *  - 그 밖의 실패 — 다시 시도할 수 있다(서버가 멱등이라 두 번 긁지 않는다).
 */

interface Confirmed {
  access_token: string;
}

const NEEDS_ATTENTION = "talisman_payment_needs_attention";

export function TalismanPaySuccess() {
  const router = useRouter();
  const params = useSearchParams();
  const confirm = parseConfirmParams(params);
  const [error, setError] = useState<{ message: string; needsAttention: boolean } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  /** Strict Mode 의 이펙트 재실행이 승인을 두 번 보내지 않게. */
  const started = useRef(false);

  const paymentKey = confirm?.payment_key;
  const orderId = confirm?.order_id;
  const amount = confirm?.amount;

  useEffect(() => {
    if (!paymentKey || !orderId || amount === undefined) return;
    if (started.current) return;
    started.current = true;

    // 취소 플래그를 두지 않는다. 개발 모드 Strict Mode 는 이펙트를 정리 후 다시 돌리는데,
    // 두 번째 실행은 위 `started` 로 건너뛰므로 플래그가 있으면 첫 승인의 결과가 버려져
    // "확인 중" 에 멈춘다. 언마운트 뒤의 `setState`·`replace` 는 해가 없다.
    bff
      .post<Confirmed>("/api/talismans/payments/confirm", {
        payment_key: paymentKey,
        order_id: orderId,
        amount,
      })
      .then((data) => {
        if (!data?.access_token) throw new Error("빈 응답");
        // `replace` — 뒤로가기로 이 화면에 돌아와 승인을 다시 보내지 않게.
        router.replace(orderPath(data.access_token));
      })
      .catch((err) => {
        const isApi = err instanceof ApiError;
        setError({
          message: isApi ? err.message : "결제 확인이 지연되고 있습니다. 다시 시도해 주세요.",
          needsAttention: isApi && err.code === NEEDS_ATTENTION,
        });
        started.current = false;
      });
  }, [paymentKey, orderId, amount, router, retryKey]);

  const shown = error ?? (confirm ? null : { message: "결제 정보가 올바르지 않습니다.", needsAttention: false });

  if (!shown) {
    return (
      <div className="rounded-card bg-surface p-6 text-center shadow-card sm:p-8" aria-live="polite">
        <p className="font-mono-kr text-xs tracking-[0.12em] text-gold-text">결제 확인 중</p>
        <h1 className="mt-2 font-display text-xl text-ink">부적을 준비하고 있습니다</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-body">
          잠시만 기다려 주세요. 이 화면을 닫지 마세요.
        </p>
      </div>
    );
  }

  return (
    <div role="alert" className="rounded-card bg-surface p-6 shadow-card sm:p-8">
      <p className="font-mono-kr text-xs tracking-[0.12em] text-wuxing-fire">
        {shown.needsAttention ? "확인 중" : "결제 확인 실패"}
      </p>
      <h1 className="mt-2 mb-3 font-display text-xl text-ink">
        {shown.needsAttention ? "담당자가 확인하고 있습니다" : "결제를 확인하지 못했습니다"}
      </h1>
      <p className="text-[14px] leading-relaxed text-ink-body">{shown.message}</p>

      {shown.needsAttention && (
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-body">
          문의사항이 있으시면{" "}
          {SUPPORT_EMAIL ? (
            <>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold-text underline underline-offset-2">
                {SUPPORT_EMAIL}
              </a>
              로 연락해 주시거나{" "}
            </>
          ) : null}
          <Link href="/support" className="text-gold-text underline underline-offset-2">
            고객센터
          </Link>
          로 알려 주세요.
        </p>
      )}

      {!shown.needsAttention && confirm && (
        <button
          type="button"
          onClick={() => setRetryKey((k) => k + 1)}
          className="mt-5 w-full rounded-pill bg-button-gradient px-6 py-3 text-[14px] font-bold text-on-primary shadow-cta"
        >
          다시 확인하기
        </button>
      )}

      <Link
        href="/"
        className="mt-3 block text-center text-[13px] text-muted-2 underline underline-offset-2"
      >
        처음 화면으로
      </Link>
    </div>
  );
}
