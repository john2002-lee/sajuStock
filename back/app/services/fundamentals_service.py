"""재무 · 밸류에이션 서비스 (명세 6.3). 종목별 TTL 캐시를 소유한다.

`market_service`의 스냅샷 캐시와 같은 계열이지만 세 가지가 다르다.

- **키가 종목별이다.** 그래서 락도 종목별이다. 전역 락 하나면 서로 다른 종목을 보는
  두 사용자가 1~2초씩 줄을 선다.
- **미스는 블로킹이다.** 등락률 스캔은 7초라 stale-while-revalidate 가 유일한 답이었지만
  이쪽은 1~2초로 프런트의 5초 예산 안이고, 임의 심볼에는 워밍업 경로가 없어 배경 갱신을
  택하면 첫 조회가 항상 빈 객체가 된다.
- **제거 정책이 있다.** 스냅샷은 하나뿐이라 필요 없었지만 여기는 임의 심볼이 키다.

프로세스 메모리에만 있다. 재시작하면 비고, 다음 조회가 다시 채운다.
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.integrations.yfinance.fundamentals import fetch_stock_fundamentals
from app.schemas.stock import StockFundamentals

logger = logging.getLogger(__name__)

_cache: dict[str, tuple[datetime, StockFundamentals]] = {}
_locks: dict[str, asyncio.Lock] = {}


def _is_fresh(fetched_at: datetime) -> bool:
    return datetime.now(UTC) - fetched_at < timedelta(
        seconds=settings.stock_fundamentals_ttl_seconds
    )


def _lock_for(symbol: str) -> asyncio.Lock:
    """종목별 락. racy 해 보이지만 아니다.

    `setdefault` 의 조회와 삽입 사이에 `await` 가 없고 asyncio 는 단일 스레드라
    다른 코루틴이 끼어들 지점이 없다. 여기에 `await` 를 넣는 리팩터링은 진짜 경쟁
    상태를 만든다 — `test_concurrent_calls_collapse_to_one_fetch` 가 그 가드다.
    """
    return _locks.setdefault(symbol, asyncio.Lock())


def _evict_if_needed() -> None:
    """상한을 넘으면 가장 오래된 항목부터 버린다."""
    limit = settings.stock_fundamentals_cache_size
    while len(_cache) > limit:
        oldest = min(_cache, key=lambda key: _cache[key][0])
        del _cache[oldest]
        _locks.pop(oldest, None)


async def get_fundamentals(symbol: str) -> StockFundamentals:
    """이미 해석된 심볼의 재무·밸류에이션. 캐시 미스면 공급자를 기다린다.

    `/stocks/content` 와 같은 계약이다 — 호출자가 `/stocks/history` 응답의 `symbol` 을
    그대로 넘긴다. 별칭(`삼성전자`)을 넘기면 빈 응답이 그 키로 캐시되지만 무해하다.
    """
    cached = _cache.get(symbol)
    if cached is not None and _is_fresh(cached[0]):
        return cached[1]

    async with _lock_for(symbol):
        # 락을 기다리는 동안 다른 요청이 이미 채웠을 수 있다.
        cached = _cache.get(symbol)
        if cached is not None and _is_fresh(cached[0]):
            return cached[1]

        try:
            # yfinance는 동기 블로킹 라이브러리 → 이벤트 루프를 막지 않도록 스레드로 넘긴다.
            fundamentals = await asyncio.to_thread(fetch_stock_fundamentals, symbol)
        except Exception:
            # 만료된 값이라도 있으면 그걸 낸다. 갱신 실패가 화면을 비우면 안 된다.
            if cached is not None:
                logger.warning(
                    "%s 재무 갱신 실패 — 직전 스냅샷을 유지합니다", symbol, exc_info=True
                )
                return cached[1]
            # 캐시에 남길 것이 없다 — `_evict_if_needed` 가 이 락을 청소할 일이 영영
            # 없으므로 여기서 직접 지운다. 안 지우면 실패하는 임의 심볼마다 락 객체가
            # 프로세스 수명 내내 쌓인다.
            _locks.pop(symbol, None)
            raise

        _cache[symbol] = (datetime.now(UTC), fundamentals)
        _evict_if_needed()
        return fundamentals


async def get_fundamentals_or_none(symbol: str) -> StockFundamentals | None:
    """AI 판단 경로용. 공급자 장애가 분석 전체를 죽이지 않도록 예외를 삼킨다.

    `get_fundamentals` 는 첫 조회 실패를 그대로 올린다(엔드포인트는 503 이 정직하다).
    반면 에이전트 컨텍스트는 밸류에이션이 없어도 성립하므로 여기서 `None` 으로 접는다.
    """
    try:
        return await get_fundamentals(symbol)
    except Exception:
        logger.warning("%s 재무 조회 실패 — AI 컨텍스트에서 제외합니다", symbol, exc_info=True)
        return None
