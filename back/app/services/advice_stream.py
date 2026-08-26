"""AI 판단 진행 상황 스트리밍 (명세 6.4).

`generate_advice()`는 전부 끝난 뒤 결과 하나를 돌려준다. 그런데 종목당 LLM 호출이
4회라 수십 초가 걸리고, 그동안 화면이 아무것도 말하지 못한다. 그래서 같은 오케스트
레이션을 단계별로 쪼개 이벤트로 흘린다.

이벤트는 프런트가 기대하는 4단계와 1:1로 대응한다.
    {"stage": 1}                      주가 데이터 조회 완료
    {"stage": 2}                      뉴스·리포트 수집 완료
    {"stage": 3, "agent": {...}} × 3  에이전트 의견 (끝나는 순서대로)
    {"stage": 4, "decision": {...}}   최종 판단 종합
    {"stage": n, "error": "..."}      복구 불가능한 실패

예산을 넘긴 경우도 **stage 4 로** 나간다 — 에러가 아니다. 아래 '실행 예산' 참고.

## 11회차 — 오케스트레이션을 그래프로 옮겼다

예전에는 이 파일이 순서를 직접 들고 있었다(주가 → 뉴스 → 검색 → 에이전트 → 판단).
지금은 **`app/graph` 의 상태 그래프가 순서를 소유하고, 이 파일은 통역만 한다** —
그래프가 내보내는 "어떤 노드가 끝났다" 를 프런트가 아는 4단계로 옮긴다.

그 덕분에 이 파일에서 사라진 것이 있다: 검색 재시도 루프, 판단 재시도, 캐시 분기.
전부 그래프의 조건부 엣지로 표현되고, 여기서는 **결과만 통역**하면 된다.

## 왜 stream_mode="updates" 인가

LangGraph 의 스트림 모드는 여러 가지다.

    values   매 단계 **상태 전체**를 준다 — 봉 504개가 매번 실려 온다
    updates  그 노드가 **바꾼 것만** 준다 ← 우리가 쓰는 것
    messages 토큰 단위 (LLM 래퍼를 쓸 때만)

`updates` 는 `{"journalist": {"opinions": [의견]}}` 처럼 온다. 노드 이름이 곧 "어디까지
왔는가" 라서 4단계 매핑이 그대로 된다. 무엇보다 **에이전트가 끝나는 순서대로** 온다 —
`as_completed` 로 손수 만들던 동작을 그래프가 공짜로 준다.

## 실행 예산 — 멈추는 것이 아니라 **착지**한다

그래프 주석은 오래전부터 "30초 안에 끝난다" 고 적어 두었지만 그것을 강제하는 코드가
없었다. 실질 상한은 프런트의 fetch 타임아웃(5분) 하나였고, 그동안 동시 4슬롯 중
하나가 잡혀 다른 사용자는 429 를 받았다.

이제 이 파일이 예산을 소유한다. 순서는 그래프의 것이고 시간은 여기의 것이다.

중요한 것은 **초과했을 때 무엇을 하느냐**다. 90초가 지난 시점에 우리는 이미
지표를 갖고 있고(`collect_price` 가 맨 먼저 돈다) 규칙 기반 판단기도 갖고 있다.
그걸 다 버리고 "불러오지 못했습니다" 를 내보내면, 90초를 기다린 사람에게 남는 것이
없다 — 게다가 "잠시 후 다시 시도" 는 시간 초과에 대한 조치로는 틀렸다(다시 눌러도
같은 90초다). 그래서 stage 0 에러가 아니라 **stage 4 판단**으로 착지시키고,
`decision_source="timeout"` 으로 왜 규칙 기반인지 화면이 말하게 한다.

예산은 두 층이다.

    소프트(60%)  그래프의 조건부 엣지가 스스로 접는다 — 질의 재작성 · 판단 재시도를
                 시작하지 않는다 (`graph/advice_graph`)
    하드(100%)   여기의 `asyncio.timeout` 이 잘라내고 규칙 기반으로 착지한다

소프트가 있어서 하드가 실제로 발동하는 일이 드물어진다. 하드는 백스톱이다.
"""

import asyncio
import logging
import time
from collections.abc import AsyncIterator
from datetime import UTC, datetime

