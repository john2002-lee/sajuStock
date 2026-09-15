"use client";

import {
  buildPayload,
  type EventProperties,
  type SajuEventName,
} from "@/shared/analytics/events";
import { trackEvent } from "@/shared/analytics/track";
import { readContext } from "./analytics-context";

/**
 * 사주 화면이 이벤트를 보내는 **유일한 함수**.
 *
 * 호출부는 `amplitude.track` 도, 상속 컨텍스트도 모른다 — 그 순간에 관측한 것만
 * 넘기면 된다. 컨텍스트를 화면마다 props 로 나르면 컴포넌트 경계를 넘을 때마다
 * 하나씩 빠지고, 그러면 퍼널 차트의 Holding Constant 가 조용히 빈 값을 센다.
 *
 * ```ts
 * trackSaju(SAJU_EVENT.teaserViewed, { price_krw: 1000, retention_days: 30 });
 * ```
 *
 * 이름을 문자열로 직접 쓰지 말 것. `SAJU_EVENT` 상수만 쓴다 — 오타는 빌드를 깨지
 * 않고 화면도 멀쩡한 채로 Amplitude 에 이벤트를 하나 더 만든다.
 */
export function trackSaju(
  name: SajuEventName,
  properties: EventProperties = {},
): void {
  trackEvent(name, buildPayload(properties, readContext()));
}
