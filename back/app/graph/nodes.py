"""AI 판단 그래프의 노드들.

노드는 **상태를 받아 바뀐 부분만 돌려주는 함수**다. 여기 있는 함수는 전부 그 규약을
따르고, 그래프 배선은 `graph/advice_graph.py` 가 한다 — 무엇을 하는지(노드)와 어떤
순서로 하는지(엣지)를 갈라 두면 순서를 바꿀 때 노드를 안 건드린다.

## LLM 은 여전히 `llm.py` 로만 부른다

**langgraph 만 추가하고 langchain 모델 래퍼는 쓰지 않는다.** 노드 안에서 `ChatOpenAI`
같은 것을 만들면 "LLM SDK 를 import 하는 파일은 하나" 라는 원칙이 깨지고, 프로바이더를
바꿀 때 고칠 파일이 그래프 노드 수만큼 늘어난다. 실제로 그 원칙 덕분에 프로바이더를
세 번 바꾸면서 에이전트 코드를 한 줄도 안 건드렸다.

그래서 이 그래프가 langgraph 에서 쓰는 것은 **오케스트레이션뿐**이다: 상태 병합,
병렬 fan-out/fan-in, 조건부 엣지, 루프.

## 실패는 노드 안에서 흡수한다

노드가 예외를 던지면 그래프 전체가 멈춘다. 그런데 이 화면의 요구는 반대다 — 뉴스를
못 받아도, 재무가 없어도, RAG 가 죽어도 **판단은 나와야 한다.** 그래서 수집·검색
노드는 실패를 빈 값으로 접고, 진짜로 못 가는 것(주가 조회 실패)만 위로 올린다.
"""

import asyncio
import logging

from app.agents.analysts import build_context, invoke_one, make_fallback_opinion
from app.agents.decision import decide as run_decision
from app.agents.decision import fallback_decision
from app.agents.prompts import ANALYST, ECONOMIST, JOURNALIST, AgentProfile
from app.core.config import settings
from app.graph.state import AdviceState, seconds_left
from app.schemas.advice import AgentOpinion
from app.schemas.stock import StockHistoryParams
from app.services import advice_cache, fundamentals_service, rag_service, stock_service

logger = logging.getLogger(__name__)

_ROW_LIMIT = 504
_TIMEFRAME = "day"

#: 검색을 다시 시도할 최대 횟수. 첫 시도 + 재작성 2회 = 최대 3회 검색.
#:
#: 상한이 없으면 질의를 계속 고쳐 쓰며 도는데, 한 번 돌 때마다 임베딩 1회 + 재작성
#: LLM 1회가 나간다. 문서가 원래 없는 종목에서는 영원히 만족하지 못한다.
MAX_REWRITES = 2

#: 인용이 어긋났을 때 판단을 다시 만들 최대 횟수.
MAX_DECIDE_RETRIES = 1

#: 이 개수 미만이면 검색이 부실하다고 본다.
MIN_DOCUMENTS = 2


# ── 수집 ────────────────────────────────────────────────────────────────


async def collect_price(state: AdviceState) -> dict:
    """주가 + 지표. **여기서 실패하면 그래프가 멈춘다.**

    다른 노드와 달리 실패를 흡수하지 않는다. 주가가 없으면 지표도 판단도 성립하지
    않아서, 문서 없이 진행하는 것과는 성격이 다르다 — 상류 429 같은 복구 불가능한
    실패는 stage 0 에러로 사용자에게 그대로 알려야 한다.
    """
    params = StockHistoryParams(
        symbol=state["symbol"], timeframe=_TIMEFRAME, limit=_ROW_LIMIT
    )
    stock_data = await stock_service.get_history(
        params, include_content=False, listing=state.get("listing")
    )
    return {
        "stock_data": stock_data,
        "metrics": stock_service.get_metrics(stock_data),
    }


