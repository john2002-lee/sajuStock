"""AI 판단 그래프 배선 (RAG 2단계).

## 왜 그래프인가 — 1단계와 무엇이 다른가

1단계(`services/advice_stream.py`)는 **선형 코드**였다.

    주가 → 뉴스 → 검색 → 에이전트 3인 → 판단

읽기는 쉽지만 두 가지를 표현할 수 없었다.

1. **검색이 부실하면 질의를 고쳐 다시 찾는다** — 선형 코드에서는 `while` 과 카운터를
   손으로 관리해야 하고, 그 조건이 함수 중간에 묻힌다.
2. **판단이 없는 근거를 인용하면 다시 만든다** — 마찬가지로 `for attempt in range(2)`
   같은 것이 판단 로직과 뒤섞인다.

그래프로 옮기면 그 둘이 **코드가 아니라 구조**가 된다. 아래 `add_conditional_edges`
세 줄이 "언제 되돌아가는가" 의 전부이고, 노드는 자기 일만 한다.

## 전체 모양

```
                    START
                      │
                 collect_price          주가·지표 (실패하면 여기서 끝)
                      │
                collect_context         뉴스·재무 (병렬) · 첫 질의 생성
                      │
              ┌──▶ retrieve             색인(첫 회차만) + 하이브리드 검색
              │       │
              │  grade_documents        문서가 충분한가
              │       │
              │  ┌────┴────┐
              └──┤ 부족    │ 충분 ─────────┐
       rewrite_query        │              │
       (최대 2회)           │              │
                            ▼              ▼
              ┌────────────┬──────────────┬────────────┐
              ▼            ▼              ▼            │  ← 병렬 fan-out
          journalist    economist      analyst         │
              └────────────┴──────────────┴────────────┘
                            │                             ← fan-in (리듀서가 합침)
                          decide                          최종 판단 (구조화 출력)
                            │
                         verify                           본문이 없는 D번호를 인용했나
                            │
                      ┌─────┴─────┐
                 어긋남 │           │ 정상
                      │           ▼
              (재시도 1회)        END
                      │
                 decide 로 복귀 → 또 어긋나면 force_fallback → END
```

## 알아 둘 것 셋

**① 병렬은 엣지를 여러 개 그으면 된다.** `add_edge("grade", "journalist")` 를 세 번
그으면 셋이 동시에 시작한다. 그리고 셋 다 끝나야 `decide` 가 시작한다 — LangGraph 가
**들어오는 엣지를 전부 기다린다.** `asyncio.gather` 를 손으로 쓰지 않는다.

**② 병렬 노드가 같은 키에 쓰려면 리듀서가 필요하다.** `state.py` 의
`Annotated[list, operator.add]` 가 그것이고, 없으면 의견 하나만 남는다.

**③ 루프의 종료 조건은 상태에 있어야 한다.** `retrieve_attempts` 를 상태에 넣어 두고
조건 함수가 그걸 본다. 함수 밖 변수로 세면 같은 그래프를 동시에 두 번 돌릴 때 섞인다.

## 체크포인터를 붙이지 않은 이유

LangGraph 는 `AsyncPostgresSaver` 같은 체크포인터로 상태를 저장해 **중단된 실행을
이어서** 할 수 있다. 대화형 에이전트에는 필수다 — 사용자가 다음 턴에 무엇을 말할지
모르니 이전 상태가 남아 있어야 한다.

이 그래프는 **한 번에 끝나는 배치**다. 요청이 들어오면 30초 안에 판단까지 내고 끝나며,
"이어서" 할 것이 없다. 붙이면 노드마다 Postgres 왕복이 추가되어 그 30초가 늘어난다.
같은 이유로 스레드 ID 도 없다.

나중에 "분석을 중간에 멈췄다가 재개" 나 "판단 근거를 사후에 열어보기" 가 필요해지면
그때 `compile(checkpointer=...)` 한 줄이면 된다. 지금 붙이는 것은 비용만 내는 일이다.
"""

import logging

from langgraph.graph import END, START, StateGraph

from app.core.config import settings
from app.graph import nodes
from app.graph.state import AdviceState, is_past

logger = logging.getLogger(__name__)


#: 병렬로 도는 하위 에이전트 노드 이름.
_ANALYST_NODES = ["journalist", "economist", "analyst"]


