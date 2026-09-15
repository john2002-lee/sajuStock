"use client";

import * as amplitude from "@amplitude/unified";
import { useEffect } from "react";
import { AMPLITUDE_API_KEY } from "@/lib/config/public";
import { redactProperties } from "./redact";

/**
 * 이벤트가 나가기 전에 URL 에서 자격 증명을 지운다.
 *
 * `enrichment` 단계는 전송 직전에 돌고, `null` 을 돌려주면 이벤트가 버려진다 —
 * 여기서는 지운 사본을 돌려주므로 분석은 그대로 살아 있다 (`./redact` 주석).
 */
const redactionPlugin: amplitude.Types.EnrichmentPlugin = {
  name: "saju-url-redaction",
  type: "enrichment",
  execute: async (event) => ({
    ...event,
    event_properties: redactProperties(event.event_properties),
    user_properties: redactProperties(event.user_properties),
  }),
};

/**
 * 리플레이에서 **모든 텍스트·입력을 가리는** 경로.
 *
 * 사주 화면은 생년월일시를 **입력받고**(리포트 프롬프트에 원본이 실리지 않는
 * 것과 별개로, 폼에는 사용자가 직접 친다), 결제는 카드 화면을 다룬다. 백엔드가 그 데이터를
 * `metadata_only` 로 막아 두었는데(`back/app/integrations/amplitude.py`) 화면
 * 녹화가 그것을 우회하면 결정이 무의미해진다.
 *
 * 주식 화면은 건드리지 않는다 — 리플레이의 진단 가치가 거기 있고, 공개 종목
 * 정보라 가릴 이유도 없다.
 */
const SENSITIVE_URL_PATTERNS = ["*/saju/*", "*/verdict/*"];

/**
 * Amplitude 초기화 — **이 앱에서 분석 SDK 를 초기화하는 유일한 자리다.**
 *
 * 이벤트를 내보내는 자리는 `./track.ts` 하나다. 둘을 나눈 이유는 테스트다 —
 * 이름·속성 조립(`./events.ts`)과 상속 컨텍스트를 SDK 없이 돌릴 수 있게 된다.
 *
 * ## 왜 컴포넌트인가
 *
 * 루트 레이아웃은 서버 컴포넌트(테마 쿠키를 읽는다)라 브라우저 SDK 를 직접 부를 수
 * 없다. `back/app/integrations/llm.py` 가 LLM SDK 의 유일한 import 경계인 것과 같은
 * 자세로, 분석 SDK 도 이 파일 하나만 안다 — 프로바이더를 바꾸거나 걷어낼 때
 * 고칠 곳이 한 군데다.
 *
 * ## 초기화는 앱 수명 동안 정확히 한 번
 *
 * `useEffect` 의 빈 의존성 배열이 그 약속이다. 모듈 최상단에서 부르면 개발 모드의
 * 빠른 새로고침(HMR)마다 다시 돌고, `QueryProvider` 가 `useState` 로 클라이언트를
 * 만드는 것과 같은 종류의 실수가 된다.
 *
 * 리액트 19 의 StrictMode 는 개발에서 effect 를 두 번 실행하지만, SDK 가 두 번째
 * `initAll` 을 무시하므로 세션이 갈라지지 않는다.
 *
 * ## 오토캡처를 3개만 켠다
 *
 * `autocapture: true` 는 6개(형태 상호작용·요소 클릭·파일 다운로드까지)를 전부
 * 켠다. 이 앱에서 그건 과하다 — 차트·표·드로어가 많아 요소 클릭 이벤트가 의미
 * 없는 양으로 쏟아지고, 로그인·가입 폼의 상호작용까지 자동으로 실려 나간다.
 *
 * 켜는 것: 페이지 조회 · 세션 시작/종료 · 마케팅 기여.
 * 끄는 것: 폼 상호작용 · 요소 클릭 · 파일 다운로드.
 *
 * 제품 행동은 명시 이벤트로 넣는다 — 택소노미가
 * `docs/analytics/saju-amplitude-taxonomy.md` 에 있고, 이름과 속성의 계약은
 * `./events.ts` 다. 자동 수집으로 대신하지 않는다.
 *
 * 사용자 속성은 오토캡처 항목이 아니다 — 필요해지면 `amplitude.identify()` 로
 * 명시해야 한다.
 */
export function AmplitudeProvider() {
  useEffect(() => {
    if (!AMPLITUDE_API_KEY) {
      console.warn("Amplitude API key missing — analytics disabled");
      return;
    }

    // `initAll` 은 **비동기다.** 기다리지 않고 `add()` 를 부르면 우리 플러그인이
    // SDK 내장 플러그인들보다 **먼저** 등록되고, 그러면 뒤에 등록된
    // `pageUrlEnrichment` 가 우리가 지운 URL 을 다시 써 넣는다. 실측으로 그렇게
    // 새는 것을 확인했다 (`[Amplitude] Previous Page Location` 에 리포트 토큰이
    // 그대로 실렸다). 마스킹이 마지막에 돌아야 한다.
    void (async () => {
      await amplitude.initAll(AMPLITUDE_API_KEY, {
        analytics: {
          // **없는 키는 꺼지지 않는다.** `isTrackingEnabled` 는 값이 명시적으로
          // `false` 일 때만 끄고 그 외에는 true 를 준다
          // (`analytics-browser/lib/esm/default-tracking.js`). 그래서 원하는 것만
          // 켜는 것으로는 부족하고, **원하지 않는 것을 하나씩 꺼야 한다.**
          //
          // 켠 것: 페이지 조회 · 세션 · 마케팅 기여 (요청받은 3종).
          autocapture: {
            pageViews: true,
            sessions: true,
            attribution: true,
            formInteractions: false,
            elementInteractions: false,
            fileDownloads: false,
            // 이것이 기본 ON 인 유일한 나머지다. `[Amplitude] Previous Page
            // Location` 을 붙이는데, 유료 리포트에서 다른 화면으로 넘어가면 그
            // 값이 **토큰이 든 직전 주소**다 — 우리가 막으려던 바로 그것이다.
            pageUrlEnrichment: false,
          },
        },
        sessionReplay: {
          sampleRate: 1,
          privacyConfig: {
            // 사주·결제 경로에서만 모든 텍스트를 가린다. `conservative` 가 가장
            // 강한 단계다 (light / medium / conservative).
            urlMaskLevels: SENSITIVE_URL_PATTERNS.map((match) => ({
              match,
              maskLevel: "conservative" as const,
            })),
          },
        },
      });

      // 초기화가 끝난 **뒤에** 붙여야 마지막 단계가 된다 (위 주석).
      amplitude.add(redactionPlugin);
    })();
  }, []);

  return null;
}
