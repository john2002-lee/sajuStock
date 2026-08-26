"use client";

import { useSyncExternalStore } from "react";
import type { BirthInput, SajuReading } from "./types";

/**
 * 입력 화면 → 티저 → 리포트로 사주 결과를 넘기는 클라이언트 저장소.
 *
 * ## 왜 서버가 아니라 sessionStorage 인가
 *
 * 이 제품은 **사주를 저장하지 않는다**(백엔드 `endpoints/saju.py` 모듈 주석).
 * 주문도 토큰도 없으므로 "그 결과를 다시 달라"고 할 주소 자체가 없다. 그래서
 * 방금 계산한 결과가 클라이언트 이동과 **함께 움직여야** 한다.
 *
 * 쿼리스트링이 아니라 sessionStorage 인 이유: 생년월일시가 URL·브라우저 기록·
 * 리퍼러에 남지 않는다. 민감정보를 주소창에 싣지 않는 것이 이 선택의 전부다.
 *
 * ## 없을 때
 *
 * 시크릿 모드에서 저장이 막혔거나, 다른 탭이거나, 북마크로 바로 들어왔으면
 * `load` 가 `null` 을 돌려주고 화면은 "다시 입력하기" 로 떨어진다. 재조회 주소가
 * 없는 설계의 **내재적 한계**이지 덮어야 할 버그가 아니다.
 *
 * ## 키가 하나인 이유
 *
 * 원본은 주문 id 별로 키를 나눴다. 여기서는 id 가 없고, 한 탭에서 동시에 두 사주를
 * 보는 흐름도 없다 — 새로 입력하면 앞의 것을 덮는 것이 맞다.
 */

const KEY = "sajustock:reading";

/** 티저·리포트 화면이 함께 필요로 하는 한 벌. */
export interface StoredReading {
  /** 리포트와 추가 질문이 서버에 다시 보내야 하는 원본 입력. */
  birth: BirthInput;
  reading: SajuReading;
}

export function saveReading(value: StoredReading): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // 저장소를 못 쓰는 환경(시크릿 모드·용량 초과)이다. 다음 화면의
    // "다시 입력하기" 폴백이 그 결과를 받는다.
  }
}

export function loadReading(): StoredReading | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredReading;
  } catch {
    return null;
  }
}

export function clearReading(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // 지우지 못해도 다음 저장이 덮는다.
  }
}

/**
 * `useSyncExternalStore` 용 스냅샷 캐시.
 *
 * 그 훅은 스냅샷이 **참조로 안정**하기를 요구한다 — 호출마다 새 객체를 만들면
 * React 가 매번 바뀐 것으로 보고 무한히 다시 렌더한다. 원문 문자열이 그대로면
 * 파싱한 객체를 재사용하는 이유가 그것이다.
 */
let snapshotCache: { raw: string | null; parsed: StoredReading | null } = {
  raw: null,
  parsed: null,
};

function getSnapshot(): StoredReading | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== snapshotCache.raw) {
    let parsed: StoredReading | null = null;
    try {
      parsed = raw ? (JSON.parse(raw) as StoredReading) : null;
    } catch {
      parsed = null;
    }
    snapshotCache = { raw, parsed };
  }
  return snapshotCache.parsed;
}

/**
 * 서버에는 sessionStorage 가 없다. `undefined` 는 "아직 모른다" 는 뜻이고,
 * 화면은 그동안 아무것도 그리지 않는다.
 *
 * `null`(= 저장된 것이 없다)과 **구분하는 것이 핵심**이다. 서버 스냅샷을 `null` 로
 * 두면 첫 페인트에 "다시 입력하기" 가 한 번 번쩍인 뒤 결과로 바뀐다.
 */
function getServerSnapshot(): StoredReading | null | undefined {
  return undefined;
}

/** 구독할 것이 없다 — 이 값은 앞 화면에서 한 번 쓰이고 그 뒤로 바뀌지 않는다. */
function subscribe(): () => void {
  return () => {};
}

/**
 * 저장된 사주를 읽는 훅.
 *
 * `useEffect` + `setState` 대신 이것을 쓰는 이유가 둘이다.
 *
 * 1. **외부 저장소를 읽는 일에 맞는 도구다.** React 19 의
 *    `react-hooks/set-state-in-effect` 규칙이 이펙트 본문의 동기 `setState` 를
 *    막는데, 그 규칙이 가리키는 올바른 대안이 `useSyncExternalStore` 다.
 * 2. **하이드레이션이 어긋나지 않는다.** 서버와 첫 클라이언트 렌더가 모두
 *    `getServerSnapshot`(= `undefined`)을 쓰고, 하이드레이션이 끝난 뒤에야 실제
 *    값으로 다시 렌더된다.
 *
 * 반환값 셋을 구분해서 쓸 것: `undefined` 아직 모름 · `null` 없음 · 객체 있음.
 */
export function useStoredReading(): StoredReading | null | undefined {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
