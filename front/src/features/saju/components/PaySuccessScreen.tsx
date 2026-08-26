"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, bff } from "@/lib/http/browser";
import { SUPPORT_EMAIL } from "@/lib/config/public";
import { Shaman } from "./Shaman";
import { ShamanDance } from "./ShamanDance";

/**
 * 결제 성공 화면 — 토스가 돌려보낸 값으로 **승인**을 마치고 리포트로 보낸다.
 *
 * ## 여기가 결제의 진짜 끝이다
 *
 * 토스 결제창이 성공으로 돌아왔다는 것은 "고객이 결제를 마쳤다" 는 뜻이지 **아직
 * 승인된 것은 아니다.** 승인(confirm)은 서버가 토스에 다시 물어 확정하는 단계이고,
 * 그것을 하지 않으면 결제는 일정 시간 뒤 자동 취소된다. 그래서 이 화면이 반드시
 * 한 번은 떠야 하고, 사용자가 여기서 이탈해도 되도록 **한 번만** 부른다.
 *
 * ## 이제 승인만 기다린다 — 리포트는 기다리지 않는다
 *
 * 예전에는 승인 요청 하나가 토스 승인(1초)과 리포트 생성(36초)을 함께 했다. 그래서
 * **결제가 됐는지조차 37초 동안 알 수 없었고**, 그 사이 연결이 끊기면 돈은 나갔는데
 * 화면은 실패를 띄웠다. 결제 화면에서 그것은 가장 나쁜 실패 방식이다.
 *
 * 이제 서버는 승인이 확정되는 즉시 토큰을 준다(`ready` 는 저장된 리포트가 이미
 * 있는지). 리포트는 뒤에서 만들어져 저장되고, 다음 화면이 그것을 기다린다 —
 * **토큰이 손에 들어온 순간부터 리포트를 잃는 경로가 없다.**
 *
 * ## 실패의 세 갈래를 구분한다
 *
 *  - **409 `needs_attention`** — 결제 상태를 확정할 수 없다. **실패가 아니다.**
 *    자동 환불하지 않고 사람이 대조하므로, 그 사실을 그대로 말한다.
 *  - **그 밖의 4xx** — 승인이 거절됐다. 다시 시도할 수 있다.
 *  - **네트워크** — 승인이 됐는지조차 모른다. 재시도 버튼을 준다(서버가 멱등이라
 *    두 번 눌러도 두 번 긁지 않는다).
 */

interface Confirmed {
  access_token: string;
  /** 저장된 리포트가 이미 있는지. 없으면 다음 화면이 폴링해 기다린다. */
  ready: boolean;
}

export function PaySuccessScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<{ message: string; needsAttention: boolean } | null>(null);
  /** 승인을 **한 번만** 시작한다. Strict Mode 의 이펙트 재실행이 두 번 긁지 않게. */
  const started = useRef(false);
  const [retryKey, setRetryKey] = useState(0);

  const paymentKey = params.get("paymentKey");
  const orderId = params.get("orderId");
  const amount = params.get("amount");

  /**
   * 파라미터가 없는 것은 **렌더에서 알 수 있는 사실**이지 이펙트가 알아내야 하는
   * 상태가 아니다. 이펙트에서 `setState` 로 만들면 불필요한 재렌더가 한 번 더 돌고,
   * React 19 의 `set-state-in-effect` 규칙이 그것을 막는다.
   */
  const paramsMissing = !paymentKey || !orderId || !amount;

  useEffect(() => {
    if (paramsMissing) return;
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    bff
      .post<Confirmed>("/api/saju/payments/confirm", {
        payment_key: paymentKey,
        order_id: orderId,
        amount: Number(amount),
      })
      .then((data) => {
        if (cancelled) return;
        if (!data?.access_token) throw new Error("빈 응답");
        // `ready` 를 보지 않고 언제나 이동한다. 리포트가 아직 없어도 그 화면이
        // 기다려 주므로, 여기서 붙잡아 두면 같은 기다림을 두 곳에 만드는 셈이다.
        //
        // `replace` — 뒤로가기로 이 화면에 돌아와 승인을 다시 시도하지 않게 한다.
        router.replace(`/saju/reports/${data.access_token}`);
      })
      .catch((err) => {
        if (cancelled) return;
        const isApi = err instanceof ApiError;
        setError({
          message: isApi
            ? err.message
            : "결제 확인이 지연되고 있습니다. 다시 시도해 주세요.",
          // 서버가 이 상태에 409 를 쓴다. 문구가 아니라 상태코드로 가른다.
          needsAttention: isApi && err.status === 409,
        });
        // 재시도를 허용한다 — 서버가 멱등이라 두 번 긁히지 않는다.
        started.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [paramsMissing, paymentKey, orderId, amount, router, retryKey]);

  // 파라미터가 없으면 승인할 것이 없다. 이펙트를 기다리지 않고 바로 말한다.
  const shown =
    error ??
    (paramsMissing
      ? { message: "결제 정보가 올바르지 않습니다.", needsAttention: false }
      : null);

  if (shown) {
    return (
      <div className="mx-auto max-w-md">
        <div role="alert" className="rounded-card bg-surface p-6 shadow-card sm:p-8">
          <Shaman
            expression={shown.needsAttention ? "concern" : "sad"}
            className="mx-auto mb-4 w-[150px] rounded-[16px] shadow-card-sm"
          />
          <p className="font-mono-kr text-xs tracking-[0.12em] text-wuxing-fire">
            {shown.needsAttention ? "확인 중" : "결제 확인 실패"}
          </p>
          <h1 className="mt-2 mb-3 font-display text-xl text-ink">
            {shown.needsAttention ? "담당자가 확인하고 있습니다" : "결제를 확인하지 못했습니다"}
          </h1>
          <p className="text-[14px] leading-relaxed text-ink-body">{shown.message}</p>

          {/* 연락할 곳. `needsAttention` 일 때만 준다 — 그때가 사람의 손이 필요한
              유일한 경우이고, 나머지(카드 거절 등)는 다시 시도하면 된다. */}
          {shown.needsAttention && SUPPORT_EMAIL && (
            <p className="mt-3 text-[13.5px] leading-relaxed text-ink-body">
              문의사항이 있으시면{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-gold-text underline underline-offset-2 hover:text-gold-text-strong"
              >
                {SUPPORT_EMAIL}
              </a>
              로 언제든 연락해 주세요.
            </p>
          )}

          {!shown.needsAttention && !paramsMissing && (
            <button
              type="button"
              onClick={() => setRetryKey((k) => k + 1)}
              className="mt-5 w-full rounded-pill bg-button-gradient px-6 py-3 text-[14px] font-bold text-on-primary shadow-cta"
            >
              다시 확인하기
            </button>
          )}

          <Link
            href="/saju"
            className="mt-3 block text-center text-[13px] text-muted-2 underline underline-offset-2 hover:text-gold-text-strong"
          >
            사주 입력으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-card bg-surface p-6 text-center shadow-card sm:p-8">
        <div className="flex justify-center">
          <ShamanDance width={120} />
        </div>
        <p className="mt-4 font-mono-kr text-xs tracking-[0.12em] text-gold-text">CONFIRMING</p>
        <h1 className="mt-2 font-display text-xl text-ink">결제를 확인하고 있네</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-body" role="status" aria-live="polite">
          확인이 끝나면 바로 풀이를 들려드리겠네. 이 창을 닫지 말고 잠시만 기다리시게.
        </p>
      </div>
    </div>
  );
}
