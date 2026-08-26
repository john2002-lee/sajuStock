"""멀티 에이전트 투자 판단 스키마 (명세 6.4)."""

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.profile import FitConcern, FitLevel
from app.schemas.rag import DocRef
from app.schemas.stock import StockHistory, StockMetrics

Verdict = Literal["BUY", "WATCH", "AVOID"]
AgentStatus = Literal["done", "fallback"]
#: 최종 판단이 **어떻게** 만들어졌는가.
#:
#: `"timeout"` 은 실패가 아니라 **착지 방식**이다 — 실행 예산을 넘겨 그때까지 모은
#: 지표로 규칙 기반 판단을 냈다는 뜻이다. `"fallback"` 과 화면 취급(점선 테두리 ·
#: '규칙 기반 판단' 배지 · 재시도 버튼)은 같고 **이유 문장만 다르다**. 둘을 한 값으로
#: 뭉개면 "AI 가 실패했다" 와 "시간 안에 다 못 모았다" 를 구분해 말할 수 없다.
DecisionSource = Literal["llm", "fallback", "timeout"]
Stance = Literal["긍정", "중립", "부정"]

VERDICT_LABELS: dict[str, str] = {
    "BUY": "매수 가능",
    "WATCH": "관망",
    "AVOID": "매수 보류",
}


class StockAdviceRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=80)


class InvestmentDecision(BaseModel):
    """의사결정 에이전트의 구조화 출력 스키마.

    OpenAI SDK의 `responses.parse(text_format=...)`에 그대로 전달된다. 구조화 출력이
    지원하지 않는 수치 제약(`ge`/`le`)은 SDK가 전송 스키마에서 제거하고 클라이언트
    측에서 검증한다.
    """

    verdict: Verdict = Field(description="BUY=매수 가능, WATCH=관망, AVOID=매수 보류")
    decision_label: str = Field(description="사용자에게 보여줄 짧은 투자 판단")
    confidence: int = Field(ge=0, le=100, description="판단 신뢰도")
    answer: str = Field(description="첫 문장에 사도 되는지 여부가 드러나는 최종 답변")
    buy_conditions: list[str] = Field(default_factory=list)
    risk_notes: list[str] = Field(default_factory=list)


class PersonalVerdict(BaseModel):
    """시장 판단 × 적합도를 결정론적으로 결합한 최종 판단 (계획 5.4).

    `market_verdict` 를 함께 싣는 이유: 화면이 "시장은 BUY 인데 당신에게는 관망"
    이라는 불일치 자체를 보여주기 때문이다 (계획 5.6). 결합 결과만 남기면 그 화면을
    만들 수 없다.
    """

    market_verdict: Verdict
    market_confidence: int = Field(ge=0, le=100)
    fit_score: int = Field(ge=0, le=100)
    fit_level: FitLevel

    verdict: Verdict = Field(description="보정 후 최종 판단. 절대 상향되지 않는다")
    label: str = Field(description="사용자에게 보여줄 짧은 판단. 예: 분할 매수")
    # 프로파일이 실제로 판단을 움직였는지. 화면의 '왜 갈렸나' 블록을 켜는 근거다.
    adjusted: bool = False

    concerns: list[FitConcern] = Field(default_factory=list)
    # "그래도 사겠다면" — 막지 않고 방법을 준다 (계획 5.6).
    guardrails: list[str] = Field(default_factory=list)


class AnalystOutput(BaseModel):
    """하위 에이전트 1인의 구조화 출력 스키마.

    자유 서술(`ask_text`)에서 구조화로 바꾼 이유가 둘 있다.

    * `stance` — 화면의 에이전트 카드에 긍정/중립/부정 배지 자리가 원래 있었는데
      백엔드가 값을 주지 않아 비어 있었다. 본문에서 감성을 추론하는 것보다 모델에게
      직접 받는 편이 정확하다.
    * `cited_doc_ids` — 어떤 문서를 근거로 삼았는지 받아야 화면에 '근거'를 띄우고,
      우리가 그 ID가 실제 검색 결과에 있는지 검증할 수 있다. 본문에서 정규식으로
      캐내는 방식은 모델이 형식을 조금만 어겨도 조용히 빈손이 된다.
    """

    summary: str = Field(description="역할 프롬프트가 요구한 분석. 3문장 이내")
    stance: Stance = Field(description="이 종목에 대한 이 관점의 평가")
    cited_doc_ids: list[str] = Field(
        default_factory=list,
        description="근거로 삼은 retrieved_documents 의 doc_id (예: D1). 없으면 빈 배열",
    )


