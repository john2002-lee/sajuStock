"""재무 캐시 동작. 공급자 호출 횟수를 세어 캐시가 실제로 도는지 확인한다.

캐시가 없으면 종목 하나당 1~2초짜리 네트워크 왕복이 요청마다 발생한다. 여기서
고정하는 것은 '느려지지 않는다'가 아니라 **몇 번 부르는가**다.

`_cache`/`_locks` 초기화는 conftest 의 `reset_fundamentals_cache` 가 자동으로 한다.
"""

import asyncio

import pytest

from app.schemas.stock import StockFundamentals
from app.services import fundamentals_service


def _counting_fake(counter: dict[str, int], *, delay: float = 0.0):
    def _fake(symbol: str) -> StockFundamentals:
        counter[symbol] = counter.get(symbol, 0) + 1
        return StockFundamentals(symbol=symbol, per=21.06)

    return _fake


async def test_second_call_hits_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: dict[str, int] = {}
    monkeypatch.setattr(fundamentals_service, "fetch_stock_fundamentals", _counting_fake(calls))

    first = await fundamentals_service.get_fundamentals("005930.KS")
    second = await fundamentals_service.get_fundamentals("005930.KS")

    assert calls["005930.KS"] == 1
    assert first.per == second.per == 21.06


async def test_different_symbols_do_not_share_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    """키가 전역 하나면 여기서 걸린다."""
    calls: dict[str, int] = {}
    monkeypatch.setattr(fundamentals_service, "fetch_stock_fundamentals", _counting_fake(calls))

    await fundamentals_service.get_fundamentals("005930.KS")
    await fundamentals_service.get_fundamentals("000660.KS")

    assert calls == {"005930.KS": 1, "000660.KS": 1}


async def test_concurrent_calls_collapse_to_one_fetch(monkeypatch: pytest.MonkeyPatch) -> None:
    """같은 종목 동시 요청은 한 번만 공급자를 친다.

    종목별 락과 '락 획득 후 신선도 재확인'이 사는 지점이다. 둘 중 하나라도 빠지면
    호출이 3회가 된다.
    """
    calls: dict[str, int] = {}
    fake = _counting_fake(calls)

    def _slow(symbol: str) -> StockFundamentals:
        # to_thread 로 넘어가므로 실제로 겹친다.
        import time

        time.sleep(0.05)
        return fake(symbol)

    monkeypatch.setattr(fundamentals_service, "fetch_stock_fundamentals", _slow)

    results = await asyncio.gather(
        *(fundamentals_service.get_fundamentals("005930.KS") for _ in range(3))
    )

    assert calls["005930.KS"] == 1
    assert all(item.per == 21.06 for item in results)


async def test_expired_entry_is_refetched(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: dict[str, int] = {}
    monkeypatch.setattr(fundamentals_service, "fetch_stock_fundamentals", _counting_fake(calls))
    monkeypatch.setattr(fundamentals_service.settings, "stock_fundamentals_ttl_seconds", 0)

    await fundamentals_service.get_fundamentals("005930.KS")
    await fundamentals_service.get_fundamentals("005930.KS")

    assert calls["005930.KS"] == 2


async def test_refresh_failure_serves_stale(monkeypatch: pytest.MonkeyPatch) -> None:
    """갱신이 깨져도 직전 값을 낸다 — 화면이 갑자기 비면 안 된다."""
    monkeypatch.setattr(
        fundamentals_service,
        "fetch_stock_fundamentals",
        lambda symbol: StockFundamentals(symbol=symbol, per=21.06),
    )
    first = await fundamentals_service.get_fundamentals("005930.KS")
    assert first.per == 21.06

    def _boom(symbol: str) -> StockFundamentals:
        raise RuntimeError("공급자 장애")

    monkeypatch.setattr(fundamentals_service, "fetch_stock_fundamentals", _boom)
    monkeypatch.setattr(fundamentals_service.settings, "stock_fundamentals_ttl_seconds", 0)

    stale = await fundamentals_service.get_fundamentals("005930.KS")

    assert stale.per == 21.06


async def test_first_fetch_failure_propagates(monkeypatch: pytest.MonkeyPatch) -> None:
    """낼 만한 직전 값이 없으면 예외를 그대로 올린다 (엔드포인트는 503이 정직하다)."""

    def _boom(symbol: str) -> StockFundamentals:
        raise RuntimeError("공급자 장애")

    monkeypatch.setattr(fundamentals_service, "fetch_stock_fundamentals", _boom)

    with pytest.raises(RuntimeError):
        await fundamentals_service.get_fundamentals("005930.KS")

    # AI 판단 경로는 같은 실패를 None 으로 접는다.
    assert await fundamentals_service.get_fundamentals_or_none("005930.KS") is None


async def test_cache_evicts_oldest_over_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: dict[str, int] = {}
    monkeypatch.setattr(fundamentals_service, "fetch_stock_fundamentals", _counting_fake(calls))
    monkeypatch.setattr(fundamentals_service.settings, "stock_fundamentals_cache_size", 2)

    for symbol in ("A", "B", "C"):
        await fundamentals_service.get_fundamentals(symbol)

    assert len(fundamentals_service._cache) == 2
    assert "A" not in fundamentals_service._cache