def _after_cache(state: AdviceState) -> str:
    """캐시가 맞았으면 분석을 통째로 건너뛴다.

    조건부 엣지 **하나를 두 자리에서 재사용**한다. 두 지점의 질문이 같기 때문이다 —
    "캐시를 썼는가". 다른 것은 갈 곳(`collect_context` / `retrieve`)뿐이고, 그건
    배선이 정한다. 조건 함수는 어디로 가는지 몰라도 된다.
    """
    return "replay" if state.get("from_cache") else "continue"


def _after_grade(state: AdviceState) -> str | list[str]:
    """검색 결과를 받아들일지, 질의를 고쳐 다시 찾을지.

    **문자열 대신 리스트를 돌려주면 그 노드들이 동시에 시작한다.** 이것이 LangGraph
    에서 조건부 분기와 병렬 fan-out 을 함께 쓰는 방법이다 — 같은 노드에 조건부 엣지를
    여러 번 걸 수는 없다(`Branch with name ... already exists`).

    **상한을 먼저 본다.** 문서가 원래 없는 종목(신규 상장·소형주)에서는 질의를 아무리
    고쳐도 만족할 수 없고, 그때마다 임베딩 1회 + 재작성 LLM 1회가 나간다.
    """
    documents = state.get("documents") or []
    attempts = state.get("retrieve_attempts", 0)

    # RAG 가 꺼져 있으면 질의를 고칠 이유가 없다. 검색이 항상 빈손이라 재작성은
    # **LLM 을 쓰면서 아무것도 바꾸지 못한다** — 상한에 닿을 때까지 그 짓을 반복한다.
    # (테스트가 이걸 잡았다: RAG 없이 도는 단위 테스트가 실제 API 를 쳤다.)
    if not settings.rag_enabled:
        return _ANALYST_NODES

    if len(documents) >= nodes.MIN_DOCUMENTS:
        return _ANALYST_NODES
    if attempts > nodes.MAX_REWRITES:
        logger.info(
            "%s 검색 재시도 상한 도달 (문서 %d건) → 있는 것으로 진행",
            state.get("symbol"),
            len(documents),
        )
        return _ANALYST_NODES

    # 예산의 60% 를 넘겼으면 질의를 고치지 않는다. 재작성 한 바퀴는 LLM 1회 +
    # 임베딩 1회 + 검색 1회이고, 그것이 끝나도 **판단 LLM 이 아직 남아 있다.**
    # 남은 40% 로 그 둘을 다 해내는 쪽에 거는 것보다, 있는 문서로 판단까지 가서
    # 답을 내는 편이 낫다 — 예산을 다 쓰고 규칙 기반으로 착지하면 이 종목의
    # 문서를 하나도 못 쓴 채로 끝난다.
    if is_past(state, "soft_deadline"):
        logger.info("%s 예산 60%% 초과 → 질의 재작성 생략", state.get("symbol"))
        return _ANALYST_NODES

    return "rewrite_query"


def _after_verify(state: AdviceState) -> str:
    """인용이 어긋났으면 판단만 다시 만든다.

    검색까지 되돌아가지 않는 이유: 문제는 검색이 아니라 **판단 본문**이다. 같은 문서로
    다시 만들면 대개 고쳐진다. 그래도 안 되면 규칙 기반으로 내린다 — 지어낸 근거가
    붙은 그럴듯한 판단보다 근거 없는 보수적 판단이 낫다.
    """
    note = state.get("verify_note", "")
    if not note.startswith("없는 근거"):
        return "done"

    if state.get("decide_attempts", 0) > nodes.MAX_DECIDE_RETRIES:
        return "fallback"

    # 예산은 **다시 만들지 말지**만 가른다. "시간이 없으니 그냥 쓰자" 로 `done` 을
    # 돌려주면 지어낸 D번호가 화면에 나가고 캐시에까지 들어간다 — 이 함수가 있는
    # 이유 자체가 사라진다. 시간이 없으면 규칙 기반으로 내린다.
    if is_past(state, "soft_deadline"):
        logger.info(
            "%s 예산이 얼마 남지 않아 판단 재시도 대신 규칙 기반으로 내립니다 (%s)",
            state.get("symbol"),
            note,
        )
        return "fallback"

    logger.info("%s 판단 재시도 (%s)", state.get("symbol"), note)
    return "retry"


