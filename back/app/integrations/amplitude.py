"""Agent Analytics 경계 (Amplitude).

**앱 전체에서 이 파일 하나만 `amplitude_ai` 를 import 한다** — 옆의 `llm.py` 가
LLM SDK 에 대해 지키는 것과 같은 규칙이고, 이유도 같다. 계측을 걷어내거나
프로바이더를 바꿀 때 고칠 곳이 한 군데다.

## 왜 프로바이더 래퍼를 쓰지 않는가

`amplitude_ai` 는 `Gemini` 래퍼(= `wrap(genai_client)`)를 제공하지만 **이 앱에는
쓸 수 없다.** 래퍼는 동기 `client.generate_content` 만 감싸고, `.aio` 는
`__getattr__` 로 원본 클라이언트에 그대로 넘긴다 (`providers/gemini.py` 끝의
`TODO: Add async Gemini wrapper`). 실측:

    wrap(raw).aio.models.generate_content.__func__ is raw.aio.models.generate_content.__func__
    # True — 즉 감싸지지 않았다

`llm.py` 는 100% `client.aio` 경로다. 래퍼를 붙였다면 **에러 하나 없이 이벤트가
0건**이었을 것이다. 그래서 SDK 문서가 래퍼 없는 경로에 지시하는 대로 수동 추적
(`track_ai_message`)을 쓴다. 호출 경계가 `llm.py` 하나뿐이라 수동이어도 빠지는
호출이 없다.

## 두 도메인이 본문 수집 정책을 달리한다

  * 주식 — `full` + PII 마스킹. 프롬프트가 공개 종목 정보라 본문을 봐야 판단
    근거를 되짚을 수 있다.
  * 사주 — `metadata_only`. **생년월일시는 민감정보이고**, 이 저장소는 이미 그
    판단을 내려 두었다 (`services/saju_service.read_chart` 는 예외 메시지에서도
    그 값을 뺀다). 내장 마스킹은 이메일·전화·카드·SSN 기준이라 생년월일시를
    걸러 주지 않는다 — 그러므로 본문을 아예 보내지 않는다. 토큰·지연·비용만 남는다.

`content_mode` 는 `AmplitudeAI` 인스턴스 단위라 인스턴스를 둘 두고, 기반
`Amplitude` 클라이언트(전송·배치)는 하나를 공유한다.

## 세션은 contextvar 로 흐른다

`llm.py` 는 자기가 주식 판단에 불렸는지 사주 리포트에 불렸는지 모른다 — 알면
경계가 아니다. 그래서 요청 진입점이 `session()` 으로 세션을 열면 그 `Session`
객체가 contextvar 에 실리고, `llm.py` 는 `active_session()` 으로 꺼내 쓴다.
세션이 어느 `AmplitudeAI` 에서 났느냐가 곧 content_mode 라, 이 한 번의 조회로
도메인별 정책이 자동으로 따라온다.

**세션이 없으면 조용히 아무것도 하지 않는다.** 배치 작업·테스트·워밍업이
`llm.py` 를 부르는 경로가 있고, 그때 계측을 강요할 이유가 없다.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from contextvars import ContextVar

from app.core.config import settings

logger = logging.getLogger(__name__)

#: 지금 열려 있는 세션. `llm.py` 가 읽는 유일한 상태다.
_active: ContextVar[object | None] = ContextVar("amplitude_ai_session", default=None)

#: 계측이 켜졌는가. 키가 없으면 아래 전부가 no-op 이다.
ENABLED: bool = bool((settings.amplitude_ai_api_key or "").strip())

_ai_full = None
_ai_metadata_only = None
_flush = None

#: 에이전트 핸들. 키가 없으면 전부 None 이고, `session()` 이 그것을 흡수한다.
STOCK_ADVICE = None
SAJU_REPORT = None
#: 주식 오케스트레이터의 자식들. `graph/nodes.py` 의 노드 이름과 1:1 로 맞춘다 —
#: 대시보드에서 보이는 이름이 코드에서 찾을 수 있는 이름이어야 한다.
STOCK_CHILDREN: dict[str, object] = {}


_amplitude = None

if ENABLED:
    from amplitude import Amplitude
    from amplitude_ai import AIConfig, AmplitudeAI

    _amplitude = Amplitude(settings.amplitude_ai_api_key or "")

    # 본문까지 수집(+PII 마스킹). 주식 판단 전용이다.
    _ai_full = AmplitudeAI(
        amplitude=_amplitude,
        config=AIConfig(content_mode="full", redact_pii=True),
    )
    # 본문 없이 토큰·지연·비용만. 사주 전용 (위 "두 도메인" 절).
    _ai_metadata_only = AmplitudeAI(
        amplitude=_amplitude,
        config=AIConfig(content_mode="metadata_only"),
    )

    STOCK_ADVICE = _ai_full.agent(
        "stock-advice",
        description="종목 하나에 대한 멀티 에이전트 투자 판단을 조율한다",
    )
    # 이름은 `graph/nodes.py` 의 노드와 같다.
    STOCK_CHILDREN = {
        name: STOCK_ADVICE.child(name, description=desc)
        for name, desc in (
            ("journalist", "뉴스·공시에서 사실을 추린다"),
            ("economist", "거시·업황 관점의 의견을 낸다"),
            ("analyst", "재무·밸류에이션 관점의 의견을 낸다"),
            ("decision", "세 의견을 모아 최종 투자 판단을 낸다"),
            ("query-rewriter", "RAG 검색이 실패했을 때 질의를 다시 쓴다"),
        )
    }
    SAJU_REPORT = _ai_metadata_only.agent(
        "saju-report",
        description="사주 리포트를 생성한다 (본문 미수집 — 생년월일시는 민감정보)",
    )

    def _flush_impl() -> None:
        # **동기 함수다.** 실측: `AmplitudeAI.flush()` 는 코루틴이 아니라
        # `list[Future]` 를 돌려준다 (전송은 배경 스레드가 이어서 한다). SDK 문서의
        # `await ai.flush()` 를 그대로 옮겼다가 `TypeError: object list can't be used
        # in 'await' expression` 을 만났고, 그것이 `session()` 의 except 에 먹혀
        # **flush 가 매번 조용히 실패하는** 상태였다.
        #
        # 두 `AmplitudeAI` 가 **같은** `Amplitude` 를 공유하므로(위 생성부) 각각
        # flush 하면 같은 버퍼를 두 번 비운다 — 배치가 무의미해진다. 공유
        # 클라이언트에 한 번만 부른다.
        _amplitude.flush()

    _flush = _flush_impl


def _reset(token) -> None:
    """contextvar 를 되돌린다. **실패해도 요청을 죽이지 않는다.**

    `session()`·`child()` 는 비동기 제너레이터이고, 그것들은 자기 컨텍스트를 갖지
    않는다(PEP 568 미구현). 그래서 set 과 reset 이 같은 컨텍스트에서 도는 것은
    누가 `__anext__` 를 몰아주느냐에 달려 있다 — 취소된 SSE 제너레이터가
    `loop.shutdown_asyncgens()` 나 GC 로 마무리되면 다른 컨텍스트에서 reset 이
    돌아 `ValueError: Token was created in a different Context` 가 난다.
    """
    try:
        _active.reset(token)
    except ValueError:
        # 토큰이 다른 컨텍스트 것이면 되돌릴 것도 없다 — 그 컨텍스트는 이미 사라졌다.
        _active.set(None)


def active_session():
    """지금 열린 세션. 없으면 None — 호출부는 그것을 정상으로 다뤄야 한다."""
    return _active.get()


@asynccontextmanager
async def session(
    agent,
    *,
    user_id: str | None,
    session_id: str,
) -> AsyncIterator[object | None]:
    """세션 하나를 열고 contextvar 에 싣는다.

    **계측 실패가 요청을 죽이지 않는다.** 분석은 부가 기능이고, Amplitude 가
    느리거나 죽었다고 AI 판단이 실패하면 그건 계측이 아니라 장애다. 그래서 이
    컨텍스트는 예외를 삼키고 로그만 남긴다 — 단, 감싼 본문의 예외는 그대로
    올려보낸다 (그건 진짜 실패다).

    `flush` 를 `finally` 에 두는 것은 선택이 아니다. FastAPI 는 장수명 프로세스라
    세션 컨텍스트가 자동 flush 하지 않는다 — 없으면 이벤트가 메모리에 쌓였다가
    프로세스 재시작과 함께 사라진다. 에러도 로그도 없이 사라지는 종류다.
    """
    if agent is None:
        yield None
        return

    try:
        # `idle_timeout_minutes=-1` 은 만료를 끄는 값이다 (SDK `client.py` 주석).
        # 이 앱의 session_id 는 (소유자, 종목) 으로 **영구**하고 요청마다 열고 닫힌다 —
        # 기본 타임아웃을 두면 다음 요청이 이미 종료·보강된 대화를 되살리는 꼴이 된다.
        cm = agent.session(
            user_id=user_id, session_id=session_id, idle_timeout_minutes=-1
        )
        entered = await cm.__aenter__()
    except Exception:
        # `__aenter__` 는 OTEL 태그를 세우다 던질 수 있다. 계측이 요청을 죽이면
        # 그건 계측이 아니라 장애다.
        logger.warning("Amplitude 세션을 열지 못했습니다", exc_info=True)
        yield None
        return

    token = _active.set(entered)
    try:
        yield entered
    finally:
        _reset(token)
        try:
            await cm.__aexit__(None, None, None)
        except Exception:
            logger.warning("Amplitude 세션을 닫지 못했습니다", exc_info=True)
        if _flush is not None:
            try:
                _flush()
            except Exception:
                logger.warning("Amplitude flush 에 실패했습니다", exc_info=True)


@asynccontextmanager
async def child(name: str) -> AsyncIterator[object | None]:
    """열린 주식 세션 안에서 자식 에이전트로 위임한다.

    `STOCK_CHILDREN` 에 없는 이름이거나 세션이 안 열려 있으면 그냥 통과한다 —
    계측이 꺼진 상태에서도 호출부가 분기 없이 같은 코드를 쓰게 하기 위해서다.
    """
    parent = _active.get()
    target = STOCK_CHILDREN.get(name)
    if parent is None or target is None:
        yield None
        return

    # **`yield` 를 `except` 안에 두면 안 된다.** 그렇게 쓰면 감싼 본문이 던진
    # 예외를 여기서 삼키고 다시 yield 하게 되어, 호출부는 진짜 원인 대신
    # `RuntimeError: generator didn't stop after athrow()` 를 받는다. 실측으로
    # 확인했고, `nodes.py` 의 `질의 재작성 실패 (...)` 로그가 원인을 잃는 경로였다.
    #
    # 그래서 try 는 **위임을 얻는 동작만** 감싼다. 본문의 예외는 그대로 올려보낸다.
    try:
        cm = parent.arun_as(target)  # type: ignore[attr-defined]
        entered = await cm.__aenter__()
    except Exception:
        logger.warning("Amplitude 자식 에이전트 위임에 실패했습니다 (%s)", name, exc_info=True)
        yield None
        return

    token = _active.set(entered)
    try:
        yield entered
    finally:
        _reset(token)
        try:
            await cm.__aexit__(None, None, None)
        except Exception:
            logger.warning(
                "Amplitude 자식 에이전트를 닫지 못했습니다 (%s)", name, exc_info=True
            )


async def stream_within(
    agent,
    *,
    user_id: str | None,
    session_id: str,
    source,
):
    """제너레이터가 **다 소비될 때까지** 세션을 열어 둔다.

    SSE 경로가 이것을 필요로 한다. 엔드포인트 함수 본문에서 `session()` 을 열면
    `StreamingResponse` 를 반환하는 순간 컨텍스트가 닫히는데, LLM 호출은 그
    **뒤에** 스트림이 소비되면서 일어난다 — 즉 이벤트가 세션 밖에서 나거나
    (`active_session()` 이 None 이라) 아예 나지 않는다.

    비동기 제너레이터는 자기 컨텍스트를 따로 갖지 않으므로(PEP 568 미구현)
    여기서 세운 contextvar 가 `stream_advice` 의 프레임까지 그대로 보인다 —
    이 방식이 성립하는 이유다.
    """
    async with session(agent, user_id=user_id, session_id=session_id):
        async for item in source:
            yield item


async def shutdown() -> None:
    """남은 이벤트를 보낸다. `app/main.py` lifespan 이 종료 때 부른다."""
    if _flush is None:
        return
    try:
        _flush()
    except Exception:
        logger.warning("종료 flush 에 실패했습니다", exc_info=True)


__all__ = [
    "ENABLED",
    "SAJU_REPORT",
    "STOCK_ADVICE",
    "STOCK_CHILDREN",
    "active_session",
    "child",
    "session",
    "stream_within",
    "shutdown",
]
