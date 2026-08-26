import { Suspense } from "react";
import { PaySuccessScreen } from "@/features/saju";
import type { Metadata } from "next";

/**
 * `/saju/pay/success` — 토스가 결제를 마치고 돌려보내는 자리.
 *
 * **여기가 결제의 진짜 끝이다.** 이 화면이 승인(confirm)을 호출해야 결제가 확정되며,
 * 부르지 않으면 일정 시간 뒤 자동 취소된다.
 *
 * `useSearchParams` 를 쓰는 클라이언트 컴포넌트라 `<Suspense>` 로 감싼다 —
 * Next 16 은 그러지 않으면 빌드에서 막는다.
 */

export const metadata: Metadata = {
  title: "결제 확인",
  robots: { index: false, follow: false },
};

export default function SajuPaySuccessPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
      <Suspense fallback={null}>
        <PaySuccessScreen />
      </Suspense>
    </main>
  );
}
