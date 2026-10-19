import { Suspense } from "react";
import { TalismanPaySuccess } from "@/features/talisman";
import type { Metadata } from "next";

/**
 * `/talisman/pay/success` — 토스가 부적 결제를 마치고 돌려보내는 자리. 이 화면이
 * 승인을 불러야 결제가 확정된다. `useSearchParams` 때문에 `<Suspense>` 로 감싼다.
 */

export const metadata: Metadata = {
  title: "결제 확인",
  robots: { index: false, follow: false },
};

export default function TalismanPaySuccessPage() {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-10 sm:px-6 sm:py-14">
      <Suspense fallback={null}>
        <TalismanPaySuccess />
      </Suspense>
    </main>
  );
}
