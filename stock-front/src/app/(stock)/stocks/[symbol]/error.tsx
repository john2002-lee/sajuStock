"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/shared/components/feedback";

export default function StockDetailError({
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
        scope="stock detail"
        title="종목 정보를 불러오지 못했습니다"
        description="주가·뉴스 조회 중 문제가 발생했습니다. yfinance 응답이 늦거나 일시적으로 실패했을 수 있습니다."
        digest={error.digest}
        onRetry={reset}
        note="fetch_stock_history_from_yfinance · fetch_stock_news · fetch_analyst_reports"
      />
    </main>
  );
}