def build_graph():
    """그래프를 조립해 컴파일한다. 컴파일 결과는 재사용 가능한 실행기다."""
    builder = StateGraph(AdviceState)

    builder.add_node("collect_price", nodes.collect_price)
    builder.add_node("check_cache", nodes.check_cache)
    builder.add_node("collect_context", nodes.collect_context)
    builder.add_node("check_fingerprint", nodes.check_fingerprint)
    builder.add_node("replay", nodes.replay)
    builder.add_node("store_result", nodes.store_result)
    builder.add_node("retrieve", nodes.retrieve)
    builder.add_node("grade_documents", nodes.grade_documents)
    builder.add_node("rewrite_query", nodes.rewrite_query)
    builder.add_node("journalist", nodes.journalist)
    builder.add_node("economist", nodes.economist)
    builder.add_node("analyst", nodes.analyst)
    builder.add_node("decide", nodes.decide)
    builder.add_node("verify", nodes.verify)
    builder.add_node("force_fallback", nodes.force_fallback)

    # --- 수집 + 캐시 (7회차) ---
    #
    # 캐시가 두 번 갈린다. TTL 안이면 뉴스 조회도 건너뛰고(①), TTL 이 지나도 기사가
    # 그대로면 LLM 만 건너뛴다(②). 그 둘이 여기 조건부 엣지 두 개로 그대로 보인다 —
    # 서비스 함수 안에 숨겨 두면 "왜 어떤 요청은 3초에 끝나는가" 를 그림에서 못 읽는다.
    builder.add_edge(START, "collect_price")
    #
    # 여기서는 노드 이름 대신 **경로 맵**을 쓴다. 조건 함수는 "replay/continue" 라는
    # 뜻만 돌려주고, 그 뜻이 어느 노드인지는 자리마다 다르다(`collect_context` vs
    # `retrieve`). 덕분에 같은 조건 함수를 두 자리에서 그대로 재사용한다.
    builder.add_edge("collect_price", "check_cache")
    builder.add_conditional_edges(
        "check_cache", _after_cache, {"replay": "replay", "continue": "collect_context"}
    )
    builder.add_edge("collect_context", "check_fingerprint")
    builder.add_conditional_edges(
        "check_fingerprint", _after_cache, {"replay": "replay", "continue": "retrieve"}
    )
    builder.add_edge("replay", END)

    # --- 검색 루프 ---
    builder.add_edge("retrieve", "grade_documents")
    # `_after_grade` 가 노드 **이름**(또는 이름 리스트)을 그대로 돌려주므로 맵 대신
    # "갈 수 있는 곳 목록" 을 넘긴다. 이 목록은 실행에 쓰이지 않고 그래프를 그릴 때
    # 쓰인다 — 없으면 draw 가 분기를 못 그린다.
    builder.add_conditional_edges(
        "grade_documents", _after_grade, ["rewrite_query", *_ANALYST_NODES]
    )
    builder.add_edge("rewrite_query", "retrieve")  # ← 루프를 닫는 엣지

    # --- fan-in: 셋이 모두 끝나야 decide 가 시작한다 ---
    #
    # `asyncio.gather` 를 쓰지 않는다. LangGraph 는 **들어오는 엣지를 전부 기다렸다가**
    # 노드를 실행하므로, 엣지를 세 개 긋는 것만으로 "셋 다 끝나면" 이 표현된다.
    for name in _ANALYST_NODES:
        builder.add_edge(name, "decide")

    # --- 판단 검증 ---
    builder.add_edge("decide", "verify")
    builder.add_conditional_edges(
        "verify",
        _after_verify,
        {"retry": "decide", "fallback": "force_fallback", "done": "store_result"},
    )
    builder.add_edge("force_fallback", "store_result")
    # 새로 만든 것만 캐시에 넣는다. `replay` 는 여기로 오지 않는다 — 캐시에서 꺼낸
    # 것을 다시 넣으면 `checked_at` 이 갱신되어 **기사가 바뀌어도 영원히 안 늙는다.**
    builder.add_edge("store_result", END)

    return builder.compile()


_graph = None


def get_graph():
    """컴파일된 그래프. 프로세스 수명 동안 재사용한다.

    컴파일은 배선을 검증하고 실행 계획을 만드는 일이라 요청마다 할 이유가 없다.
    그래프 자체는 상태를 안 들고 있어(상태는 실행마다 따로다) 공유해도 안전하다.
    """
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph
