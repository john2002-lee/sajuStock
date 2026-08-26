"use client";

import { useRouter } from "next/navigation";
import { ErrorScreen } from "@/shared/components/feedback";

/**
 * 상류(yfinance/백엔드)가 제한 시간 안에 응답하지 않은 경우.
 *
 * 예외를 던져 error.tsx 로 보내지 않는 이유: 타임아웃이 나도 백그라운드 요청은
 * 계속 진행돼 Data Cache 를 채운다. 그래서 잠시 뒤 다시 시도하면 대개 즉시 뜬다 —
 * 새 UI 를 만들지 않고 기존 ErrorScreen 을 그대로 쓰되 문구만 상황에 맞췄다.
 */
export function StockDetailUnavailable({ symbol }: { symbol: string }) {
  const router = useRouter();

  return (
    <ErrorScreen
      scope="stock detail"
      title="시세를 아직 불러오지 못했습니다"
      description={`${symbol} 조회가 제한 시간을 넘겼습니다. 데이터는 백그라운드에서 계속 받고 있으니 잠시 뒤 다시 시도하면 바로 표시됩니다.`}
      onRetry={() => router.refresh()}
      note="fetch_stock_history_from_yfinance"
    />
  );
}
