"use client";

import * as amplitude from "@amplitude/unified";
import { AMPLITUDE_API_KEY } from "@/lib/config/public";
import type { EventPropertyValue } from "./events";

/**
 * 유저 속성에 넣을 수 있는 값.
 *
 * 이벤트 속성과 달리 `null` 이 없다 — "해당 없음" 을 **영구히** 남길 이유가 없고,
 * SDK 의 `Identify` 도 받지 않는다. 대신 배열이 있다: `preInsert` 가 집합을 만든다.
 */
type UserPropertyValue = string | number | boolean | string[] | number[];

/**
 * 이벤트를 **실제로 내보내는** 단 한 자리.
 *
 * `AmplitudeProvider` 가 SDK 를 초기화하는 유일한 자리인 것과 짝이다. 초기화와
 * 전송을 나눈 이유는 테스트다 — 이름·속성 조립(`./events.ts`)과 상속
 * 컨텍스트(`features/saju/model/analytics-context.ts`)는 SDK 를 모르는 순수
 * 모듈이라 `node --test` 가 그대로 돌리고, SDK 를 아는 것은 이 얇은 파일뿐이다.
 *
 * ## 키가 없으면 아무것도 하지 않는다
 *
 * 키가 없으면 `initAll` 이 돌지 않는다. 그 상태로 `track` 을 부르면 SDK 가 이벤트를
 * 큐에 쌓아 두고 영영 비우지 않는다 — 로컬 개발에서 조용히 메모리를 먹는다.
 *
 * ## 던지지 않는다
 *
 * 분석은 사용자가 요청한 일이 아니다. 여기서 예외가 새어 나가면 결제 성공 화면이
 * 계측 실패로 깨질 수 있는데, 그건 사용자가 할 수 있는 일이 아무것도 없는 오류다.
 * `api/visit` 라우트가 통계 실패를 삼키는 것과 같은 규약이다.
 */
export function trackEvent(
  name: string,
  payload: Record<string, EventPropertyValue>,
): void {
  if (!AMPLITUDE_API_KEY) return;
  try {
    amplitude.track(name, payload);
  } catch {
    // 위 주석의 이유로 삼킨다.
  }
}

/**
 * 매출을 **Amplitude 가 매출로 아는 방식**으로 기록한다.
 *
 * 일반 이벤트에 `revenue: 1000` 을 실어도 그것은 그냥 숫자 속성이다 — LTV·ROAS·
 * 매출 차트는 `Revenue` 객체로 들어온 것만 센다. 그래서 `saju_payment_confirmed`
 * 와 **함께** 부른다: 퍼널은 이벤트가, 금액은 이것이 담당한다.
 *
 * 이중 집계가 되지 않는다. 매출 차트는 `$revenue` 만 보고, 확정 이벤트의
 * `price_krw` 는 세그먼트용 속성일 뿐이다.
 */
export function trackRevenue(input: {
  productId: string;
  price: number;
  quantity?: number;
}): void {
  if (!AMPLITUDE_API_KEY) return;
  try {
    const revenue = new amplitude.Revenue()
      .setProductId(input.productId)
      .setPrice(input.price)
      .setQuantity(input.quantity ?? 1);
    amplitude.revenue(revenue);
  } catch {
    // 위 `trackEvent` 와 같은 이유로 삼킨다.
  }
}

/**
 * 유저 속성 갱신. **연산자를 골라서** 쓴다.
 *
 * 어떤 값을 어느 연산으로 넣는지가 곧 그 값의 의미다
 * (`docs/analytics/saju-user-properties.csv` 의 Value Type 열).
 *
 *   - `setOnce` — 첫 값만 지킨다. 최초 진입·최초 결제처럼 **불변인 사실**
 *   - `set` — 덮는다. 최근 결제일·결제자 여부처럼 **현재 상태**
 *   - `add` — 더한다. 조회 수·누적 매출처럼 **누적**
 *   - `preInsert` — 배열에 중복 없이 넣는다. 경험한 등급의 **집합**
 *
 * 누적을 `set` 으로 넣으면 화면이 세던 숫자를 덮어써서 조용히 틀려진다 —
 * 여러 탭에서 동시에 쓰면 특히 그렇다. 연산자를 서버(Amplitude)에 맡기는 것이
 * 이 API 를 쓰는 이유다.
 */
export function identifyUser(operations: {
  setOnce?: Record<string, UserPropertyValue>;
  set?: Record<string, UserPropertyValue>;
  add?: Record<string, number>;
  preInsert?: Record<string, UserPropertyValue>;
}): void {
  if (!AMPLITUDE_API_KEY) return;
  try {
    const identify = new amplitude.Identify();
    for (const [key, value] of Object.entries(operations.setOnce ?? {})) {
      identify.setOnce(key, value);
    }
    for (const [key, value] of Object.entries(operations.set ?? {})) {
      identify.set(key, value);
    }
    for (const [key, value] of Object.entries(operations.add ?? {})) {
      identify.add(key, value);
    }
    for (const [key, value] of Object.entries(operations.preInsert ?? {})) {
      identify.preInsert(key, value);
    }
    amplitude.identify(identify);
  } catch {
    // 위 `trackEvent` 와 같은 이유로 삼킨다.
  }
}
