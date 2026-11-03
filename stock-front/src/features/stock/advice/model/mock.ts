// 목 응답. 백엔드 generate_stock_advice 가 붙으면 이 파일은 삭제된다.

import type { AgentOpinion, Decision } from "./types";

export const MOCK_AGENTS: AgentOpinion[] = [
  {
    agent: "AI 저널리스트",
    status: "done",
    stance: "긍정",
    summary:
      "HBM4 공급 협의 진전 보도가 하반기 물량 확대 기대를 키웠습니다. 재고 조정이 마무리 국면이라는 분석이 함께 나오며 뉴스 톤은 대체로 우호적입니다. 다만 환율 관련 기사는 수출 채산성에 양방향으로 해석될 여지를 남깁니다.",
    source: "연합뉴스 · 한국경제 · Reuters 3건",
  },
  {
    agent: "AI 경제학자",
    status: "done",
    stance: "중립",
    summary:
      "거래량이 20일 평균의 1.8배로 늘어 수급이 실제로 유입되고 있습니다. 다만 원/달러 1,380원대와 미 금리 경로는 여전히 상방을 제약하는 변수입니다. 지수 대비 초과 수익 구간이라 단기 되돌림 가능성을 열어 둡니다.",
    source: "거래량 20일 평균 · KOSPI 상대강도",
  },
  {
    agent: "AI 애널리스트",
    status: "done",
    stance: "긍정",
    summary:
      "20일선이 60일선을 상향 돌파한 뒤 이격이 유지되고 있습니다. 종가가 볼린저 상단에 근접했으나 밴드가 함께 확장 중이라 과열로 보기는 이릅니다. 후행 지표의 한계상 20일선 이탈을 손절 기준으로 함께 봅니다.",
    source: "SMA20/60 골든크로스 · BB(20,2) 상단",
  },
];

export const MOCK_DECISION: Decision = {
  verdict: "BUY",
  decisionLabel: "비중 확대",
  confidence: 72,
  answer:
    "세 에이전트 모두 업황 회복을 전제로 하며, 기술적 신호(골든크로스·거래량 1.8배)가 뉴스 톤과 같은 방향입니다. 다만 환율·금리 변수로 단기 조정 가능성이 있어 분할 매수를 권합니다.",
  buyConditions: ["20일선 상향 돌파 · 거래량 1.82x", "목표가 컨센서스 +12%"],
  riskNotes: ["원/달러 1,381원 · 미 금리 경로"],
  source: "llm",
  // 2축 판단 (계획 5.6). 목에서는 **갈리는 쪽**을 기본으로 둔다 — 일치하는 경우는
  // 카드가 조용해서 화면 확인에 쓸모가 적고, 불일치가 이 기능의 요지다.
  personal: {
    marketVerdict: "BUY",
    marketConfidence: 72,
    fitScore: 38,
    fitLevel: "low",
    verdict: "WATCH",
    label: "관망",
    adjusted: true,
    concerns: [
      {
        axis: "변동성 부담",
        severity: "high",
        message: "20일 변동성 32.0%가 당신의 감내 구간(약 20.5%)을 넘습니다.",
      },
      {
        axis: "고점 추격 위험",
        severity: "medium",
        message:
          "52주 구간에서 상위 91% 지점입니다. 군중을 따라가는 성향이 강한 편이라 고점 추격이 되기 쉽습니다.",
      },
    ],
    guardrails: [
      "평소 넣던 금액의 1/3로 시작하고, 손절선을 진입 전에 정해 두세요.",
      "지금 전량 담지 말고 눌림목을 기다려 2~3회로 나눠 진입하세요.",
    ],
  },
  updatedAt: "2026-07-30T06:31:00Z",
};

/** fallback_decision — LLM 호출 실패 시 규칙 기반으로 내려오는 판단 */
export const MOCK_FALLBACK_DECISION: Decision = {
  verdict: "WATCH",
  decisionLabel: "관망",
  confidence: 41,
  answer:
    "AI 의견을 받지 못해 지표 규칙으로 판단했습니다. 추세는 상승이지만 거래량 배율 외에 확인된 근거가 부족합니다.",
  buyConditions: ["20일선 상향 돌파 유지"],
  riskNotes: ["에이전트 의견 없음 · 근거 부족"],
  source: "fallback",
  updatedAt: "2026-07-30T06:31:00Z",
};

/** README 프로토타입 타이밍 650 / 1250 / 1900 / 2700ms */
export const MOCK_TIMINGS = {
  stage1: 650,
  stage2: 1250,
  agents: [1900, 2150, 2400],
  decision: 2700,
} as const;
