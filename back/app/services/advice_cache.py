"""AI 판단 결과 캐시 — 이 프로젝트에서 유일하게 돈이 새는 경로의 수도꼭지.

종목 하나를 분석하면 LLM 4회(에이전트 3 + 판단 1)가 나간다. 그런데 같은 종목을
새로고침하면 그 4회가 통째로 다시 나갔다. 재무 조회는 15분 TTL 캐시가 있는데
**정작 비싼 AI 판단만 캐시가 없었다.**

## 왜 단순 TTL 로는 부족한가

TTL 만 두면 두 요구가 충돌한다.

* 짧게 잡으면(1분) 비용이 거의 안 준다.
* 길게 잡으면(1시간) **악재 기사가 떠도 한 시간 동안 낡은 판단을 보여준다.**
  투자 판단에서 이건 캐시가 아니라 오보에 가깝다.

그래서 시간이 아니라 **입력이 바뀌었는지**로 무효화한다. 이 판단의 입력 중 실제로
자주 바뀌는 것은 뉴스·리포트뿐이다 — 주가는 판단을 뒤집을 만큼 안 움직이고,
재무는 분기 단위다. 그래서 뉴스·리포트 목록의 **지문(fingerprint)** 을 캐시 키에
함께 넣는다.

## 2계층으로 도는 이유

지문을 확인하려면 뉴스를 조회해야 하는데, 그 조회가 이 경로 응답 시간의 대부분을
차지한다(`StockContent` 주석: 측정치 95%). 매번 확인하면 LLM 은 아껴도 화면은 여전히
느리다. 그래서 확인 자체에도 유예를 둔다.

    요청 ──▶ ① TTL(기본 10분) 안인가?
                 예 → 캐시 반환. 네트워크 0회, LLM 0회
                 아니오 ↓
             ② 뉴스를 조회해 지문 비교
                 같다 → 캐시 반환 + 수명 연장. LLM 0회
                 다르다 → 다시 분석. LLM 4회

②에서 지문이 같으면 `checked_at` 만 갱신한다. "기사가 그대로면 판단도 그대로" 라는
전제를 명시적으로 쓰는 것이고, 덕분에 조용한 종목은 하루 종일 LLM 을 한 번도 더
쓰지 않는다.

프로세스 메모리에만 있다. 재시작하면 비고 다음 요청이 다시 채운다 —
`fundamentals_service` 와 같은 자세다.
"""

import asyncio
import hashlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.schemas.advice import AgentOpinion, InvestmentDecision
from app.schemas.stock import StockContent

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AdviceOutcome:
    """LLM 이 만들어낸 것만 담는다.

    `StockAdviceResponse` 통째로 캐시하지 않는 이유: 그 안의 `stock_data` 는 504봉이라
    종목 256개면 수십 MB가 되고, 무엇보다 봉 데이터는 자기 캐시가 따로 있어 여기서
    다시 들고 있을 이유가 없다. 캐시해서 이득인 것은 **다시 만들려면 돈이 드는 것**뿐이다.
    """

    opinions: tuple[AgentOpinion, ...]
    decision: InvestmentDecision
    used_fallback: bool

    @property
    def agents(self) -> list[AgentOpinion]:
        """호출부가 리스트를 기대한다. 캐시 안의 튜플을 그대로 넘기지 않기 위한 사본."""
        return list(self.opinions)


@dataclass
class _Entry:
    fingerprint: str
    outcome: AdviceOutcome
    # 마지막으로 "이 캐시가 아직 유효하다" 고 확인한 시각. 지문이 같으면 갱신된다.
    checked_at: datetime = field(default_factory=lambda: datetime.now(UTC))


_cache: dict[str, _Entry] = {}
_locks: dict[str, asyncio.Lock] = {}
# 지금 돌고 있는 분석 수. `asyncio.Semaphore` 가 아니라 정수인 이유는 아래
# `reserve_slot()` 주석에 있다.
_running = 0


class AdviceBusyError(RuntimeError):
    """동시 실행 상한에 걸렸다. 엔드포인트가 429 로 옮긴다."""


def fingerprint(content: StockContent | None) -> str:
    """뉴스·리포트 목록의 지문.

    URL 을 우선 쓰고 없으면 제목+게재일로 떨어진다 — 공급자가 URL 을 빼먹는 항목이
    실제로 있고, 그때 전부 빈 문자열로 뭉개지면 서로 다른 기사가 같은 지문이 된다.

    **순서에 의존하지 않게 정렬한다.** 같은 기사 묶음이 순서만 바뀌어 오는 일이 있는데,
    그걸 '새 기사' 로 읽으면 LLM 4회가 이유 없이 나간다.

    개수도 함께 넣는다. 해시 충돌 때문이 아니라, 기사가 **사라졌을 때**도 지문이
    바뀌게 하려는 것이다.
    """
    if content is None:
        return "none"

    keys = sorted(
        item.url or f"{item.title}|{item.published_at}"
        for item in (*content.news, *content.reports)
    )
    if not keys:
        return "empty"

    digest = hashlib.sha256("\n".join(keys).encode()).hexdigest()[:32]
    return f"{len(keys)}:{digest}"


def _is_fresh(entry: _Entry) -> bool:
    ttl = timedelta(seconds=settings.advice_cache_ttl_seconds)
    return datetime.now(UTC) - entry.checked_at < ttl


def _lock_for(symbol: str) -> asyncio.Lock:
    """종목별 락.

    `fundamentals_service._lock_for` 와 같은 이유로 racy 하지 않다 — `setdefault` 의
    조회와 삽입 사이에 `await` 가 없고 asyncio 는 단일 스레드다. 여기에 `await` 를
    넣는 리팩터링은 진짜 경쟁 상태를 만든다.
    """
    return _locks.setdefault(symbol, asyncio.Lock())


