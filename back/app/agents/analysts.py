"""하위 분석 에이전트 3인 (명세 6.4).

원본은 세 에이전트를 순차 호출했다 — 각 호출이 수십 초 걸릴 수 있으므로 지연이 3배로
누적됐다. 서로 독립적인 호출이므로 `asyncio.gather`로 병렬 실행한다.
"""

import asyncio
import json
import logging

from app.agents.prompts import ANALYST_PROFILES, AgentProfile
from app.integrations.llm import ask_structured
from app.schemas.advice import AgentOpinion, AnalystOutput
from app.schemas.rag import DocRef, RetrievedDoc
from app.schemas.stock import StockFundamentals, StockHistory, StockMetrics
from app.utils.numbers import format_compact_number, format_percent
from app.utils.text import clean_text

logger = logging.getLogger(__name__)

_CONTEXT_NEWS_LIMIT = 3
_CONTEXT_REPORT_LIMIT = 3


def build_context(
    stock_data: StockHistory,
    metrics: StockMetrics,
    *,
    fundamentals: StockFundamentals | None = None,
    documents: list[RetrievedDoc] | None = None,
) -> str:
    """에이전트에게 넘길 JSON 컨텍스트. 봉 데이터는 제외하고 요약만 담는다.

    `fundamentals`는 없어도 **키를 `null`로 항상 내보낸다.** 경제학자 프롬프트가
    이 필드를 명시적으로 참조하므로, 키가 상황에 따라 사라지면 프롬프트가 거짓이 되고
    모델이 없는 값을 지어낸다. `retrieved_documents`도 같은 이유로 항상 넣는다 —
    빈 배열이면 "검색된 문서가 없다"는 사실 자체가 프롬프트의 근거 규칙과 맞물린다.

    `news`/`analyst_reports`는 검색 문서와 별개로 남긴다. 전자는 "가장 최근 무슨 일이
    있었나"(시간순), 후자는 "이 판단에 관련된 것이 무엇인가"(관련도순)로 답이 다르고,
    벡터 DB가 없는 환경에서는 전자만 남아야 예전과 동일하게 동작한다.
    """
    return json.dumps(
        {
            "stock": {
                "name": stock_data.name,
                "symbol": stock_data.symbol,
                "query": stock_data.query,
            },
            "metrics": metrics.model_dump(),
            "fundamentals": fundamentals.model_dump() if fundamentals else None,
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
            "news": [
                {
                    "title": item.title,
                    "publisher": item.publisher,
                    "published_at": item.published_at,
                    "summary": item.summary,
                }
                for item in stock_data.news[:_CONTEXT_NEWS_LIMIT]
            ],
            "analyst_reports": [
                {
                    "title": item.title,
                    "publisher": item.publisher,
                    "published_at": item.published_at,
                    "summary": item.summary,
                }
                for item in stock_data.reports[:_CONTEXT_REPORT_LIMIT]
            ],
        },
        ensure_ascii=False,
        indent=2,
    )


def make_fallback_opinion(agent_name: str, metrics: StockMetrics) -> str:
    """LLM 없이 지표만으로 작성하는 대체 의견."""
    if agent_name == "AI 애널리스트":
        return (
            f"최근 종가 {format_compact_number(metrics.latest_close)}, "
            f"일간 변동률 {format_percent(metrics.day_change_pct)}, "
            f"20거래일 수익률 {format_percent(metrics.return_20d_pct)}, "
            f"추세는 {metrics.trend}입니다."
        )
    if agent_name == "AI 경제학자":
        return (
            "시장 환경은 가격 추세와 거래량을 기준으로 보수적으로 해석했습니다. "
            f"20일 거래량 대비 배율은 {format_compact_number(metrics.volume_ratio_20d)}입니다."
        )
    return "뉴스와 리포트는 수집 가능한 제목과 요약 중심으로 점검했습니다."


def resolve_sources(
    cited_ids: list[str], documents: list[RetrievedDoc] | None
) -> list[DocRef]:
    """모델이 인용한 doc_id를 실제 문서로 되돌린다.

    **검색 결과에 없는 ID는 버린다.** 모델이 D9 같은 없는 번호를 지어내는 일이
    있는데, 그걸 그대로 화면에 올리면 "근거"라는 이름의 거짓이 된다. 순서는 검색
    순위를 따르고 중복은 제거한다.
    """
    by_id = {doc.doc_id: doc for doc in documents or []}
    seen: set[str] = set()
    sources: list[DocRef] = []

    for raw in cited_ids:
        doc_id = clean_text(raw).upper()
        document = by_id.get(doc_id)
        if document is None or doc_id in seen:
            continue
        seen.add(doc_id)
        sources.append(
            DocRef(
                title=document.title,
                publisher=document.publisher,
                url=document.url,
                published_at=document.published_at,
            )
        )

    return sources


async def _invoke(
    profile: AgentProfile,
    context: str,
    metrics: StockMetrics,
    documents: list[RetrievedDoc] | None = None,
) -> AgentOpinion:
    try:
        output = await ask_structured(profile.full_prompt(), context, AnalystOutput)
        summary = clean_text(output.summary)
    except Exception as exc:
        logger.warning("%s 호출 실패 (%s) → 규칙 기반 의견으로 대체", profile.name, exc)
        return AgentOpinion(
            agent=profile.name,
            status="fallback",
            summary=make_fallback_opinion(profile.name, metrics),
            error=clean_text(exc),
        )

    if not summary:
        logger.warning("%s 응답이 비어 있습니다 → 규칙 기반 의견으로 대체", profile.name)
        return AgentOpinion(
            agent=profile.name,
            status="fallback",
            summary=make_fallback_opinion(profile.name, metrics),
            error="빈 응답",
        )

    return AgentOpinion(
        agent=profile.name,
        status="done",
        summary=summary,
        stance=output.stance,
        sources=resolve_sources(output.cited_doc_ids, documents),
    )


async def invoke_one(
    profile: AgentProfile,
    context: str,
    metrics: StockMetrics,
    documents: list[RetrievedDoc] | None = None,
) -> AgentOpinion:
    """에이전트 1인 호출. 스트리밍 경로가 완료 순서대로 흘려보내기 위해 노출한다."""
    return await _invoke(profile, context, metrics, documents)


async def collect_opinions(
    context: str, metrics: StockMetrics, documents: list[RetrievedDoc] | None = None
) -> list[AgentOpinion]:
    """에이전트 3인을 병렬 실행한다. 개별 실패는 폴백 의견으로 흡수된다."""
    return list(
        await asyncio.gather(
            *(_invoke(profile, context, metrics, documents) for profile in ANALYST_PROFILES)
        )
    )
