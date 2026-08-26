// 백엔드 SSE 이벤트(snake_case) → 도메인 이벤트.
//
// BFF 라우트 핸들러 안에 인라인돼 있던 것을 feature 로 내렸다. 이 매핑은
// **advice 도메인 지식**이지 라우팅이 아니다 — 백엔드 계약이 바뀌면 고칠 곳이
// 라우트가 아니라 여기여야 하고, 라우트가 알아야 할 것은 인증·상한·SSE 프레이밍뿐이다
// (`features/stocks/services/wire.ts` 와 같은 자리).

import type { AdviceStreamEvent, DecisionSource } from "./types";

/** back/app/schemas 의 스트림 이벤트 */
export interface WireAdviceEvent {
  stage: number;
  agent?: {
    agent: string;
    status: "done" | "fallback";
    summary: string;
    error?: string | null;
    stance?: "긍정" | "중립" | "부정" | null;
    sources?: {
      title: string;
      publisher?: string;
      url?: string;
      published_at?: string;
    }[];
  };
  decision?: {
    verdict: "BUY" | "WATCH" | "AVOID";
    decision_label: string;
    confidence: number;
    answer: string;
    buy_conditions: string[];
    risk_notes: string[];
    decision_source: DecisionSource;
    /** 투자 성향 프로파일이 있을 때만. 없으면 필드 자체가 null 로 온다 */
    personal?: {
      market_verdict: "BUY" | "WATCH" | "AVOID";
      market_confidence: number;
      fit_score: number;
      fit_level: "high" | "medium" | "low";
      verdict: "BUY" | "WATCH" | "AVOID";
      label: string;
      adjusted: boolean;
      concerns: { axis: string; severity: "low" | "medium" | "high"; message: string }[];
      guardrails: string[];
    } | null;
    updated_at: string;
  };
  error?: string | null;
  /** 이번 실행에 허용된 시간(초). 진행 단계 이벤트에만 실린다 */
  budget_seconds?: number | null;
}

export function toAdviceEvent(wire: WireAdviceEvent): AdviceStreamEvent {
  return {
    stage: Math.max(0, Math.min(4, wire.stage)) as AdviceStreamEvent["stage"],
    agent: wire.agent
      ? {
          agent: wire.agent.agent,
          status: wire.agent.status,
          summary: wire.agent.summary,
          error: wire.agent.error ?? null,
          // 규칙 기반 폴백 의견은 둘 다 비어 온다 — 그대로 undefined 로 흘려보내
          // 카드가 근거·성향 자리를 그리지 않게 한다.
          stance: wire.agent.stance ?? undefined,
          sources: wire.agent.sources?.map((doc) => ({
            title: doc.title,
            publisher: doc.publisher ?? "",
            url: doc.url ?? "",
            publishedAt: doc.published_at ?? "",
          })),
        }
      : undefined,
    decision: wire.decision
      ? {
          verdict: wire.decision.verdict,
          decisionLabel: wire.decision.decision_label,
          confidence: wire.decision.confidence,
          answer: wire.decision.answer,
          buyConditions: wire.decision.buy_conditions,
          riskNotes: wire.decision.risk_notes,
          source: wire.decision.decision_source,
          // 프로파일이 없으면 null 로 온다 — undefined 로 바꿔 화면이 2축 블록을
          // 아예 그리지 않게 한다 (`sources` 와 같은 규약).
          personal: wire.decision.personal
            ? {
                marketVerdict: wire.decision.personal.market_verdict,
                marketConfidence: wire.decision.personal.market_confidence,
                fitScore: wire.decision.personal.fit_score,
                fitLevel: wire.decision.personal.fit_level,
                verdict: wire.decision.personal.verdict,
                label: wire.decision.personal.label,
                adjusted: wire.decision.personal.adjusted,
                concerns: wire.decision.personal.concerns,
                guardrails: wire.decision.personal.guardrails,
              }
            : undefined,
          updatedAt: wire.decision.updated_at,
        }
      : undefined,
    error: wire.error ?? undefined,
    // 초 → 밀리초. 화면이 쓰는 단위로 여기서 맞춘다 — 경계를 지나는 순간
    // 단위가 하나여야 화면 코드가 매번 곱하지 않는다.
    budgetMs:
      typeof wire.budget_seconds === "number"
        ? wire.budget_seconds * 1000
        : undefined,
  };
}