async def collect_context(state: AdviceState) -> dict:
    """뉴스·리포트 + 재무. 둘 다 네트워크 대기라 병렬로 묶는다.

    재무 실패는 `get_fundamentals_or_none` 이 이미 None 으로 접는다. 뉴스 실패는
    여기서 빈 목록으로 접는다 — PER 을 못 읽었다고, 기사를 못 받았다고 분석 전체가
    죽으면 안 된다.
    """
    stock_data = state["stock_data"]
    assert stock_data is not None  # collect_price 가 먼저 돈다 (그래프 배선)

    content, fundamentals = await asyncio.gather(
        stock_service.get_content(stock_data.symbol),
        fundamentals_service.get_fundamentals_or_none(stock_data.symbol),
        return_exceptions=True,
    )

    if isinstance(content, BaseException):
        logger.warning("%s 뉴스 수집 실패 (%s) → 문서 없이 진행", stock_data.symbol, content)
        from app.schemas.stock import StockContent

        content = StockContent(symbol=stock_data.symbol)
    if isinstance(fundamentals, BaseException):
        fundamentals = None

    # 봉 데이터에 방금 받은 뉴스를 얹는다. 프롬프트 컨텍스트가 이걸 본다.
    stock_data = stock_data.model_copy(
        update={"news": content.news, "reports": content.reports}
    )
    return {
        "stock_data": stock_data,
        "content": content,
        "fundamentals": fundamentals,
        # 첫 질의. 이후 rewrite_query 가 갈아끼운다.
        "query": rag_service.build_query(stock_data.name, stock_data.symbol),
    }


# ── 캐시 (7회차) ────────────────────────────────────────────────────────


def check_cache(state: AdviceState) -> dict:
    """TTL 안이면 뉴스 조회조차 하지 않고 캐시를 쓴다 (advice_cache 흐름 ①).

    노드로 만든 이유는 **분기 조건이 상태에 있어야 하기 때문**이다. 캐시 적중 여부가
    "분석을 할 것인가 말 것인가" 를 가르는데, 그 판단을 서비스 함수 안에 숨겨 두면
    그래프 그림만 봐서는 왜 어떤 요청은 3초에 끝나는지 알 수 없다.
    """
    stock_data = state["stock_data"]
    assert stock_data is not None

    outcome = advice_cache.peek(stock_data.symbol)
    if outcome is None:
        return {"from_cache": False}

    logger.info("%s AI 판단을 캐시에서 재생합니다", stock_data.symbol)
    return {"cached_outcome": outcome, "from_cache": True}


def check_fingerprint(state: AdviceState) -> dict:
    """TTL 은 지났지만 기사가 그대로면 다시 분석하지 않는다 (흐름 ②).

    뉴스 조회 비용은 이미 치렀고, 여기서 아끼는 것은 **LLM 4회**다.
    """
    stock_data = state["stock_data"]
    assert stock_data is not None

    outcome = advice_cache.reuse_if_unchanged(stock_data.symbol, state.get("content"))
    if outcome is None:
        return {"from_cache": False}

    logger.info("%s 기사가 그대로라 직전 AI 판단을 유지합니다", stock_data.symbol)
    return {"cached_outcome": outcome, "from_cache": True}


def replay(state: AdviceState) -> dict:
    """캐시된 결과를 상태에 얹는다. 이후는 새로 만든 것과 구분되지 않는다.

    스트림 계약(4단계)을 캐시 적중에서도 그대로 지키기 위한 자리다 — 화면 코드는
    캐시였는지 알 필요가 없다.
    """
    outcome = state.get("cached_outcome")
    assert outcome is not None
    return {
        "opinions": list(outcome.opinions),
        "decision": outcome.decision,
        "used_fallback": outcome.used_fallback,
    }


def store_result(state: AdviceState) -> dict:
    """새로 만든 판단을 기사 지문과 함께 캐시에 넣는다.

    폴백은 `advice_cache.store` 가 스스로 걸러 낸다 — 고장이 캐시에 굳으면 안 된다.
    """
    stock_data = state["stock_data"]
    decision = state.get("decision")
    if stock_data is None or decision is None:
        return {}

    advice_cache.store(
        stock_data.symbol,
        state.get("content"),
        opinions=state.get("opinions") or [],
        decision=decision,
        used_fallback=bool(state.get("used_fallback")),
    )
    return {}


# ── 검색 · 등급 · 재작성 (루프) ─────────────────────────────────────────