from app.agents.decision import fallback_decision
from app.core.config import settings
from app.domain.fit import compute_fit
from app.domain.verdict import combine
from app.graph import get_graph
from app.schemas.advice import (
    AdviceStreamDecision,
    AdviceStreamEvent,
    AgentOpinion,
    DecisionSource,
    StockRef,
    resolve_decision_label,
)
from app.schemas.profile import InvestorProfile
from app.schemas.stock import KrxListing

logger = logging.getLogger(__name__)

#: 노드 이름 → 이 노드가 끝나면 프런트에 알릴 단계.
#:
#: 여기 없는 노드(check_cache · grade_documents · rewrite_query · verify …)는 이벤트를
#: 만들지 않는다. 내부 판단이라 사용자에게 보여 줄 것이 없고, 그런 노드가 늘어도
#: **프런트와의 4단계 계약은 그대로**다 — 그래프를 키워도 화면을 안 건드린다.
_STAGE_OF: dict[str, int] = {
    "collect_price": 1,
    "check_fingerprint": 2,
    "replay": 2,
}

#: 판단이 **확정되는** 노드들. 어느 경로로 끝나든 stage 4 를 한 번만 낸다.
#:
#: `decide` 가 아니라 그 뒤 노드들인 것이 핵심이다 — `decide` 직후에는 `verify` 가
#: 판단을 물릴 수 있어, 거기서 흘리면 폐기될 판단이 화면에 먼저 뜬다.
_DECISION_NODES = frozenset({"store_result", "force_fallback", "replay"})

# 소프트 지점의 비율은 `settings.advice_soft_ratio` 가 갖는다. 여기 상수로 두면
# 설정 검증(`_llm_must_fit_the_advice_budget`)이 그것을 볼 수 없다 — 그 검사는
# "LLM 호출 하나가 소프트 지점을 넘는가" 를 기동 시점에 따져야 한다.


def _decision_event(
    stock_ref: StockRef,
    state: dict,
    opinions: list[AgentOpinion],
    profile: InvestorProfile | None = None,
    *,
    source: DecisionSource | None = None,
) -> AdviceStreamEvent | None:
    decision = state.get("decision")
    if decision is None:
        return None

    # 2축 판단은 그래프 **밖**에서 만든다. 시장 판단은 전 사용자 공유라 캐시되지만
    # 적합도는 사람마다 다르다 — 그래프 안에 넣으면 캐시 키에 프로파일이 섞여
    # 적중률이 프로파일 수만큼 쪼개진다 (advice_service 의 같은 판단).
    metrics = state.get("metrics")
    personal = (
        combine(decision, compute_fit(profile, metrics))
        if profile is not None and metrics is not None
        else None
    )

    return AdviceStreamEvent(
        stage=4,
        decision=AdviceStreamDecision(
            stock=stock_ref,
            verdict=decision.verdict,
            decision_label=resolve_decision_label(
                decision.verdict, decision.decision_label
            ),
            confidence=decision.confidence,
            answer=decision.answer,
            buy_conditions=decision.buy_conditions,
            risk_notes=decision.risk_notes,
            # `source` 를 넘기면 그것이 이긴다. 예산 착지는 `used_fallback` 로는
            # 표현할 수 없다 — 화면이 "AI 가 실패했다" 와 "시간 안에 다 못 모았다"
            # 를 구분해 말해야 하는데 그 둘은 같은 불리언이다.
            decision_source=source
            or ("fallback" if state.get("used_fallback") else "llm"),
            personal=personal,
            updated_at=datetime.now(UTC).isoformat(timespec="seconds"),
        ),
    )


