"use client";

import { useRouter } from "next/navigation";
import { ErrorScreen } from "@/shared/components/feedback";

/**
 * 백엔드에 닿지 못한 경우 — 서버가 꺼져 있거나 `STOCK_API_BASE_URL` 이 틀렸다.
 *
 * 타임아웃(StockDetailUnavailable)과 나눠 둔 이유: 저쪽은 요청이 상류까지 갔고
 * 백그라운드에서 캐시가 채워지므로 "잠시 뒤 다시"가 맞는 안내다. 여기는 요청이
 * 아예 나가지 못했으므로 몇 번을 눌러도 같다 — 할 일은 백엔드를 켜는 것이다.
 *
 * 개발 중 가장 자주 만나는 실패라서 원인과 조치를 화면에 직접 적는다.
 */
export function BackendUnreachable({ baseUrl }: { baseUrl: string }) {
  const router = useRouter();

  return (
    <ErrorScreen
      scope="backend offline"
      title="백엔드에 연결하지 못했습니다"
      description={`${baseUrl} 로 요청이 닿지 않았습니다. 백엔드가 실행 중인지, 포트가 맞는지 확인해주세요.`}
      onRetry={() => router.refresh()}
      note="cd back && uv run fastapi dev  ·  포트가 다르면 front/.env.local 의 STOCK_API_BASE_URL"
    />
  );
}
