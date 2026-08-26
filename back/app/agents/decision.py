"""최종 판단 에이전트와 규칙 기반 폴백 (명세 6.4)."""

import json
import logging

from app.agents.prompts import DECISION_PROFILE
from app.integrations.llm import ask_structured
from app.schemas.advice import AgentOpinion, InvestmentDecision
from app.schemas.rag import RetrievedDoc
from app.schemas.stock import StockFundamentals, StockHistory, StockMetrics
from app.utils.numbers import format_percent, is_number

logger = logging.getLogger(__name__)

_BUY_THRESHOLD = 2
_AVOID_THRESHOLD = -1
_DAY_DROP_THRESHOLD = -3.0
_CONFIDENCE_BASE = 52
_CONFIDENCE_STEP = 8
_CONFIDENCE_CAP = 82


def _score(metrics: StockMetrics) -> int:
    """지표 기반 단순 가점/감점. 값이 없으면 그 항목은 건너뛴다."""
    score = 0

    if is_number(metrics.return_20d_pct):
        score += 1 if metrics.return_20d_pct > 0 else -1
    if is_number(metrics.return_60d_pct):
        score += 1 if metrics.return_60d_pct > 0 else -1
    if metrics.trend == "상승 우위":
        score += 1
    if metrics.recent_cross_signal == "golden":
        score += 1
    if metrics.recent_cross_signal == "dead":
        score -= 1
    if metrics.bollinger_position == "상단 돌파":
        score -= 1
    if metrics.bollinger_position == "하단 이탈":
        score -= 1
    if is_number(metrics.day_change_pct) and metrics.day_change_pct < _DAY_DROP_THRESHOLD:
        score -= 1

    return score


def fallback_decision(metrics: StockMetrics) -> InvestmentDecision:
    """LLM을 쓸 수 없을 때의 규칙 기반 판단 (와이어프레임 1d의 '규칙 기반 판단')."""
    score = _score(metrics)

    if score >= _BUY_THRESHOLD:
        verdict = "BUY"
        label = "매수 가능"
        first = "현재 데이터 기준으로는 분할 매수 검토가 가능합니다."
    elif score <= _AVOID_THRESHOLD:
        verdict = "AVOID"
        label = "매수 보류"
        first = "현재 데이터 기준으로는 바로 사기보다 매수를 보류하는 편이 낫습니다."
    else:
        verdict = "WATCH"
        label = "관망"
        first = "현재 데이터 기준으로는 바로 사기보다 관망이 적절합니다."

    return InvestmentDecision(
        verdict=verdict,
        decision_label=label,
        confidence=min(_CONFIDENCE_CAP, _CONFIDENCE_BASE + abs(score) * _CONFIDENCE_STEP),
        answer=(
            f"{first} 추세는 {metrics.trend}이고, "
            f"20거래일 수익률은 {format_percent(metrics.return_20d_pct)}, "
            f"최근 교차 신호는 {metrics.recent_cross_signal or '없음'}입니다. "
            "이 판단은 실시간 데이터와 모델 분석을 바탕으로 한 참고 의견이며 "
            "투자 손익을 보장하지 않습니다."
        ),
        buy_conditions=[
            "종가가 단기 이동평균 위에서 유지되는지 확인",
            "거래량 증가가 하락 압력이 아니라 상승 확인으로 이어지는지 확인",
        ],
        risk_notes=[
            "뉴스 이벤트, 실적 발표, 환율 및 금리 변화에 따라 판단이 빠르게 바뀔 수 있습니다.",
            "개인 투자 성향과 보유 비중을 반영한 맞춤 자문은 아닙니다.",
        ],
    )


def _decision_context(
    stock_data: StockHistory,
    metrics: StockMetrics,
    opinions: list[AgentOpinion],
    fundamentals: StockFundamentals | None,
    documents: list[RetrievedDoc] | None = None,
) -> str:
    return json.dumps(
        {
            "stock": {"name": stock_data.name, "symbol": stock_data.symbol},
            "metrics": metrics.model_dump(),
            "fundamentals": fundamentals.model_dump() if fundamentals else None,
            # 하위 의견의 요약만 읽고 원문을 못 보면, 세 의견이 엇갈릴 때 판정할
            # 근거가 없다. 같은 문서를 함께 주어 직접 확인하게 한다.
            "retrieved_documents": [
                {
                    "doc_id": doc.doc_id,
                    "title": doc.title,
                    "publisher": doc.publisher,
                    "published_at": doc.published_at,
                    "content": doc.snippet,
                }
                for doc in (documents or [])
            ],
            "agent_opinions": [opinion.model_dump() for opinion in opinions],
        },
        ensure_ascii=False,
        indent=2,
    )


async def decide(
    stock_data: StockHistory,
    metrics: StockMetrics,
    opinions: list[AgentOpinion],
    *,
    fundamentals: StockFundamentals | None = None,
    documents: list[RetrievedDoc] | None = None,
) -> tuple[InvestmentDecision, bool]:
    """최종 판단을 만든다.

    `fundamentals`가 여기에도 들어가는 이유: BUY/WATCH/AVOID 가 형성되는 유일한
    지점이다. 경제학자 의견에만 넣으면 "PER 176배"가 문장으로만 남고 판단을 움직이지
    못한다. 키워드 전용이라 기존 호출부는 그대로 유효하다.

    Returns:
        (판단, 규칙 기반으로 대체했는지 여부)
    """
    context = _decision_context(stock_data, metrics, opinions, fundamentals, documents)

    try:
        decision = await ask_structured(DECISION_PROFILE.full_prompt(), context, InvestmentDecision)
    except Exception as exc:
        logger.warning("최종 판단 에이전트 실패 (%s) → 규칙 기반 판단으로 대체", exc)
        return fallback_decision(metrics), True

    return decision, False
