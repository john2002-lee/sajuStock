"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/shared/components/feedback";
import { Footer } from "@/shared/components/layout/Footer";

/**
 * 루트 오류 경계 — **서비스를 모르는 화면**이다.
 *
 * 예전에는 이 자리에 시장 현황 오류("시장 현황을 불러오지 못했습니다 · 지수·등락
 * 상위 조회 중…")가 있었다. 루트 `error.tsx` 는 더 가까운 경계가 없는 **모든**
 * 라우트의 오류를 받으므로, 사주 온보딩이 터져도 "지수 조회 실패" 라고 말했다.
 * 그 문구는 제 자리를 찾아갔다 —
 * [`(stock)/stock/error.tsx`](<./(stock)/stock/error.tsx>).
 *
 * **푸터를 직접 든다.** 오류 경계는 페이지뿐 아니라 그 아래 레이아웃까지 대체하므로
 * 서비스 레이아웃(`(stock)` · `(saju)`)이 붙이던 푸터가 함께 사라진다. 어느
 * 서비스에서 터졌는지 여기서는 알 수 없어 양쪽 고지를 짧게 드는 `both` 를 쓴다.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <main className="mx-auto w-full max-w-shell px-4 pb-[30px] pt-[26px] md:px-8">
        <ErrorScreen
          scope="route"
          title="화면을 불러오지 못했습니다"
          description="요청을 처리하는 중 문제가 발생했습니다. 다시 시도하거나, 아래에서 다른 화면으로 이동할 수 있습니다."
          digest={error.digest}
          onRetry={reset}
          note="unhandled_render_error · app/error.tsx"
        />
      </main>

      <Footer service="both" />
    </>
  );
}
