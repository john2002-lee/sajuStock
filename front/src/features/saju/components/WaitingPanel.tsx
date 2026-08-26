"use client";

import { useEffect, useState } from "react";
import { ShamanDance } from "./ShamanDance";

/**
 * 오래 걸리는 생성을 기다리는 동안의 화면.
 *
 * ## 왜 이것이 별도 컴포넌트인가 — "멈춘 것 같다" 의 절반은 여기였다
 *
 * 리포트 생성은 36초다. 예전 화면은 그 36초 동안 무당춤 하나와 **바뀌지 않는 문장
 * 한 줄**이었다. 사람은 30초 넘게 변하지 않는 화면을 기다림으로 읽지 않는다 —
 * 고장으로 읽는다. 요청이 실제로 끊기던 문제를 고쳐도 이 인상은 그대로 남는다.
 *
 * 그래서 두 가지를 준다:
 *
 *  1. **경과 초** — 화면이 살아 있다는 가장 값싸고 확실한 증거다. 1초마다 눈에 보이게
 *     바뀐다.
 *  2. **단계 문장** — 무당이 지금 무엇을 하고 있는지가 몇 번 바뀐다. 진행이 실제로
 *     어디까지 갔는지는 서버가 알려 주지 않으므로 **진행률 막대는 쓰지 않는다.**
 *     퍼센트를 그리면 아는 척하는 거짓말이 되고, 90%에서 멈춘 막대는 아무것도 없는
 *     것보다 나쁘다. 대신 시간에 따라 말이 바뀌는 것은 거짓이 아니다 — 실제로 그
 *     순서로 일어난다.
 *
 * ## 스스로 시간을 센다
 *
 * 부모가 경과 시간을 내려 주지 않는다. 이 컴포넌트는 기다리는 동안만 붙어 있으므로
 * 마운트가 곧 시작이고 언마운트가 곧 끝이다 — 부모에 타이머 상태를 만들면 리포트가
 * 도착한 뒤에도 남는다.
 */

/**
 * 시간이 지나며 바뀌는 말. `after` 는 이 문장이 나타나는 시각(초)이다.
 *
 * 구간 길이는 실측 36초에 맞췄다 — 마지막 구간("말로 옮기는 중")에 도달할 때쯤
 * 리포트가 온다. 넘어가도 어색하지 않게 마지막 두 문장은 시간을 특정하지 않는다.
 */
const STAGES: ReadonlyArray<{ after: number; text: string }> = [
  { after: 0, text: "자네 사주를 펼쳐 보고 있네." },
  { after: 8, text: "여덟 글자의 기운이 어디로 치우쳤는지 헤아리는 중이네." },
  { after: 18, text: "대운의 흐름을 따라 읽고 있네." },
  { after: 30, text: "이제 말로 옮기는 중이네. 조금만 더 기다리시게." },
  { after: 50, text: "생각보다 손이 가는 사주구먼. 조금 더 걸리겠네." },
];

/** 이 시간을 넘기면 사용자가 할 수 있는 일을 알려 준다. */
const LONG_WAIT_SECONDS = 90;

function stageFor(seconds: number): string {
  let text = STAGES[0].text;
  for (const stage of STAGES) {
    if (seconds >= stage.after) text = stage.text;
  }
  return text;
}

export function WaitingPanel({
  kicker,
  title,
}: {
  /** 위쪽 영문 키커. 화면마다 다르다 (READING · CONFIRMING …). */
  kicker: string;
  title: string;
}) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-card bg-surface p-6 text-center shadow-card sm:p-8">
        <div className="flex justify-center">
          <ShamanDance width={120} />
        </div>

        <p className="mt-4 font-mono-kr text-xs tracking-[0.12em] text-gold-text">{kicker}</p>
        <h2 className="mt-2 font-display text-xl text-ink">{title}</h2>

        {/* 춤이 `prefers-reduced-motion` 에서 멈추므로(globals.css), 상태를 말로도
            알려 주는 이 문장이 실제 대체 수단이다. 단계가 바뀔 때만 읽히도록
            여기에만 live 영역을 둔다. */}
        <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-ink-body" role="status" aria-live="polite">
          {stageFor(seconds)}
        </p>

        {/* 경과 초. **스크린리더에서는 숨긴다** — 1초마다 읽어 주면 단계 문장을
            덮어 버려서, 눈으로 보는 사람에게만 필요한 신호다. */}
        <p aria-hidden className="mt-3 font-mono-kr text-[11px] tracking-[0.14em] text-muted-3">
          {seconds}초 경과
        </p>

        {seconds >= LONG_WAIT_SECONDS && (
          <p className="mt-4 border-t border-hairline pt-4 text-[12.5px] leading-relaxed text-muted-2">
            평소보다 오래 걸리고 있습니다. 이 창을 닫지 않으셨다면 계속 기다려 주세요 —
            준비되면 바로 나타납니다.
          </p>
        )}
      </div>
    </div>
  );
}
