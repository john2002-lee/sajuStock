"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/shared/components/feedback";

export default function MarketHomeError({
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
    <main className="mx-auto w-full max-w-shell px-4 pb-[30px] pt-[26px] md:px-8">
      <ErrorScreen
        scope="market home"
        title="시장 현황을 불러오지 못했습니다"
        description="지수·등락 상위 조회 중 문제가 발생했습니다. 장 시작 직후에는 데이터가 아직 준비되지 않았을 수 있습니다."
        digest={error.digest}
        onRetry={reset}
        note="fetch_market_overview_from_yfinance"
      />
    </main>
  );
}
