import type { AgentOpinion, DecisionSource, Verdict } from "./types";

/**
 * 저장된 AI 판단 한 건. 백엔드 `schemas/advice_verdict.AdviceVerdictOut` 대응.
 *
 * ## `Decision` 과 무엇이 다른가
 *
 * `Decision` 은 **방금 만든** 판단이고 이쪽은 **보관된** 판단이다. 겹치는 필드가
 * 많지만 둘을 같은 타입으로 두면 안 되는 이유가 둘 있다.
 *
 * 1. **`personal` 이 없다.** 2축 판단에는 사용자의 투자 성향 6축이 들어 있고 그것은
 *    사주에서 유래한 값이다 — 백엔드가 아예 저장하지 않으므로 여기에도 없다.
 *    타입이 같으면 화면이 `record.personal` 을 쓰려다 런타임에 `undefined` 를 만난다.
 * 2. **`priceAt` 이 있다.** 판단 시점의 가격이다. 지금 값이 아니라 그때 값이라
 *    `Decision` 에는 있을 수 없는 필드다 — "그 뒤 +4.2%" 의 기준선이 된다.
 */
export interface VerdictRecord {
  id: number;
  code: string;
  symbol: string;
  name: string;

  decision: Verdict | string;
  confidence: number;
  source: DecisionSource;
  answer: string;

  /** 판단 시점의 가격. 없으면 화면이 "그 뒤 얼마" 줄을 그리지 않는다 */
  priceAt: number | null;
  agents: AgentOpinion[];

  /** 지금 시세. 백엔드가 조회 시점에 붙인다 — 저장된 값이 아니다 */
  priceNow: number | null;
  /** 판단 이후 수익률. **없으면 null** — 0 이 아니다 */
  sincePercent: number | null;
  /** 공유가 켜져 있으면 그 id. `null` 이면 비공개다 */
  shareId: string | null;
  /** ISO 문자열 */
  createdAt: string;
}

/** 공유 링크로 보는 한 건. **소유자·심볼·가격이 없다** — 백엔드가 빼고 준다. */
export interface SharedVerdict {
  code: string;
  name: string;
  decision: Verdict | string;
  confidence: number;
  source: DecisionSource;
  answer: string;
  agents: AgentOpinion[];
  createdAt: string;
}

/** 백엔드 와이어(스네이크) → 화면 타입(카멜). */
export interface WireVerdict {
  id: number;
  code: string;
  symbol: string;
  name: string;
  decision: string;
  confidence: number;
  source: DecisionSource;
  answer: string;
  price_at: number | null;
  price_now?: number | null;
  since_percent?: number | null;
  agent_opinions: AgentOpinion[];
  share_id: string | null;
  created_at: string;
}

export function toVerdictRecord(wire: WireVerdict): VerdictRecord {
  return {
    id: wire.id,
    code: wire.code,
    symbol: wire.symbol,
    name: wire.name,
    decision: wire.decision,
    confidence: wire.confidence,
    source: wire.source,
    answer: wire.answer,
    priceAt: wire.price_at,
    priceNow: wire.price_now ?? null,
    sincePercent: wire.since_percent ?? null,
    agents: wire.agent_opinions ?? [],
    shareId: wire.share_id,
    createdAt: wire.created_at,
  };
}

export interface WireSharedVerdict {
  code: string;
  name: string;
  decision: string;
  confidence: number;
  source: DecisionSource;
  answer: string;
  agent_opinions: AgentOpinion[];
  created_at: string;
}

export function toSharedVerdict(wire: WireSharedVerdict): SharedVerdict {
  return {
    code: wire.code,
    name: wire.name,
    decision: wire.decision,
    confidence: wire.confidence,
    source: wire.source,
    answer: wire.answer,
    agents: wire.agent_opinions ?? [],
    createdAt: wire.created_at,
  };
}

/**
 * 판단 이후 수익률. **기준가가 없으면 `null`** — 0 이 아니다.
 *
 * `price_at` 은 나중에 추가된 컬럼이라 그 전에 저장된 행에는 없다. 없는 것을
 * 0%로 그리면 "판단 뒤 그대로였다" 는 **틀린 사실**을 말하게 된다.
 */
export function sinceVerdictPercent(
  record: Pick<VerdictRecord, "priceAt">,
  currentPrice: number | null | undefined,
): number | null {
  if (record.priceAt === null || !record.priceAt) return null;
  if (currentPrice === null || currentPrice === undefined) return null;
  return ((currentPrice - record.priceAt) / record.priceAt) * 100;
}