async def stream_advice(
    symbol: str,
    *,
    listing: KrxListing | None = None,
    profile: InvestorProfile | None = None,
    budget_seconds: float | None = None,
) -> AsyncIterator[AdviceStreamEvent]:
    """단계 이벤트를 순서대로 내보낸다. 소비자가 끊으면 GeneratorExit로 종료된다.

    `profile` 이 있으면 마지막 stage 4 이벤트에 2축 판단(`personal`)이 함께 실린다.
    없으면 종전 이벤트 그대로다.

    `budget_seconds` 는 테스트가 예산을 짧게 줄 수 있게 하는 구멍이다. 운영에서는
    항상 `settings.advice_budget_seconds` 다.
    """
    graph = get_graph()
    budget = settings.advice_budget_seconds if budget_seconds is None else budget_seconds
    started = time.monotonic()

    # `updates` 모드는 **그 노드가 바꾼 것만** 준다. 최종 판단 이벤트에는 여러 노드가
    # 나눠 채운 값이 함께 필요하므로(종목·의견·판단) 여기서 누적한다.
    #
    # 판단을 그때그때 안 내보내고 모아 두는 이유: 판단은 `decide` 가 만들지만 그 뒤에
    # `verify` 가 물릴 수 있다. `decide` 에서 바로 흘리면 **검증에 걸려 폐기될 판단이
    # 이미 화면에 뜬 뒤**가 된다. 확정되는 노드(store_result·force_fallback·replay)에서
    # 한 번만 낸다.
    stock_ref: StockRef | None = None
    opinions: list[AgentOpinion] = []
    latest: dict = {}
    emitted_stages: set[int] = set()
    decided = False

    try:
        # **상대형 `timeout` 을 쓴다(절대형 `timeout_at` 이 아니다).** 절대형은
        # 이벤트 루프 시계를 받는데 상태의 `deadline` 은 `time.monotonic()` 기준이라,
        # 절대형을 쓰면 두 시계를 한 코드에서 섞게 된다. 상대형이면 비교 지점이
        # 아예 없다 (`graph/state.seconds_left` 주석).
        async with asyncio.timeout(budget):
            async for update in graph.astream(
                {
                    "symbol": symbol,
                    "listing": listing,
                    # 그래프는 남은 시간을 **상태로** 본다. 조건부 엣지가 "이 일을
                    # 한 번 더 할 것인가" 를 스스로 판단할 수 있어야, 하드 컷이
                    # 실제로 발동하는 일이 드물어진다.
                    "deadline": started + budget,
                    "soft_deadline": started + budget * settings.advice_soft_ratio,
                },
                stream_mode="updates",
            ):
                for node, raw in update.items():
                    # **아무것도 바꾸지 않은 노드는 `None` 으로 온다** (빈 dict 가 아니다).
                    # `store_result` 가 정확히 그런 노드다 — 캐시에 넣기만 하고 상태는
                    # 안 건드린다. 여기서 걸러 버리면 그 노드가 담당하는 stage 4 가
                    # 통째로 사라진다. 실측으로 확인한 동작이다.
                    patch: dict = raw if isinstance(raw, dict) else {}

                    # 판단·폴백 여부는 마지막 값이 이긴다 (재시도가 앞의 것을 덮는다).
                    #
                    # `metrics` 도 함께 모은다 — 적합도 계산의 종목 쪽 입력이다.
                    # `updates` 모드는 그 노드가 **바꾼 것만** 주므로, 지표를 만든
                    # 노드(collect_price)가 지나간 뒤에는 다시 오지 않는다.
                    for key in ("decision", "used_fallback", "metrics"):
                        if key in patch:
                            latest[key] = patch[key]

                    stock_data = patch.get("stock_data")
                    if stock_data is not None:
                        stock_ref = StockRef(
                            name=stock_data.name,
                            symbol=stock_data.symbol,
                            query=stock_data.query,
                        )

                    # 1) 진행 단계 — 같은 단계를 두 번 내지 않는다. 캐시 경로에서
                    #    check_fingerprint 와 replay 가 둘 다 stage 2 를 가리킨다.
                    stage = _STAGE_OF.get(node)
                    if stage is not None and stage not in emitted_stages:
                        emitted_stages.add(stage)
                        # 예산을 함께 싣는다 — 화면의 예고 문구가 이 값을 읽는다.
                        # 진행 이벤트에만 붙여도 충분하다: stage 1(캐시 경로면
                        # stage 2)이 언제나 가장 먼저 나가므로, 예고가 필요해지는
                        # 시점(예산의 70%)에는 이미 도착해 있다.
                        yield AdviceStreamEvent(stage=stage, budget_seconds=budget)

                    # 2) 에이전트 의견 — 끝나는 순서대로 흘린다.
                    for opinion in patch.get("opinions") or []:
                        opinions.append(opinion)
                        yield AdviceStreamEvent(stage=3, agent=opinion)

                    # 3) 최종 판단 — 확정되는 노드에서 한 번만.
                    if node in _DECISION_NODES and not decided and stock_ref is not None:
                        event = _decision_event(stock_ref, latest, opinions, profile)
                        if event is not None:
                            decided = True
                            yield event

    except asyncio.CancelledError:
        # 사용자가 끊었다(드로어 닫기 · 브라우저 이탈). 그대로 올린다 — 예산 초과와
        # 달리 **사용자에게 보여 줄 결론이 없다.** 화면도 이미 사라진 뒤다.
        raise
    except TimeoutError:
        # ⚠ 이 절은 반드시 `except Exception` **앞**에 있어야 한다.
        #   `TimeoutError ⊂ OSError ⊂ Exception` 이라 순서를 바꾸면 예산 착지가
        #   stage 0 에러로 새어 나가고, 이 변경이 없애려던 화면이 그대로 돌아온다.
        if decided:
            # 정상 경로가 이미 stage 4 를 냈는데(`store_result` 직후 END 로 가는
            # 도중 예산이 만료되는 창이 있다) 여기서 또 내면 화면에 판단이 두 번 뜬다.
            logger.info("%s 판단 직후 예산 만료 — 이미 낸 결론을 유지합니다", symbol)
            return

        metrics = latest.get("metrics")
        if stock_ref is None or metrics is None:
            # 주가조차 못 받았다. 규칙 기반 판단의 입력이 지표라, 지표가 없으면
            # 지어낼 수 없다 — 여기서는 정직하게 실패한다.
            yield AdviceStreamEvent(
                stage=0, error="분석이 제한 시간을 넘겨 중단되었습니다."
            )
            return

        # **여기가 이 변경의 요점이다.** 예산이 끝난 시점에 우리는 이미 지표를
        # 갖고 있고 규칙 기반 판단기도 갖고 있다. 그것을 버리고 "불러오지
        # 못했습니다" 를 내보내는 것은, 기다린 사람에게서 답을 빼앗는 일이다.
        # `force_fallback` 이 "지어낸 근거보다 근거 없는 보수적 판단이 낫다" 고
        # 정한 것과 같은 선택을 시간 초과에도 적용한다.
        logger.warning("%s 예산 %.0f초 초과 → 규칙 기반으로 착지합니다", symbol, budget)
        event = _decision_event(
            stock_ref,
            {"decision": fallback_decision(metrics), "metrics": metrics},
            opinions,
            profile,
            source="timeout",
        )
        if event is not None:
            yield event
    except Exception as exc:
        # 주가 조회 실패처럼 복구 불가능한 경우. 에이전트·판단 실패는 각 계층이
        # 이미 규칙 기반으로 흡수하므로 여기까지 오지 않는다 — 그래서 여기 닿는
        # 예외는 대부분 "Too Many Requests" 류의 공급자 메시지이고, 사용자에게
        # 원인을 그대로 보여주는 편이 "오류가 발생했습니다" 보다 유용하다
        # (`test_upstream_failure_becomes_stage_zero` 가 이 내용을 검증한다).
        logger.warning("AI 판단 스트림 실패 (%s)", exc)
        yield AdviceStreamEvent(stage=0, error=str(exc))
    finally:
        # **이 프로젝트의 첫 시간 계량기다.** `back/app` 전역에 소요 시간을 재는
        # 코드가 한 줄도 없어서, 예산 90초를 60초로 조여도 되는지 판단할 근거가
        # 없었다. 이 한 줄이 그 근거를 만든다 — 캐시 적중(1초대)과 실제 분석이
        # 같은 자리에 찍히므로 분포를 그대로 읽을 수 있다.
        #
        # `await` 를 두지 않는다. 소비자가 끊으면 여기에 취소가 꽂히는데, 그
        # 상태에서 await 하면 다시 취소되어 이 줄이 영영 안 찍힌다.
        logger.info("%s AI 판단 스트림 %.1f초", symbol, time.monotonic() - started)