class AgentOpinion(BaseModel):
    agent: str
    status: AgentStatus
    summary: str
    error: str | None = None
    # 아래 둘은 LLM 경로에서만 채워진다. 규칙 기반 폴백 의견은 근거 문서가 없고,
    # 없는 것을 있는 것처럼 보이게 하면 그게 더 나쁘다.
    stance: Stance | None = None
    sources: list[DocRef] = Field(default_factory=list)


class StockRef(BaseModel):
    name: str
    symbol: str
    query: str


class StockAdviceResponse(BaseModel):
    """`POST /stocks/advice` 응답."""

    stock: StockRef
    stock_data: StockHistory
    metrics: StockMetrics
    agents: list[AgentOpinion]
    verdict: Verdict
    decision_label: str
    confidence: int
    answer: str
    buy_conditions: list[str] = Field(default_factory=list)
    risk_notes: list[str] = Field(default_factory=list)
    # 최종 판단을 LLM이 냈는지 규칙 기반으로 대체했는지. 프런트가 '규칙 기반 판단'
    # 배지와 재시도 버튼을 켜는 유일한 근거다 — agents[].status 로는 알 수 없다
    # (에이전트가 모두 성공해도 의사결정 호출만 실패할 수 있다).
    decision_source: DecisionSource = "llm"
    # 프로파일이 있을 때만 채워진다. 상단 `verdict`/`decision_label` 은 **시장 판단**
    # 그대로 두고 개인화 결과를 별도 블록으로 얹는다 — 같은 필드를 덮어쓰면 화면이
    # "시장은 BUY 인데 당신에게는 관망"이라는 불일치(계획 5.6)를 그릴 수 없고,
    # 프로파일 없는 기존 클라이언트의 동작도 바뀐다.
    personal: PersonalVerdict | None = None
    updated_at: str


class AdviceStreamDecision(BaseModel):
    """스트리밍의 최종 단계 페이로드.

    `StockAdviceResponse`에서 봉 데이터(`stock_data`)를 뺀 형태다 — 504봉을
    SSE 마지막 프레임에 다시 실어보낼 이유가 없다. 차트는 이미 화면에 있다.
    """

    stock: "StockRef"
    verdict: Verdict
    decision_label: str
    confidence: int
    answer: str
    buy_conditions: list[str] = Field(default_factory=list)
    risk_notes: list[str] = Field(default_factory=list)
    decision_source: DecisionSource = "llm"
    # 비스트리밍 응답과 같은 규약 — 프로파일이 있을 때만 채워지고, 위쪽
    # `verdict`/`decision_label` 은 시장 판단 그대로 둔다.
    #
    # **화면이 실제로 쓰는 경로는 이쪽이다.** 프런트는 스트리밍만 부르므로
    # `StockAdviceResponse` 에만 얹으면 2축 판단이 사용자에게 도달하지 못한다.
    personal: PersonalVerdict | None = None
    updated_at: str


class AdviceStreamEvent(BaseModel):
    """SSE 한 프레임. stage 0 은 복구 불가능한 실패를 뜻한다."""

    stage: int = Field(ge=0, le=4)
    agent: AgentOpinion | None = None
    decision: AdviceStreamDecision | None = None
    error: str | None = None
    #: 이번 실행에 허용된 시간(초). 진행 단계 이벤트에만 실린다.
    #:
    #: **화면이 이 숫자를 손으로 적지 않게 하려고 보낸다.** 진행 표시가 "N초가
    #: 지나면 그때까지 모은 지표로 마무리합니다" 라고 예고하는데, 그 N 을 프런트
    #: 상수로 두면 `ADVICE_BUDGET_SECONDS` 를 조이는 순간 화면이 거짓말을 한다 —
    #: 그것도 사용자가 가장 예민한 순간에.
    budget_seconds: float | None = None


def resolve_decision_label(verdict: str, fallback_label: str) -> str:
    return VERDICT_LABELS.get(verdict, fallback_label or "관망")
