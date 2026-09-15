"use client";

import { useEffect } from "react";

/**
 * 접속 1회를 우리 DB 에 남긴다 — 관리자 화면의 접속 통계가 이 값을 센다.
 *
 * ## Amplitude 가 있는데 왜 또 세는가
 *
 * 옆의 `AmplitudeProvider` 도 페이지뷰를 보내지만 그 값은 **우리 DB 에 남지 않는다.**
 * 관리자 화면에서 조회할 수 없고, `users` 와 조인해 "이 회원이 마지막으로 언제
 * 왔는지" 를 말할 수도 없다 — 그쪽 식별자는 디바이스 id 다. 둘은 다른 질문에 답한다.
 *
 * ## 서버가 아니라 클라이언트에서 부르는 이유
 *
 * 루트 레이아웃은 서버 컴포넌트라 거기서 백엔드를 부를 수도 있다. 그러면
 * **모든 페이지 렌더에 왕복이 하나 붙는다.** 비콘은 렌더를 막지 않는다. 대가는
 * JS 가 꺼진 방문이 빠지는 것이고, 이 앱은 이미 Amplitude 클라이언트 SDK 에
 * 같은 전제를 두고 있다.
 *
 * ## 탭당 1회만 시도한다 — 그러나 정확성은 여기 걸려 있지 않다
 *
 * 백엔드가 `(소유자, 날짜)` 로 upsert 하므로 **몇 번 불려도 결과가 같다.** 이
 * `sessionStorage` 플래그는 요청을 아끼기 위한 것일 뿐이고, 플래그가 날아가거나
 * 여러 탭이 각자 보내도 숫자가 틀어지지 않는다.
 *
 * `sessionStorage` 를 쓰는 것은 탭을 닫으면 지워지기 때문이다. `localStorage` 로
 * 두면 "하루 1회" 를 클라이언트가 판단해야 하는데, 그 판단은 KST 자정 기준이어야
 * 하고 이미 서버가 하고 있다 (`domain/visits.korean_date`). 두 곳에서 날짜를
 * 판단하면 어긋난다.
 *
 * ## 실패를 삼킨다
 *
 * 통계가 화면을 죽이면 안 된다. BFF 도 같은 이유로 언제나 204 를 준다
 * (`app/api/visit/route.ts`). 기록은 다음 방문에 다시 시도된다.
 */

const ONCE_PER_TAB = "ledger.visit-sent";

export function VisitBeacon() {
  useEffect(() => {
    // `sessionStorage` 접근 자체가 던지는 환경이 있다 (프라이버시 모드·차단 설정).
    // 읽기에 실패하면 "안 보냈다" 로 보고 그냥 보낸다 — upsert 라 무해하다.
    let alreadySent = false;
    try {
      alreadySent = sessionStorage.getItem(ONCE_PER_TAB) === "1";
    } catch {
      alreadySent = false;
    }
    if (alreadySent) return;

    // `keepalive` 를 붙이는 이유: 사용자가 곧바로 다른 곳으로 이동하면 일반 fetch 는
    // 문서와 함께 취소된다. 첫 방문이 가장 놓치기 쉬운 방문인데 그것을 잃는다.
    void fetch("/api/visit", { method: "POST", keepalive: true })
      .then(() => {
        try {
          sessionStorage.setItem(ONCE_PER_TAB, "1");
        } catch {
          // 저장에 실패하면 다음 렌더에 한 번 더 보낸다. upsert 라 무해하다.
        }
      })
      .catch(() => {
        // 오프라인·차단. 다음 방문에 다시 시도한다.
      });
  }, []);

  return null;
}