def _evict_if_needed() -> None:
    limit = settings.advice_cache_size
    while len(_cache) > limit:
        oldest = min(_cache, key=lambda key: _cache[key].checked_at)
        del _cache[oldest]
        _locks.pop(oldest, None)


def peek(symbol: str) -> AdviceOutcome | None:
    """뉴스를 조회하지 않고 답할 수 있으면 답한다 (위 흐름의 ①).

    호출부가 이걸 먼저 물어보는 것이 핵심이다 — `None` 이 아니면 그 요청은 네트워크를
    한 번도 건드리지 않는다.
    """
    entry = _cache.get(symbol)
    if entry is not None and _is_fresh(entry):
        return entry.outcome
    return None


def reuse_if_unchanged(symbol: str, content: StockContent | None) -> AdviceOutcome | None:
    """뉴스를 이미 받아 본 호출부가 지문으로 재확인한다 (위 흐름의 ②).

    지문이 같으면 수명을 연장하고 캐시를 낸다. 다르면 `None` 을 주고, 호출부는
    LLM 을 돌린 뒤 `store()` 로 새 결과를 넣는다.
    """
    entry = _cache.get(symbol)
    if entry is None:
        return None

    if entry.fingerprint != fingerprint(content):
        logger.info("%s 새 기사가 확인되어 AI 판단을 다시 만듭니다", symbol)
        return None

    entry.checked_at = datetime.now(UTC)
    return entry.outcome


def store(
    symbol: str,
    content: StockContent | None,
    *,
    opinions: list[AgentOpinion],
    decision: InvestmentDecision,
    used_fallback: bool,
) -> AdviceOutcome:
    """새로 만든 판단을 넣는다.

    **규칙 기반 폴백은 캐시하지 않는다.** 폴백은 LLM 이 죽었을 때의 임시 답이라
    다시 만드는 데 돈이 들지 않고, 캐시해 두면 키가 복구된 뒤에도 TTL 동안 계속
    "규칙 기반 판단" 배지가 뜬다 — 고장이 캐시에 굳는다.
    """
    outcome = AdviceOutcome(
        opinions=tuple(opinions), decision=decision, used_fallback=used_fallback
    )
    if used_fallback:
        return outcome

    _cache[symbol] = _Entry(fingerprint=fingerprint(content), outcome=outcome)
    _evict_if_needed()
    return outcome


def reserve_slot_now() -> None:
    """분석 한 건의 자리를 잡는다. 상한을 넘으면 **기다리지 않고 거절한다.**

    `asyncio.Semaphore` 를 쓰지 않은 것은 의도다. 세마포어의 `async with` 는 자리가
    날 때까지 **기다린다** — 그러면 이건 상한이 아니라 큐가 되고, 요청은 결국 전부
    실행되어 LLM 호출 총량은 한 푼도 줄지 않는다. 늦게 나가는 것과 안 나가는 것은
    비용 관점에서 완전히 다르다.

    `locked()` 로 미리 보고 `acquire()` 하는 방법도 안 된다. 그 둘 사이에 `await` 가
    있어 마지막 자리를 다른 코루틴이 채갈 수 있고, 그러면 거절하려던 요청이 대신
    대기 상태로 빠진다. 아래는 검사와 증가 사이에 `await` 가 없어 asyncio 단일
    스레드에서 원자적이다.

    반납은 호출부 책임이다(`release_slot`). 스트리밍 엔드포인트가 슬롯을 응답
    **헤더가 나가기 전에** 잡고 제너레이터가 끝날 때 놓아야 해서, 잡는 것과 놓는 것이
    한 블록에 들어가지 않는다. 그 형태가 가능한 곳은 `reserve_slot()` 을 쓴다.
    """
    global _running
    if _running >= settings.advice_max_concurrent:
        raise AdviceBusyError("분석 동시 실행 상한에 도달했습니다")
    _running += 1


def release_slot() -> None:
    """잡은 자리를 놓는다. 0 밑으로는 내려가지 않는다 — 이중 반납이 상한을 무력화하면
    안 된다(그쪽이 자리를 없애는 게 아니라 만들어내는 방향의 버그다)."""
    global _running
    _running = max(0, _running - 1)


@asynccontextmanager
async def reserve_slot() -> AsyncIterator[None]:
    """잡기·놓기를 한 블록에서 끝낼 수 있는 호출부용."""
    reserve_slot_now()
    try:
        yield
    finally:
        release_slot()


@dataclass(frozen=True)
class CacheStats:
    """지금 이 프로세스의 캐시 현황. 관리자 화면이 읽는 유일한 창이다."""

    cached: int
    capacity: int
    in_flight: int


def stats() -> CacheStats:
    """캐시·동시 실행 현황.

    **이 프로젝트에서 돈이 나가는 유일한 경로의 관측 지점이다.** 종목 하나를
    분석하면 LLM 이 4회 나가고, 그것을 줄이는 장치가 이 캐시인데 지금까지 그것이
    실제로 일하고 있는지 볼 방법이 없었다.

    프로세스 메모리라 **재시작하면 0 이고, 워커가 여럿이면 그중 하나의 숫자**다.
    누적 사용량이 아니라 현재 상태라는 뜻이고, 화면이 그렇게 말해야 한다.
    """
    return CacheStats(
        cached=len(_cache),
        capacity=settings.advice_cache_size,
        in_flight=_running,
    )


def reset_for_tests() -> None:
    """테스트 격리용. 모듈 전역 상태가 테스트 사이에 새지 않게 한다."""
    global _running
    _cache.clear()
    _locks.clear()
    _running = 0
