"use client";

import { useEffect, useRef, useState } from "react";

export interface CountUpProps {
  /** 도착값. 바뀌면 그 자리에서 다시 센다 */
  value: number;
  durationMs?: number;
  /** 숫자 앞뒤 (예: `suffix="%"`) */
  suffix?: string;
}

/**
 * 0 에서 값까지 세어 올라가는 숫자.
 *
 * ## 왜 필요한가
 *
 * AI 판단의 신뢰도는 스트림이 **끝나는 순간** 나타난다. 그냥 찍히면 다른 텍스트와
 * 같은 무게로 읽히는데, 이 숫자는 그 화면에서 가장 중요한 값 둘 중 하나다
 * (나머지 하나가 판정 그 자체다). 세어 올라가는 동안 시선이 거기 머문다.
 *
 * ## `prefers-reduced-motion` 을 **직접** 본다
 *
 * `globals.css` 의 전역 규칙은 CSS 애니메이션만 죽인다. 이건 JS 로 상태를 바꾸는
 * 것이라 그 그물에 걸리지 않는다 — 여기서 직접 확인하고, 줄이기를 원하는 사용자
 * 에게는 **처음부터 도착값을 그린다.**
 *
 * ## 마운트 시점에 setState 하지 않는다
 *
 * 초기값이 곧 도착값이다. 애니메이션은 `requestAnimationFrame` 콜백 안에서만
 * 상태를 바꾼다 — 이펙트 본문에서 바로 `setState` 하면 `react-hooks/
 * set-state-in-effect` 에 걸리고(이 저장소가 `RecentStocks` 에서 이미 겪었다),
 * 무엇보다 서버가 그린 값과 첫 프레임이 어긋난다.
 */
export function CountUp({ value, durationMs = 700, suffix = "" }: CountUpProps) {
  const [shown, setShown] = useState(value);
  const frame = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let start: number | null = null;

    const step = (now: number) => {
      if (start === null) start = now;
      const progress = Math.min(1, (now - start) / durationMs);
      // easeOutCubic — 빠르게 올라가다 끝에서 붙는다. 끝이 뭉개지지 않아야
      // 도착값이 정확히 읽힌다.
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(value * eased));
      if (progress < 1) frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [value, durationMs]);

  return (
    <>
      {shown}
      {suffix}
    </>
  );
}