async def retrieve(state: AdviceState) -> dict:
    """색인 + 하이브리드 검색. 실패는 빈 목록으로 접는다.

    색인은 **첫 회차에만** 한다. 질의를 고쳐 다시 검색할 때 같은 기사를 또 색인할
    이유가 없고, 그러면 재작성 한 번에 임베딩 비용이 문서 수만큼 더 나간다.

    검색에 쓸 시간은 **남은 전체 예산 안에서만** 잡는다. `rag_timeout_seconds`
    하나만 보면 재작성 루프에서 15초 × 3회 = 45초가 나갈 수 있고, 그것은 판단
    전체 예산의 절반이다 — RAG 는 없어도 판단이 성립하는 부품인데 예산의 절반을
    가져가는 것은 우선순위가 뒤집힌 것이다.
    """
    stock_data = state["stock_data"]
    content = state.get("content")
    attempts = state.get("retrieve_attempts", 0)
    assert stock_data is not None

    if not settings.rag_enabled:
        return {"documents": [], "retrieve_attempts": attempts + 1}

    left = seconds_left(state)
    budget = (
        settings.rag_timeout_seconds
        if left is None
        else min(settings.rag_timeout_seconds, left)
    )
    if budget <= 0:
        logger.info("%s 예산이 남지 않아 검색을 건너뜁니다", stock_data.symbol)
        return {"documents": [], "retrieve_attempts": attempts + 1}

    try:
        async with asyncio.timeout(budget):
            if attempts == 0 and settings.rag_ingest_on_advice and content is not None:
                await rag_service.index_content(stock_data.symbol, content)
            documents = await rag_service.retrieve(stock_data.symbol, state["query"])
    except Exception as exc:  # noqa: BLE001 - RAG 실패 ≠ 판단 실패
        # `TimeoutError` 는 `OSError` → `Exception` 하위라 여기 함께 잡힌다.
        # `CancelledError` 는 **`Exception` 하위가 아니라서**(3.12) 이 절을 그냥
        # 지나간다 — 바깥 실행 예산의 취소를 우리가 삼키지 않는다는 뜻이다.
        # 예전의 `except (TimeoutError, Exception)` + isinstance 재-raise 는 같은
        # 동작의 죽은 코드였다. **`BaseException` 으로 넓히지 말 것** — 그 순간
        # 예산 초과가 여기서 삼켜져 그래프가 계속 돈다.
        logger.warning("%s 검색 실패 (%s) → 문서 없이 진행", stock_data.symbol, exc)
        documents = []

    return {"documents": documents, "retrieve_attempts": attempts + 1}


def grade_documents(state: AdviceState) -> dict:
    """검색이 쓸 만한가. **LLM 을 쓰지 않는다.**

    "관련성을 모델에게 물어본다" 는 방식도 있지만 여기서는 개수로 판정한다. 이유는
    비용과 신뢰도 둘 다다: 판정에 LLM 을 한 번 더 쓰면 종목당 호출이 5회가 되고,
    무엇보다 우리 검색은 이미 **종목으로 필터된** 결과라 "관련 없는 문서" 가 섞일
    여지가 적다. 실제로 부족한 경우는 "문서가 거의 없다" 쪽이다.

    판정만 하고 분기는 `graph/advice_graph.py` 의 조건부 엣지가 한다 — 노드는 상태를
    바꾸고, 어디로 갈지는 그래프가 정한다.
    """
    count = len(state.get("documents") or [])
    if count >= MIN_DOCUMENTS:
        return {"grade_note": f"문서 {count}건 — 충분"}
    return {"grade_note": f"문서 {count}건 — 부족"}


async def rewrite_query(state: AdviceState) -> dict:
    """질의를 고쳐 다시 검색한다.

    1단계의 고정 질의(`build_query`)가 이 노드로 승격된 자리다. 고정 질의는 "실적과
    주가에 영향을 주는 최근 이슈" 처럼 일반적이라, 그 종목의 문서가 다른 어휘로
    쓰여 있으면 한 건도 못 건진다.

    실패하면 **원래 질의를 그대로 둔다.** 재작성이 안 됐다고 검색을 포기할 이유는
    없고, 다음 회차에서 같은 질의로 한 번 더 시도해도 손해가 크지 않다.
    """
    stock_data = state["stock_data"]
    assert stock_data is not None

    from app.integrations.llm import ask_text

    previous = state["query"]
    try:
        rewritten = await ask_text(
            "너는 검색 질의를 고쳐 쓰는 도구다. 설명 없이 질의 문장 하나만 출력해라.",
            f"종목: {stock_data.name}({stock_data.symbol})\n"
            f"직전 질의: {previous}\n"
            "이 질의로 검색했더니 관련 문서가 거의 없었다. "
            "같은 종목의 뉴스·리포트를 더 잘 찾도록 어휘를 바꿔 다시 써라. "
            "회사명·사업 영역·업종 용어를 섞고, 문장 하나로 만들어라.",
        )
    except Exception as exc:  # noqa: BLE001 - 재작성 실패가 판단 실패가 되면 안 된다
        logger.warning("질의 재작성 실패 (%s) → 직전 질의 유지", exc)
        return {}

    rewritten = rewritten.strip().splitlines()[0].strip() if rewritten.strip() else ""
    if not rewritten:
        return {}

    logger.info("질의 재작성: %r → %r", previous, rewritten)
    return {"query": rewritten}


