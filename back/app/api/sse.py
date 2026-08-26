"""SSE 프레이밍 + 하트비트 펌프.

## 왜 여기인가

에이전트 구간에는 수십 초 동안 이벤트가 하나도 없다. 중간 프록시(nginx 의
`proxy_read_timeout` 기본값이 60초다)는 그것을 죽은 연결로 보고 끊는다. 그래서
주기적으로 SSE **주석 프레임**을 흘려 연결이 살아 있음을 알린다.

주석인 것이 중요하다. 이벤트로 만들면 프런트와의 4단계 계약에 "무시해야 하는 stage"
가 하나 늘고, 그 계약은 화면 코드 여러 곳이 읽는다. 주석은 SSE 명세상 파서가 버리는
것이라 계약이 그대로 남는다.

하트비트가 전송 계층에 있고 `advice_stream` 에 없는 이유도 같다 — "연결이 살아
있는가" 는 판단의 일부가 아니다.

## 큐를 쓰는 이유 — 이 구조 말고는 전부 조용히 깨진다

하트비트는 "이벤트와 시간 중 먼저 오는 것" 을 기다리는 일이라 태스크가 하나 더
필요하다. 그 태스크를 **어느 쪽에 두느냐**가 전부를 가른다.

**① 소비자 쪽에 두면 스트림이 하트비트 간격마다 죽는다.**
`await asyncio.wait_for(source.__anext__(), interval)` 로 쓰면, 만료될 때마다 현재
태스크가 취소된다. 그 취소는 **제너레이터 프레임 안에** 꽂히고 제너레이터가 닫힌다.
다음 `__anext__` 는 `StopAsyncIteration` 이다. 예산 1초·하트비트 0.1초로 재현했을
때 0.11초에 스트림이 끝났다 — 운영값(10초)이면 **모든 요청이 10초에 stage 1 하나만
내고 조용히 종료된다.** 에러도 안 난다.

**② 소비자가 `stream_advice()` 를 직접 `async for` 해도 안 된다.**
`stream_advice` 안의 `asyncio.timeout(예산)` 은 `__aenter__` 시점의 태스크를
취소하고, `__aexit__` 가 돌아야만 `CancelledError` → `TimeoutError` 변환이 일어난다.
그런데 제너레이터가 `yield` 에 파킹돼 있고 소비자가 소켓 쓰기(`await send(...)`)에
있는 동안 타이머가 터지면, 취소는 **소비자 프레임**에서 터진다. 변환이 일어나지
않으니 예산 착지(stage 4 폴백)가 나오지 않고 스트림이 그냥 잘린다. 재현했다.

**③ 그래서 태스크는 생산자 쪽에 둔다.** 생산자가 제너레이터를 소유하면 생산자의
서스펜션 지점이 전부 제너레이터 안이 되어(`put_nowait` 은 await 가 아니다) 예산
만료가 **항상** 제너레이터 프레임에서 터진다 — ②가 구조적으로 불가능해진다.
동시에 소비자는 예산 타이머에 취소되지 않으므로, 소켓에 쓰는 동안 타이머가 터져도
폴백 프레임을 잃지 않는다.

**큐는 반드시 무제한이어야 한다.** `maxsize` 를 주면 생산자가 `await queue.put()`
에서 제너레이터 **밖**에 파킹하고 ②가 그대로 되살아난다(실측에서 폴백이 유실됐다).
한 실행의 이벤트는 1+1+3+1 개라 쌓여 봐야 무의미하게 적다.
"""

import asyncio
import logging
from collections.abc import AsyncIterator, Callable

from app.schemas.advice import AdviceStreamEvent

logger = logging.getLogger(__name__)

#: SSE 주석 프레임. **빈 줄까지가 한 프레임이다.**
#:
#: `b": keep-alive\n"` 로 줄이면 프런트 파서(BFF 의 `proxyStream` · 브라우저의
#: `streamAdvice`)가 라인이 아니라 **프레임** 단위로 `startsWith("data:")` 를 보기
#: 때문에, 주석과 붙어 버린 바로 다음 data 프레임이 통째로 버려진다. 그게 stage 4
#: 면 판단이 사라진다. `\r\n\r\n` 도 안 된다 — 두 파서 모두 `indexOf("\n\n")` 만 본다.
HEARTBEAT = b": keep-alive\n\n"

#: 큐 종료 표지. `None` 을 쓰면 "이벤트가 None 일 수 있다" 는 오해를 만든다.
_DONE = object()


async def sse_with_heartbeat(
    source: AsyncIterator[AdviceStreamEvent],
    *,
    heartbeat_seconds: float,
    on_finish: Callable[[], None],
) -> AsyncIterator[bytes]:
    """이벤트를 SSE 프레임으로 바꾸면서, 조용한 구간에는 주석을 끼워 넣는다.

    `on_finish` 는 어떤 경로로 끝나든(정상 · 예외 · 클라이언트 절단) 정확히 한 번
    불린다. AI 판단에서는 동시 실행 슬롯 반납이 그것이다 — 반납이 안 되면 사용자가
    드로어를 몇 번 여닫는 것만으로 상한이 영구히 찬다.
    """
    queue: asyncio.Queue = asyncio.Queue()

    async def produce() -> None:
        try:
            async for event in source:
                queue.put_nowait(event)
        except Exception:
            # `stream_advice` 가 이미 stage 0 으로 흡수하지만, 계약이 깨졌을 때
            # 아무도 안 읽는 태스크 결과로 굳어 엉뚱한 요청 문맥에서 뒤늦게 찍히는
            # 것을 막는다.
            logger.exception("SSE 생산자가 예외로 멈췄습니다")
        finally:
            # 정상·취소·예외 어느 경로로 끝나든 소비자를 깨운다.
            queue.put_nowait(_DONE)

    producer = asyncio.create_task(produce())
    try:
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), heartbeat_seconds)
            except TimeoutError:
                # 생산자가 **종료 표지도 못 남기고** 끝난 경우를 여기서 걷는다.
                # 아래 `finally` 의 `put_nowait` 이 실패할 수 있는 형태로 이 파일을
                # 고치면(예: 큐에 maxsize 를 주면 QueueFull) 이 절이 없을 때
                # 소비자가 하트비트만 내며 **영원히** 돌고, 그동안 슬롯도 반납되지
                # 않는다 — 연결 하나가 프로세스 수명 내내 남는다. 회귀를 주입해
                # 실제로 그렇게 되는 것을 확인하고 넣은 가드다.
                if producer.done() and queue.empty():
                    logger.warning("SSE 생산자가 종료 표지 없이 끝났습니다")
                    break
                yield HEARTBEAT
                continue
            if item is _DONE:
                break
            yield f"data: {item.model_dump_json()}\n\n".encode()
    finally:
        # **이 finally 에는 `await` 를 두지 않는다.** 클라이언트가 끊으면 여기에
        # 취소가 꽂히는데, 취소 스코프 안에서 `await` 하면 즉시 다시 취소될 수
        # 있다. 그러면 `on_finish` 가 영영 안 불려 슬롯이 잠긴 채로 남는다.
        #
        # 생산자를 기다리지 않아도 안전하다: `cancel()` 만 걸어 두면 취소된
        # 태스크가 스스로 되감기고 LangGraph 가 노드 태스크를 정리한다(실측에서
        # 잔여 태스크 0). 슬롯 반납이 실제 정리보다 몇 ms 이른 것은 감수한다 —
        # 반납이 아예 안 되는 것보다 비교할 수 없이 낫다.
        on_finish()
        producer.cancel()


__all__ = ["HEARTBEAT", "sse_with_heartbeat"]
