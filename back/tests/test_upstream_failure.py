"""상류(yfinance)가 우리를 막았을 때의 행동.

이 파일이 지키는 것 셋이다. 셋 다 **조용히 틀리는** 부류라 응답만 보면 정상으로
보이고, 그래서 단언 대상이 응답이 아니라 **호출 횟수와 다음 시도 시각**이다.

1. **레이트리밋을 404 로 보고하지 않는다.** 후보 루프가 모든 실패를 "다음 후보" 로
   흡수하면, 야후가 조인 상황에서 사용자는 삼성전자를 검색해도 "주가 데이터를 찾을 수
   없습니다" 를 본다. 게다가 6자리 코드는 후보가 3개라 이미 조여진 상류를 요청당 3번
   더 두드려 차단을 스스로 연장한다.
2. **아무것도 쓰지 못한 배치가 하루를 잡아먹지 않는다.** 스냅샷 배치의 시각은 태스크를
   띄우기 **전에** 찍히므로, 응답률 가드로 통째로 버려져도 다음 시도는 24시간 뒤였다.
3. **실패한 배경 갱신이 요청마다 되살아나지 않는다.** `_load_universe` 의 DB 실패는
   시도 시각을 남기지 않고 새어 나가, `/markets/movers` 요청마다 새 태스크가 같은
   자리에서 죽었다. 배경 태스크라 화면에는 흔적이 없다.
"""

import sys
import types
from datetime import UTC, datetime, timedelta

import pytest

from app.core import background
from app.core.exceptions import ProviderUnavailableError, StockNotFoundError
from app.integrations.yfinance.client import is_rate_limited
from app.repositories.listed_company import ListedCompanyRepository
from app.schemas.stock import CompanyMetrics, SnapshotRecord
from app.services import market_service, snapshot_service


class _YFRateLimitError(Exception):
    """yfinance 가 던지는 것과 **같은 이름·같은 문구**의 예외.

    실물을 import 하지 않는 이유: 판정이 클래스 이름과 문구로 이루어져 있어, 실물을
    쓰면 그 판정이 실제로 무엇에 의존하는지가 테스트에서 보이지 않는다.
    """

    def __init__(self) -> None:
        super().__init__("Too Many Requests. Rate limited. Try after a while.")


# ── 1. 레이트리밋 분류 ──────────────────────────────────────────────────


def test_rate_limit_is_recognized_by_name_and_by_message() -> None:
    assert is_rate_limited(_YFRateLimitError())
    assert is_rate_limited(Exception("Too Many Requests"))
    assert is_rate_limited(Exception("HTTP 429"))
    assert is_rate_limited(Exception("rate limited"))


def test_ordinary_failures_are_not_rate_limits() -> None:
    """오탈자·상장폐지는 '다음 후보' 로 넘어가야 한다 — 여기서 503 을 내면 안 된다."""
    assert not is_rate_limited(Exception("No data found for this symbol"))
    assert not is_rate_limited(Exception("possibly delisted"))
    # 숫자 429 가 값에 섞여 있을 뿐인 경우. 단어 경계가 없으면 이것이 오진된다.
    assert not is_rate_limited(Exception("close price was 1429.00"))


def _install_ticker(monkeypatch: pytest.MonkeyPatch, factory) -> None:
    """`import yfinance as yf` 를 스텁으로 바꾼다 (지연 import 라 sys.modules 로 닿는다)."""
    fake = types.ModuleType("yfinance")
    fake.Ticker = factory  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "yfinance", fake)


def test_rate_limited_history_gives_503_and_stops_after_one_candidate(monkeypatch) -> None:
    """**핵심 단언은 `calls == 1` 이다.**

    503 만 확인하면 "후보를 다 돌고 나서 503" 도 통과한다. 그건 사용자에게 보이는
    문구만 고치고 상류 부하는 그대로 두는 것이다 — 6자리 코드는 후보가 셋이다.
    """
    from app.integrations.yfinance.history import fetch_stock_history

    calls: list[str] = []

    class _Blocked:
        def __init__(self, symbol: str) -> None:
            self._symbol = symbol

        def history(self, **_: object):
            calls.append(self._symbol)
            raise _YFRateLimitError()

    _install_ticker(monkeypatch, _Blocked)

    with pytest.raises(ProviderUnavailableError):
        fetch_stock_history("005930", "day", None, 10, include_content=False)

    assert calls == ["005930.KS"], "레이트리밋인데 남은 후보를 계속 물어봤다"


