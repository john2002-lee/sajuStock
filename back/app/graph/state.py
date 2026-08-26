"""AI 판단 그래프의 상태 (RAG 2단계).

## 상태가 하는 일

LangGraph 에서 노드는 함수다. 인자로 **현재 상태 전체**를 받고, 반환값으로 **바꾸고
싶은 키만** 담은 dict 를 준다. 반환한 것이 상태에 병합되고 다음 노드가 그걸 본다.

    def collect_price(state: AdviceState) -> dict:
        ...
        return {"stock_data": data, "metrics": metrics}   # 이 둘만 갱신된다

그래서 이 파일은 "노드들이 주고받는 것의 목록" 이다. 함수 인자 목록을 그래프 전체가
공유하는 형태로 바꿔 놓은 것이라고 보면 된다.

## 리듀서 — 병렬 노드가 같은 키에 쓸 때

기본 병합은 **덮어쓰기**다. 마지막에 쓴 값이 남는다. 에이전트 3인을 병렬로 돌리면
셋이 동시에 `opinions` 에 쓰는데, 덮어쓰기면 **의견 하나만 남는다.**

`Annotated[list, operator.add]` 를 붙이면 병합 방식이 "더하기" 로 바뀐다. 각 노드가
자기 의견 하나를 리스트로 반환하고, LangGraph 가 그걸 이어 붙인다.

    저널리스트 → {"opinions": [의견A]}  ┐
    경제학자   → {"opinions": [의견B]}  ├→ opinions == [A, B, C]
    애널리스트 → {"opinions": [의견C]}  ┘

**이 한 줄이 없으면 조용히 의견 2개를 잃는다.** 오류도 안 난다 — 그래서 리듀서는
LangGraph 에서 가장 먼저 이해해야 하는 개념이다.
"""

import operator
import time
from typing import Annotated, TypedDict

from app.schemas.advice import AgentOpinion, InvestmentDecision
from app.schemas.rag import RetrievedDoc
from app.schemas.stock import (
    KrxListing,
    StockContent,
    StockFundamentals,
    StockHistory,
    StockMetrics,
)


class AdviceState(TypedDict, total=False):
    """그래프가 처음부터 끝까지 들고 다니는 것.

    `total=False` 는 "모든 키가 항상 있지는 않다" 는 뜻이다. 시작 시점에는 `symbol`
    하나뿐이고 노드가 돌면서 채워진다.
    """

    # --- 입력 ---
    symbol: str
    #: KRX 목록에서 확정한 종목. 그래프 안에서 DB 를 만지지 않으려고 미리 받아 둔다
    #: (제너레이터 안에서 세션을 잡으면 수십 초 동안 붙잡힌다 — 엔드포인트 주석).
    listing: KrxListing | None

    # --- 수집 단계 ---
    stock_data: StockHistory | None
    metrics: StockMetrics | None
    fundamentals: StockFundamentals | None
    content: StockContent | None

    # --- 검색 단계 ---
    #: 이번 회차의 검색 질의. `rewrite_query` 노드가 갈아끼운다.
    query: str
    documents: list[RetrievedDoc]
    #: 검색을 몇 번 돌렸는가. 루프를 멈추는 유일한 근거다 — 없으면 무한 루프다.
    retrieve_attempts: int
    #: 등급 판정이 남긴 사유. 로그·디버깅용이고 판단에는 안 쓴다.
    grade_note: str

    # --- 캐시 ---
    #: 캐시에서 꺼낸 판단. 있으면 그래프가 분석 단계를 통째로 건너뛴다.
    #: 이것을 상태에 두는 이유: "캐시를 썼는가" 가 분기 조건이고, 분기 조건은
    #: 상태에 있어야 조건 함수가 볼 수 있다 (advice_graph 주석 ③).
    cached_outcome: object | None
    from_cache: bool

    # --- 판단 단계 ---
    #: 병렬 노드 3개가 각자 하나씩 더한다 (파일 상단 리듀서 설명).
    opinions: Annotated[list[AgentOpinion], operator.add]
    decision: InvestmentDecision | None
    #: 규칙 기반으로 떨어졌는가. 화면의 '규칙 기반 판단' 배지가 이 값을 본다.
    used_fallback: bool
    #: 판단을 몇 번 만들었는가. 인용 검증 실패 시 재시도 상한에 쓴다.
    decide_attempts: int
    #: 검증이 남긴 사유.
    verify_note: str

    # --- 실행 예산 ---
    #
    # 노드가 아니라 **조건부 엣지**가 주로 읽는다. "이 일을 한 번 더 할 것인가" 는
    # 순서의 문제이고, 순서는 그래프의 소유이기 때문이다.

    #: `time.monotonic()` 기준 절대 시각. **없으면(None) 예산이 걸려 있지 않다.**
    #: 그래프를 직접 돌리는 테스트·스크립트가 종전 경로 그대로 돌아야 해서
    #: 기본값을 0 이나 현재 시각으로 두지 않는다 — 그러면 그것들이 "항상 예산
    #: 초과" 라는 조용한 형태로 죽는다.
    deadline: float | None
    #: 소프트 컷 지점(기본 예산의 60%). "지금부터 LLM 을 **한 번 더** 쓸 것인가" 를
    #: 가르는 선이다. 비율이 아니라 절대 시각으로 넣는 이유: 조건 함수가 총 예산이
    #: 얼마였는지 다시 알 필요가 없어진다.
    soft_deadline: float | None


def seconds_left(state: AdviceState, key: str = "deadline") -> float | None:
    """남은 예산(초). 키가 없으면 `None` = 예산 없음.

    **`asyncio.get_running_loop().time()` 을 쓰면 안 된다.** LangGraph 는 동기
    노드와 조건부 엣지 함수를 **워커 스레드**에서 돌리고(실측으로 확인했다),
    거기서 `get_running_loop()` 는 `RuntimeError` 다 — 그렇게 쓰면 `_after_grade`·
    `_after_verify`·`grade_documents`·`verify` 가 매 실행 터진다.
    `time.monotonic()` 은 스레드와 무관하다.

    그리고 이 값은 `asyncio.timeout` 의 loop 시계와 **비교되지 않는다** —
    예산 컨텍스트 매니저가 절대형(`timeout_at`)이 아니라 상대형(`timeout`)이라
    두 시계가 만나는 지점이 코드에 아예 없다 (`services/advice_stream`).
    """
    at = state.get(key)
    return None if at is None else at - time.monotonic()


def is_past(state: AdviceState, key: str = "deadline") -> bool:
    """그 선을 이미 넘겼는가. 예산이 없으면 언제나 False 다."""
    left = seconds_left(state, key)
    return left is not None and left <= 0