# ── 에이전트 3인 (병렬) ─────────────────────────────────────────────────


def _context_of(state: AdviceState) -> str:
    return build_context(
        state["stock_data"],
        state["metrics"],
        fundamentals=state.get("fundamentals"),
        documents=state.get("documents"),
    )


async def _run_analyst(state: AdviceState, profile: AgentProfile) -> dict:
    """에이전트 1인. 실패는 `invoke_one` 이 규칙 기반 의견으로 흡수한다.

    반환이 **리스트 하나**인 것이 중요하다 — 상태의 `opinions` 에 리듀서(`operator.add`)가
    걸려 있어 셋이 이어 붙는다. dict 하나를 그냥 반환하면 마지막 것만 남는다.
    """
    opinion = await invoke_one(
        profile, _context_of(state), state["metrics"], state.get("documents")
    )
    return {"opinions": [opinion]}


async def journalist(state: AdviceState) -> dict:
    return await _run_analyst(state, JOURNALIST)


async def economist(state: AdviceState) -> dict:
    return await _run_analyst(state, ECONOMIST)


async def analyst(state: AdviceState) -> dict:
    return await _run_analyst(state, ANALYST)


# ── 최종 판단 · 검증 ────────────────────────────────────────────────────


async def decide(state: AdviceState) -> dict:
    """의견 셋을 모아 최종 판단. 실패는 규칙 기반으로 접는다 (`agents/decision`)."""
    decision, used_fallback = await run_decision(
        state["stock_data"],
        state["metrics"],
        state.get("opinions") or [],
        fundamentals=state.get("fundamentals"),
        documents=state.get("documents"),
    )
    return {
        "decision": decision,
        "used_fallback": used_fallback,
        "decide_attempts": state.get("decide_attempts", 0) + 1,
    }


def verify(state: AdviceState) -> dict:
    """판단이 **없는 근거를 지어내지 않았는지** 본다.

    하위 에이전트의 인용은 `resolve_sources` 가 이미 검증한다(검색 결과에 없는 ID는
    버린다). 여기서 보는 것은 **최종 판단 본문**이다 — 프롬프트가 "본문에 doc_id 를
    쓰지 마라" 고 지시하는데도 `D9` 같은 없는 번호가 새어 나오는 일이 있고, 그게
    사용자에게 보이는 문장에 들어가면 근거가 없는 것보다 나쁘다.

    규칙 기반 폴백은 검사하지 않는다. 애초에 문서를 보지 않고 만든 답이라 인용이
    있을 수 없고, 여기서 걸어 봐야 다시 만들어도 같은 답이다.
    """
    decision = state.get("decision")
    if decision is None or state.get("used_fallback"):
        return {"verify_note": "검증 생략 (규칙 기반)"}

    known = {doc.doc_id.upper() for doc in state.get("documents") or []}
    import re

    cited = {m.upper() for m in re.findall(r"\bD\d+\b", decision.answer)}
    unknown = cited - known
    if unknown:
        return {"verify_note": f"없는 근거 인용: {', '.join(sorted(unknown))}"}
    return {"verify_note": "인용 정상"}


def force_fallback(state: AdviceState) -> dict:
    """재시도까지 실패했을 때 규칙 기반으로 내린다.

    "지어낸 근거가 붙은 그럴듯한 판단" 보다 "근거 없는 보수적 판단" 이 낫다는 선택이다.
    사용자 화면에는 '규칙 기반 판단' 배지가 뜨므로 무엇을 보고 있는지도 드러난다.
    """
    logger.warning(
        "%s 인용 검증을 %d회 통과하지 못해 규칙 기반으로 대체합니다 (%s)",
        state["symbol"],
        state.get("decide_attempts", 0),
        state.get("verify_note", ""),
    )
    metrics = state["metrics"]
    opinions = state.get("opinions") or []
    return {
        "decision": fallback_decision(metrics),
        "used_fallback": True,
        # 의견까지 버리지는 않는다 — 화면의 에이전트 카드는 그대로 유효하다.
        "opinions": [] if opinions else [_empty_opinion(metrics)],
    }


def _empty_opinion(metrics) -> AgentOpinion:
    return AgentOpinion(
        agent=JOURNALIST.name,
        status="fallback",
        summary=make_fallback_opinion(JOURNALIST.name, metrics),
    )