def test_ordinary_failure_still_walks_every_candidate(monkeypatch) -> None:
    """분류가 지나치게 넓어지면 이 테스트가 깨진다 — 폴백 경로를 함께 고정한다."""
    from app.integrations.yfinance.history import fetch_stock_history

    calls: list[str] = []

    class _Missing:
        def __init__(self, symbol: str) -> None:
            self._symbol = symbol

        def history(self, **_: object):
            calls.append(self._symbol)
            raise Exception("No data found, symbol may be delisted")

    _install_ticker(monkeypatch, _Missing)

    with pytest.raises(StockNotFoundError):
        fetch_stock_history("005930", "day", None, 10, include_content=False)

    assert calls == ["005930.KS", "005930.KQ", "005930"]


# ── 2. 실패한 배치의 다음 시도 시각 ─────────────────────────────────────


@pytest.fixture(autouse=True)
def clean_scheduler_state() -> None:
    """스케줄러 상태는 모듈 전역이다 — 앞 테스트가 잡아 둔 시각이 새면 안 된다."""
    background._running.clear()
    background._next_allowed.clear()


def test_retry_after_only_moves_the_next_attempt_earlier() -> None:
    """늦추는 데 쓰이면 두 호출의 **순서**가 결과를 바꾼다 — 그래서 앞당기기만 한다."""
    background.retry_after("batch", timedelta(minutes=30))
    first = background._next_allowed["batch"]

    background.retry_after("batch", timedelta(days=1))

    assert background._next_allowed["batch"] == first


async def test_discarded_snapshot_batch_retries_in_minutes_not_a_day(
    monkeypatch, repo: ListedCompanyRepository
) -> None:
    """응답률이 무너져 아무것도 쓰지 않은 실행이 다음 24시간의 몫을 써서는 안 된다."""
    # 배치를 띄운 것처럼 하루치 간격을 잡아 둔다 (schedule_once 가 하는 일).
    background._next_allowed["snapshot"] = datetime.now(UTC) + timedelta(days=1)

    def blocked(symbols):
        # 30종목을 물었는데 1종목만 응답 — 공급자가 막고 있는 모습이다.
        answered = list(symbols)[:1]
        return SnapshotRecord(
            as_of="2026-08-11",
            attempted=len(list(symbols)),
            answered=answered,
            dates={},
            metrics={code: CompanyMetrics() for code in answered},
        )

    async def thirty_symbols(_limit: int) -> list[str]:
        return [f"{index:06d}.KS" for index in range(30)]

    monkeypatch.setattr(snapshot_service, "fetch_company_snapshots", blocked)
    monkeypatch.setattr(repo, "symbols_for_calendar_refresh", thirty_symbols)

    filled = await snapshot_service.refresh_snapshots(repo, force=True)

    assert filled == 0
    gap = background._next_allowed["snapshot"] - datetime.now(UTC)
    assert gap < timedelta(hours=1), "버려진 배치가 하루를 잡아먹었다"


# ── 3. 실패한 배경 갱신의 재시도 폭주 ───────────────────────────────────


async def test_universe_load_failure_does_not_retry_every_request(monkeypatch) -> None:
    """DB 실패가 시도 시각을 남기지 않으면 `/markets/movers` 요청마다 되살아난다."""
    monkeypatch.setattr(market_service, "_scan", None)
    monkeypatch.setattr(market_service, "_scanned_at", None)

    loads = 0

    async def broken_universe(_repo):
        nonlocal loads
        loads += 1
        raise RuntimeError("상장사 목록 조회 실패")

    def must_not_scan(*_args, **_kwargs):
        raise AssertionError("모집단을 못 읽었는데 스캔을 시도했다")

    monkeypatch.setattr(market_service, "_load_universe", broken_universe)
    monkeypatch.setattr(market_service, "scan_movers", must_not_scan)

    first = await market_service.refresh_movers(None)  # type: ignore[arg-type]
    second = await market_service.refresh_movers(None)  # type: ignore[arg-type]

    # 예외가 밖으로 새지 않는다 — 홈은 직전 스냅샷(여기서는 None)으로 계속 뜬다.
    assert first is None
    assert second is None
    # 두 번째 호출은 TTL 안이라 아예 시도하지 않는다.
    assert loads == 1, "실패가 시도 시각을 남기지 않아 매 요청이 다시 두드렸다"


async def test_fresh_snapshot_is_not_re_stamped(monkeypatch) -> None:
    """`finally` 가 조기 반환까지 덮으면 TTL 이 매 요청 앞으로 밀려 **영원히** 갱신되지 않는다.

    규칙을 한 곳으로 모으면서 정확히 그 함정을 밟을 수 있는 자리라 테스트로 고정한다.
    """
    stamped = datetime.now(UTC)
    monkeypatch.setattr(market_service, "_scan", None)
    monkeypatch.setattr(market_service, "_scanned_at", stamped)

    await market_service.refresh_movers(None)  # type: ignore[arg-type]

    assert market_service._scanned_at == stamped
