"use client";

import { useEffect, useRef } from "react";
import { button, Card, Icon } from "@/shared/ui";
import { useAiAdvice } from "../hooks/useAiAdvice";
import { useSaveVerdict, type VerdictStock } from "../hooks/useSaveVerdict";
import { useAdvice } from "./AdviceProvider";
import { AdviceProgress } from "./AdviceProgress";
import { AgentSlots } from "./AgentSlots";
import { StanceStrip } from "./StanceStrip";
import { FinalDecision } from "./FinalDecision";
import { PersonalVerdictCard } from "./PersonalVerdictCard";
import { VerdictSaveBar } from "./VerdictSaveBar";

/**
 * AI 종합 판단 패널. 2a·2b 가 같은 인스턴스를 공유한다.
 *
 * 데스크탑(≥768) 은 우측 438px 슬라이드 드로어, 모바일은 전체 화면 시트다.
 * 438px 를 모바일에 그대로 두면 375px 뷰포트를 넘겨 가로 스크롤이 생긴다.
 * 두 컴포넌트로 쪼개지 않고 한 요소에 브레이크포인트만 얹은 이유는 SSE 스트림
 * 때문이다 — 마운트가 둘이면 스트림도 둘로 갈라진다.
 */
export function AdviceDrawer({
  symbol,
  stock,
}: {
  symbol: string;
  /**
   * 판단을 **기록**하는 데 필요한 종목 정보. `Decision` 에는 코드·이름·가격이
   * 없어서 호출부가 준다. 없으면 저장하지 않는다 — 기록은 부가 기능이라,
   * 정보가 모자란다고 판단 화면을 막을 이유가 없다.
   */
  stock?: VerdictStock;
}) {
  const { open, fallback, setOpen } = useAdvice();
  const {
    stage,
    agents,
    decision,
    error,
    running,
    startedAt,
    stopped,
    budgetMs,
    retry,
    cancel,
  } = useAiAdvice({ symbol, enabled: open, fallback });
  const closeRef = useRef<HTMLButtonElement>(null);

  // 판단이 도착하면 한 번 기록한다. 실패해도 화면을 막지 않는다.
  const save = useSaveVerdict(stock ?? null, decision ?? null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  // 에이전트 3장이 다 차도 아직 '최종 판단 종합'(4단계) LLM 호출이 남아 있다.
  // agents.length < AGENT_COUNT 만 보면 3번째 카드가 붙는 순간 스켈레톤이 사라져
  // 가장 오래 걸리는 구간이 빈 화면이 된다. 판단이 도착할 때까지 자리를 지킨다.
  const pending = running && !decision;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label="AI 종합 판단"
      // fixed: 2a·2b 두 레이아웃이 동시에 렌더돼 있어도 드로어는 하나만 존재해야
      // 한다 (SSE 스트림이 둘로 갈라지면 안 된다). 컨테이너 밖으로 끌어냈으므로
      // 화면 우측(모바일은 전체)에 붙는다.
      className="fixed inset-0 z-40 flex animate-sheet-up flex-col border-t-2 border-ink bg-surface shadow-drawer md:inset-y-0 md:left-auto md:right-0 md:w-[438px] md:animate-slide-in md:border-l-2 md:border-t-0"
    >
      <header className="flex items-start justify-between gap-3 border-b border-line-20 px-[22px] pb-3.5 pt-5">
        <span className="flex flex-col gap-1">
          <span
            className="font-display font-bold leading-none text-26"
          >
            AI 종합 판단
          </span>
          <span
            className="font-mono uppercase tracking-[0.1em] text-muted-50 text-11"
          >
            3 agents → 1 decision
          </span>
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={() => setOpen(false)}
          aria-label="AI 판단 닫기"
          className="-mr-2 -mt-1 flex min-h-[var(--tap)] min-w-[var(--tap)] items-center justify-center text-muted-50 hover:text-ink md:-mr-0.5 md:-mt-0 md:min-h-0 md:min-w-0"
        >
          <Icon name="close" size={17} />
        </button>
      </header>

      <AdviceProgress
        stage={stage}
        running={running}
        startedAt={startedAt}
        stopped={stopped}
        budgetMs={budgetMs}
      />

      {/* **셋이 갈렸는지가 여기서 보인다.** 진행 표시 바로 아래에 고정해, 의견이
          도착할 때마다 합의와 불일치가 한눈에 갱신되게 한다. 예전에는 이걸 알려면
          카드 세 장을 다 읽어야 했다 (`StanceStrip` 주석). */}
      <div className="border-b border-line-20 px-[22px] pb-3">
        <StanceStrip agents={agents} />
      </div>

      <div
        className="flex flex-1 flex-col gap-3.5 overflow-auto px-[22px] py-4"
        // 모바일 시트는 화면 아래 끝까지 내려오므로 홈 인디케이터만큼 더 띄운다.
        style={{ paddingBottom: "calc(1rem + var(--safe-b))" }}
      >
        {/* 돌고 있는 동안에는 멈출 수 있어야 한다 — 종목당 모델 호출이 여러 번이라
            잘못 연 분석을 끝까지 기다리게 하면 시간도 비용도 사용자가 떠안는다.
            멈춤은 상류까지 닿는다 (`useAiAdvice.cancel` 주석). */}
        <div className="flex items-baseline justify-between gap-3">
          <p
            className="font-mono text-muted-45 text-10 leading-[1.6]"
          >
            AI 분석은 여러 번의 조회를 포함해 시간이 걸립니다.
          </p>
          {running ? (
            <button
              type="button"
              onClick={cancel}
              className={button({ tone: "quiet", size: 12, tap: false, className: "px-2.5 py-1" })}
            >
              분석 멈추기
            </button>
          ) : null}
        </div>

        {/* 셋을 미리 세운다 — 도착한 것은 카드, 아직인 것은 이름이 적힌 골격.
            `pending` 은 '판단까지 아직 남았다' 는 뜻이라 3장이 다 차도 참이다
            (4단계 종합 LLM 호출이 남아 있다). */}
        <AgentSlots agents={agents} running={pending} />

        {decision ? (
          <>
            <FinalDecision decision={decision} onRetry={retry} />
            {/* 판단 바로 아래 — 이 판단이 기록됐는지, 공유할 수 있는지. */}
            <VerdictSaveBar
              state={save.state}
              shareId={save.shareId}
              sharing={save.sharing}
              onShare={save.share}
            />
          </>
        ) : null}

        {/* 시장 판단 **다음에** 온다. 위 카드가 "데이터는 이렇게 말한다" 이고
            이 카드가 "당신에게는" 이라, 그 순서로 읽혀야 불일치가 이야기가 된다.
            프로파일이 없으면 personal 자체가 없어 아무것도 그리지 않는다. */}
        {decision?.personal ? (
          <PersonalVerdictCard personal={decision.personal} />
        ) : null}

        {/* 멈춤은 실패가 아니다 — 본인이 알고 한 일이라 사과하지 않는다. 그래도
            흔적은 남아야 한다: 예전에는 취소하면 화면이 '막 열린 화면' 과 완전히
            같아져서, 무엇을 했는지도 무엇을 할 수 있는지도 알 수 없었다. */}
        {stopped && !decision ? (
          <RetryNotice onRetry={retry}>
            분석을 멈췄습니다. 받는 중이던 의견은 남기지 않았습니다.
          </RetryNotice>
        ) : null}

        {/* 시간 초과는 여기로 오지 않는다 — 백엔드가 규칙 기반 판단(stage 4)으로
            착지시키므로 위쪽 `FinalDecision` 이 이유까지 밝혀 그린다. 이 상자는
            판단을 만들 수조차 없었던 경우(주가 조회 실패 등)의 자리다. */}
        {error && !decision && !stopped ? (
          <RetryNotice onRetry={retry}>
            AI 분석을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </RetryNotice>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * 멈춤·실패 안내 + 다시 시도 버튼.
 *
 * 두 자리가 **문구만 빼고 글자 하나까지 같았다.** 뜻은 다르지만(하나는 본인이 멈춘
 * 것, 하나는 실패한 것) 화면이 하는 일은 같다 — 무슨 일이 있었는지 말하고 되돌릴
 * 길을 준다. 그래서 문장만 받는다.
 */
function RetryNotice({
  children,
  onRetry,
}: {
  children: React.ReactNode;
  onRetry: () => void;
}) {
  return (
    <Card>
      <p className="text-13">{children}</p>
      <button type="button" onClick={onRetry} className={button({ tap: false })}>
        AI 분석 다시 시도
      </button>
    </Card>
  );
}
