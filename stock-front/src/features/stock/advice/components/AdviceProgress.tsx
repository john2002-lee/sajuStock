"use client";

import { useEffect, useState } from "react";
import { ADVICE_WARN_RATIO } from "../model/cache";
import { ADVICE_STAGE_LABELS, type AdviceStage } from "../model/types";

/**
 * `stage` 는 '끝난 단계 수'다. 라벨은 '지금 하고 있는 단계'를 말해야 한다 —
 * 그래서 stage 가 아니라 stage+1 을 읽는다.
 *
 * 전에는 ADVICE_STAGE_LABELS[stage] 를 그대로 썼다. 그 결과
 * (a) 스펙에 없는 '분석 준비 중 · 0/4 단계' 가 뜨고,
 * (b) stage 가 4 가 되는 순간 running 이 false 라 '최종 판단 종합' 라벨이
 *     한 번도 렌더되지 않았다. README '진행 표시(필수)' 의 4단계 중 하나가
 *     사용자에게 영영 안 보이던 셈이다.
 */
function stageLabel(stage: AdviceStage, running: boolean, stopped: boolean): string {
  // 멈춘 뒤에도 단계 라벨을 그대로 두면 0% 진행 바가 "주가 데이터 조회 중" 이라고
  // 거짓말한다. 멈춤은 진행의 한 상태가 아니라 진행의 끝이다.
  if (stopped) return "분석 멈춤";
  if (stage >= 4 && !running) return "분석 완료 · 4/4 단계";
  const current = Math.min(stage + 1, 4) as Exclude<AdviceStage, 0>;
  return `${ADVICE_STAGE_LABELS[current]} · ${current}/4 단계`;
}

export function AdviceProgress({
  stage,
  running,
  startedAt = null,
  stopped = false,
  budgetMs = null,
}: {
  stage: AdviceStage;
  running: boolean;
  /** 이번 실행의 시작 시각(ms). null 이면 경과를 그리지 않는다 */
  startedAt?: number | null;
  stopped?: boolean;
  /**
   * 서버가 알려 준 이번 실행의 예산(ms). **null 이면 예고하지 않는다** —
   * 서버가 얼마를 줬는지 모르면서 "N초가 지나면" 이라고 말할 수는 없다.
   */
  budgetMs?: number | null;
}) {
  const percent = (stage / 4) * 100;

  /**
   * 경과 시간(ms).
   *
   * **렌더 중에 `Date.now()` 를 읽지 않는다.** `?ai=1` 로 들어오면 이 드로어가
   * 서버 HTML 에 포함되므로, 렌더 시각을 읽으면 서버와 클라이언트 값이 어긋나
   * 하이드레이션 경고가 난다. 그래서 첫 값도 effect 안에서 채운다.
   *
   * 틱이 이 컴포넌트에 있는 것도 의도다. 훅(`useAiAdvice`)에 두면 매초
   * 드로어 전체가 다시 그려지고, 거기에는 에이전트 카드 3장과 렌더마다 시각을
   * 읽는 `FinalDecision` 이 들어 있다.
   */
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    if (startedAt === null || !running) return;
    // 첫 값도 타이머로 넣는다. effect 본문에서 곧바로 setState 하면 린트
    // 규칙(react-hooks/set-state-in-effect)에 걸리고, 실제로도 렌더 직후
    // 한 번 더 그리는 일이라 굳이 동기일 이유가 없다.
    const tick = () => setElapsed(Date.now() - startedAt);
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [startedAt, running]);

  // 끝난 뒤에도 마지막 값을 지우지 않는다. "분석 완료 · 23초" 는 이 판단이 얼마나
  // 걸렸는지를 말해 주고, "분석 멈춤 · 17초" 는 무엇을 멈췄는지를 말해 준다.
  // 드로어를 닫으면 이 컴포넌트가 언마운트되므로 다음 실행에 새지 않는다.

  // 예산의 70% 를 넘기면 마무리를 **예고한다.** 예고가 있어야 착지가 사고가
  // 아니라 설계로 읽힌다 — 없으면 예산이 끝나는 순간의 '규칙 기반 판단' 이
  // 그냥 고장으로 보인다.
  //
  // **`running` 을 함께 본다.** 경과 값은 끝난 뒤에도 일부러 남기므로(위 주석),
  // 이것을 빼면 이미 판단 카드가 뜬 화면 위에서 "곧 마무리합니다" 가 미래
  // 시제로 계속 떠 있는다. 예고는 아직 도는 중일 때만 뜻이 있다.
  const warning =
    running &&
    !stopped &&
    budgetMs !== null &&
    elapsed !== null &&
    elapsed >= budgetMs * ADVICE_WARN_RATIO;

  return (
    <div className="flex flex-col gap-2 border-b border-dotted border-line-30 px-[22px] py-3.5">
      <div className="flex items-center justify-between gap-3">
        <span
          role="status"
          aria-live="polite"
          className="text-muted-70 text-12"
        >
          {stageLabel(stage, running, stopped)}
        </span>
        <span className="flex items-center gap-2">
          {/* 경과를 보여 주는 이유: 이것이 없으면 40초째에 "느린 것" 과 "멈춘 것" 을
              구분할 단서가 회전하는 점 하나뿐이다. */}
          {elapsed !== null ? (
            <span className="num text-muted-50 text-11">
              {Math.floor(elapsed / 1000)}초
            </span>
          ) : null}
          {running ? (
            <span
              aria-hidden
              className="dot block h-[11px] w-[11px] animate-dot-spin border-[1.6px] border-line-25 border-t-up"
            />
          ) : null}
        </span>
      </div>
      <div
        className="h-[3px] bg-line-14"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={stage}
        aria-label="AI 분석 진행"
      >
        <span
          className="block h-[3px] bg-ink transition-[width] duration-[400ms] ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      {warning ? (
        <p
          role="status"
          aria-live="polite"
          className="text-muted-60 text-11 leading-[1.6]"
        >
          {/* 재지 않은 평균("보통 N초")이 아니라 **서버가 방금 알려 준** 예산을 쓴다.
              코드가 실제로 지키는 약속만 화면에 적는다. */}
          {Math.round(budgetMs / 1000)}초가 지나면 그때까지 모은 지표로 판단을
          마무리합니다.
        </p>
      ) : null}
    </div>
  );
}
