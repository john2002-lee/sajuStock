import Link from "next/link";
import { Suspense } from "react";
import { PayFailNotice } from "@/features/saju";
import type { Metadata } from "next";

/**
 * `/saju/pay/fail` — 토스가 결제 실패로 돌려보내는 자리.
 *
 * **아무것도 승인하지 않는다.** 결제가 이루어지지 않았으므로 서버를 부를 이유가 없고,
 * 주문은 `pending` 으로 남았다가 보관 기간에 함께 정리된다.
 */

export const metadata: Metadata = {
  title: "결제 실패",
  robots: { index: false, follow: false },
};

export default function SajuPayFailPage() {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-10 sm:px-6 sm:py-14">
      <div className="rounded-card bg-surface p-6 shadow-card sm:p-8">
        <p className="font-mono-kr text-xs tracking-[0.12em] text-wuxing-fire">결제 실패</p>
        <h1 className="mt-2 mb-3 font-display text-xl text-ink">결제가 완료되지 않았습니다</h1>
        <Suspense fallback={null}>
          <PayFailNotice />
        </Suspense>
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-body">
          결제된 금액은 없습니다. 다시 시도하시거나, 다른 결제 수단(계좌이체)을 골라
          보셔도 좋습니다.
        </p>
        <Link
          href="/saju/teaser"
          className="mt-6 block rounded-pill bg-button-gradient px-6 py-3 text-center text-[14px] font-bold text-on-primary shadow-cta"
        >
          다시 시도하기
        </Link>
        <Link
          href="/saju"
          className="mt-3 block text-center text-[13px] text-muted-2 underline underline-offset-2 hover:text-gold-text-strong"
        >
          처음부터 다시 입력
        </Link>
      </div>
    </main>
  );
}
