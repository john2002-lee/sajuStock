"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/shared/components/feedback";

/**
 * **상세 칸의 오류 경계다.**
 *
 * 이 파일은 `layout.tsx` 의 자식을 감싼다 — 레이아웃(제호·목록)은 이 경계 밖이라
 * 오류가 나도 그대로 서 있다. 그래서 여기서 `<main>` 을 다시 열면 안 되고(레이아웃의
 * main 안에 main 이 중첩된다), 문구도 "관심 종목을 불러오지 못했습니다" 가 아니라
 * **그 종목**에 대한 것이어야 한다. nav 는 멀쩡히 보이는데 목록을 못 읽었다고 말하면
 * 사용자는 화면과 문장 중 어느 쪽을 믿어야 할지 알 수 없다.
 *
 * nav 조회 자체는 여기로 오지 않는다 — `getWatchlist` 는 실패를 빈 목록으로 삼킨다.
 */
export default function DashboardDetailError({
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
    <ErrorScreen
      scope="watchlist"
      title="종목 상세를 불러오지 못했습니다"
      description="왼쪽 nav 에서 다른 종목을 고르거나, 잠시 뒤 다시 시도해 주세요. 관심 종목과 알림 설정은 그대로입니다."
      digest={error.digest}
      onRetry={reset}
    />
  );
}
