"""SSE 하트비트 펌프 (`app/api/sse.py`).

## 왜 이 파일이 따로 있는가

여기서 고정하는 셋은 전부 **조용히** 깨지는 종류다. 스트림이 하트비트 간격마다
끝나도, 주석 프레임이 다음 판단을 삼켜도, 슬롯이 반납되지 않아도 — 예외는 나지
않는다. 화면에는 "판단을 받지 못했습니다" 하나가 뜨고, 원인은 어디에도 안 남는다.

엔드포인트 배선을 함께 도는 테스트는 DB(`client` 픽스처)가 필요해 이 기계에서
돌지 않는다. 그래서 펌프를 **순수 단위**로 떼어 여기서 덮는다.
"""

import asyncio
from collections.abc import AsyncIterator

import pytest

from app.api.sse import HEARTBEAT, sse_with_heartbeat
from app.schemas.advice import AdviceStreamEvent


async def _stream(*events: AdviceStreamEvent, delay: float = 0.0) -> AsyncIterator:
    for event in events:
        if delay:
            await asyncio.sleep(delay)
        yield event


async def test_quiet_stretch_gets_a_heartbeat_before_the_event() -> None:
    """조용한 구간에 주석 프레임이 먼저 나오고, 그 다음 이벤트가 멀쩡히 온다."""
    frames = [
        frame
        async for frame in sse_with_heartbeat(
            _stream(AdviceStreamEvent(stage=4), delay=0.25),
            heartbeat_seconds=0.05,
            on_finish=lambda: None,
        )
    ]

    assert HEARTBEAT in frames
    assert frames.index(HEARTBEAT) < len(frames) - 1  # 이벤트보다 먼저
    assert frames[-1].startswith(b"data: ")
    # 프런트 파서는 **프레임 단위**로 `data:` 를 본다. 주석이 빈 줄로 끝나지 않으면
    # 바로 다음 data 프레임이 통째로 버려진다 — 그게 stage 4 면 판단이 사라진다.
    assert HEARTBEAT.endswith(b"\n\n")
    assert b"\r" not in HEARTBEAT  # 두 파서 모두 `indexOf("\n\n")` 만 본다


async def test_stream_survives_far_past_the_heartbeat_interval() -> None:
    """하트비트가 스트림을 죽이지 않는다.

    이 테스트가 잡는 회귀는 하나뿐이지만 치명적이다. 하트비트를
    `wait_for(source.__anext__(), interval)` 로 구현하면 만료마다 현재 태스크가
    취소되고 그 취소가 제너레이터를 닫는다 — **모든 요청이 하트비트 간격에
    stage 1 하나만 내고 끝난다.** 그 구현에서 이 단언이 실패한다.
    """
    frames = [
        frame
        async for frame in sse_with_heartbeat(
            _stream(
                AdviceStreamEvent(stage=1),
                AdviceStreamEvent(stage=4),
                delay=0.12,
            ),
            heartbeat_seconds=0.02,  # 간격의 6배를 기다려야 이벤트가 온다
            on_finish=lambda: None,
        )
    ]

    data = [frame for frame in frames if frame.startswith(b"data: ")]
    assert len(data) == 2
    assert b'"stage":4' in data[-1]


async def test_on_finish_runs_once_on_normal_completion() -> None:
    calls = {"n": 0}

    frames = [
        frame
        async for frame in sse_with_heartbeat(
            _stream(AdviceStreamEvent(stage=4)),
            heartbeat_seconds=5.0,
            on_finish=lambda: calls.__setitem__("n", calls["n"] + 1),
        )
    ]

    assert len(frames) == 1
    assert calls["n"] == 1


async def test_on_finish_runs_when_the_consumer_hangs_up() -> None:
    """소비자가 끊어도 슬롯은 반납된다.

    반납이 안 되면 사용자가 드로어를 몇 번 여닫는 것만으로 동시 실행 상한이
    영구히 찬다 — 그 상태에서 서버는 멀쩡해 보이고 모두가 429 를 받는다.
    """
    calls = {"n": 0}
    pump = sse_with_heartbeat(
        _stream(AdviceStreamEvent(stage=1), AdviceStreamEvent(stage=4), delay=0.05),
        heartbeat_seconds=5.0,
        on_finish=lambda: calls.__setitem__("n", calls["n"] + 1),
    )

    assert await anext(pump) is not None  # 첫 프레임만 받고
    await pump.aclose()  # 끊는다

    assert calls["n"] == 1


async def test_producer_is_cancelled_when_the_consumer_hangs_up() -> None:
    """소비자가 끊으면 상류(LLM 호출)도 멈춘다.

    생산자를 그대로 두면 아무도 안 보는 판단이 끝까지 돌면서 토큰을 태운다.
    """
    closed = {"yes": False}

    async def watched() -> AsyncIterator:
        try:
            yield AdviceStreamEvent(stage=1)
            await asyncio.sleep(10)
            yield AdviceStreamEvent(stage=4)
        finally:
            closed["yes"] = True

    pump = sse_with_heartbeat(
        watched(), heartbeat_seconds=5.0, on_finish=lambda: None
    )
    await anext(pump)
    await pump.aclose()
    # 취소가 실제로 되감기는 데 한 틱이 필요하다.
    await asyncio.sleep(0.05)

    assert closed["yes"] is True


@pytest.mark.parametrize("stage", [1, 2, 3, 4])
async def test_frames_are_valid_sse(stage: int) -> None:
    """프레이밍 계약: `data: ` 로 시작하고 빈 줄로 끝난다."""
    frames = [
        frame
        async for frame in sse_with_heartbeat(
            _stream(AdviceStreamEvent(stage=stage)),
            heartbeat_seconds=5.0,
            on_finish=lambda: None,
        )
    ]

    assert frames[0].startswith(b"data: ")
    assert frames[0].endswith(b"\n\n")


async def test_a_producer_that_dies_without_a_marker_still_ends_the_stream() -> None:
    """생산자가 종료 표지를 못 남겨도 스트림은 끝난다.

    표지에만 의존하면, 그 표지를 남기는 코드가 실패하는 순간 소비자가 하트비트만
    내며 영원히 돈다 — 그동안 `on_finish` 도 안 불려 슬롯이 잠긴 채로 남는다.
    커넥션 하나가 프로세스 수명 내내 사는 형태의 누수라 사람이 알아채기 어렵다.
    """
    calls = {"n": 0}

    async def dies() -> AsyncIterator:
        yield AdviceStreamEvent(stage=1)
        raise RuntimeError("생산자 폭발")

    frames = [
        frame
        async for frame in sse_with_heartbeat(
            dies(),
            heartbeat_seconds=0.05,
            on_finish=lambda: calls.__setitem__("n", calls["n"] + 1),
        )
    ]

    assert frames[0].startswith(b"data: ")
    assert calls["n"] == 1  # 슬롯은 반납됐다
