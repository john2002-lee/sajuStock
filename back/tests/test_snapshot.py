"""종목 스냅샷 배치 — 일정 + 스크리너 지표를 한 번에 채우는 경로.

여기서 지키는 것 다섯이다.

1. **배치가 앞으로 나아가는가** — 값을 못 받은 종목에도 `calendar_updated_at` 을
   찍지 않으면 같은 종목만 영원히 다시 물어본다. 로그로도 안 보이는 제자리걸음이다.
2. **못 받은 것을 '없음'으로 단정하지 않는가** — 16회차에 그 단정이 이미 수집한
   날짜를 지웠다. 지표에는 그 함정이 **하나 더** 있다: PER/PBR 은 `get_info()` 가
   아니라 별개 호출에서 오므로, 종목 단위의 성공/실패로는 표현되지 않는다.
3. **단위 규약이 저장까지 이어지는가** — ROE 는 소수, 배당수익률은 이미 백분율이다.
   한 곳에서 뒤집히면 화면이 100배 틀린 값을 자신 있게 보여준다.
4. **호출이 종목당 한 번인가** — 배치를 기능별로 나누면 같은 종목에 `get_info()` 를
   두 번 친다. 야후가 그것 때문에 전 종목 요청을 거부한 것이 이 배치가 하나인 이유다.
5. **표본이 무너진 배치를 버리는가** — 일부만 응답하는 중간 상태가 가장 위험하다.
"""

import sys
import types
from datetime import date

import pandas as pd
import pytest

from app.repositories.listed_company import ListedCompanyRepository
from app.schemas.stock import CalendarDates, CompanyMetrics, ListedCompanyRecord, SnapshotRecord
from app.services import snapshot_service

_TODAY = date(2026, 8, 7)

_VALUATION = pd.DataFrame(
    {"Current": [18.528916, 3.201205, 1.5e15]},
    index=["Trailing P/E", "Price/Book", "Market Cap"],
)


class _StubTicker:
    """배치가 실제로 쓰는 표면만 흉내 낸다 — `get_info` · `get_valuation_measures` · `calendar`.

    `calls` 는 호출 횟수를 세는 공유 카운터다. 배치가 종목당 `get_info()` 를 몇 번
    부르는지 세는 것이 이 파일의 검사 항목 하나다.
    """

    def __init__(self, info: dict, valuation=_VALUATION, calls: dict | None = None) -> None:
        self._info = info
        self._valuation = valuation
        self._calls = calls if calls is not None else {}

    def get_info(self) -> dict:
        self._calls["info"] = self._calls.get("info", 0) + 1
        return self._info

    def get_valuation_measures(self, freq="quarterly", periods=5):
        self._calls["valuation"] = self._calls.get("valuation", 0) + 1
        if self._valuation is None:
            raise RuntimeError("밸류에이션 조회 실패")
        return self._valuation

    @property
    def calendar(self) -> dict:
        return {}


def _install_yfinance(monkeypatch: pytest.MonkeyPatch, factory) -> None:
    """`import yfinance as yf` 를 스텁으로 바꾼다.

    수집기가 함수 **안에서** import 하므로 `sys.modules` 를 갈아끼우면 그대로 먹는다.
    모듈 속성을 패치하는 방법으로는 닿지 않는 자리다 — 그 import 는 지연 로딩이고,
    실제 네트워크로 나가는 유일한 문이라 여기서 막아야 의미가 있다.
    """
    fake = types.ModuleType("yfinance")
    fake.Ticker = factory  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "yfinance", fake)


# ── 수집기: 못 받은 것과 없는 것 ─────────────────────────────────────────


def test_failed_fetch_is_not_the_same_as_no_schedule(monkeypatch) -> None:
    """수집기가 **실패(빈 info)** 와 **응답했으나 일정 없음** 을 구분하는가.

    이 구분이 없으면 저장 계층이 아무리 계약을 지켜도 소용없다 — 실패가 "일정 없음"
    으로 도착하기 때문이다.
    """
    from app.integrations.yfinance.snapshot import fetch_company_snapshots

    responses = {
        "OK.KS": {"earningsTimestampStart": 1793142000, "marketCap": 100},
        "EMPTY.KS": {"someField": 1},  # 응답은 왔고 일정만 없다
        "BLOCKED.KS": {},  # 빈 info = 막혔다
    }
    _install_yfinance(monkeypatch, lambda symbol: _StubTicker(responses[symbol]))

    record = fetch_company_snapshots(list(responses))

    assert record.attempted == 3
    # 막힌 종목은 응답 목록에서 빠진다 → 저장 계층이 건드리지 않는다.
    assert sorted(record.answered) == ["EMPTY.KS", "OK.KS"]
    assert set(record.dates) == {"OK.KS"}
    # 지표는 응답받은 **전부**를 담는다 — 종목별 `valuation_ok` 가 값과 함께 가야 한다.
    assert set(record.metrics) == {"EMPTY.KS", "OK.KS"}


def test_info_is_fetched_exactly_once_per_symbol(monkeypatch) -> None:
    """**이 배치가 하나인 이유 자체를 지킨다.**

    일정과 지표를 각자의 배치로 나누면 같은 종목에 `get_info()` 를 두 번 친다.
    실제로 그렇게 돌렸다가 야후가 2,703종목 요청을 통째로 거부했고, 응답 0건이
    이미 수집한 날짜를 지웠다. 여기서 세는 숫자가 그 사고와 직접 이어져 있다.
    """
    from app.integrations.yfinance.snapshot import fetch_company_snapshots

    calls: dict[str, int] = {}
    _install_yfinance(
        monkeypatch, lambda symbol: _StubTicker({"marketCap": 100}, calls=calls)
    )

    fetch_company_snapshots(["A.KS", "B.KS", "C.KS"])

    assert calls["info"] == 3, "종목당 get_info() 가 한 번을 넘었다"
    assert calls["valuation"] == 3


def test_units_survive_collection(monkeypatch) -> None:
    """ROE 는 소수, 배당수익률은 **이미 백분율**. 규약이 수집기까지 이어지는가.

    같은 dict 안에서 단위가 갈리는 값이라, 한쪽에 맞춘 변환을 양쪽에 적용하면 한쪽이
    100배 틀린다. 그런데 둘 다 그럴듯한 숫자라 화면만 봐서는 알 수 없다.
    """
    from app.integrations.yfinance.snapshot import fetch_company_snapshots

    info = {"returnOnEquity": 0.30792, "dividendYield": 0.57, "marketCap": 1_500}
    _install_yfinance(monkeypatch, lambda symbol: _StubTicker(info))

    metrics = fetch_company_snapshots(["005930.KS"]).metrics["005930.KS"]

    assert metrics.roe_pct == 30.79  # 소수 → ×100
    assert metrics.dividend_yield_pct == 0.57  # 이미 백분율 → 그대로
    assert metrics.per == 18.53
    assert metrics.market_cap == 1_500
    assert metrics.valuation_ok is True


def test_valuation_failure_is_marked_not_silently_empty(monkeypatch) -> None:
    """밸류에이션 호출만 실패한 종목은 `valuation_ok=False` 로 온다.

    info 는 멀쩡한데 이 호출만 실패할 수 있다 — 종목 단위로는 "응답 성공" 이라
    이 플래그가 없으면 PER 이 그냥 없는 종목과 구별되지 않는다.
    """
    from app.integrations.yfinance.snapshot import fetch_company_snapshots

    _install_yfinance(
        monkeypatch, lambda symbol: _StubTicker({"marketCap": 100}, valuation=None)
    )

    metrics = fetch_company_snapshots(["005930.KS"]).metrics["005930.KS"]

    assert metrics.valuation_ok is False
    assert metrics.per is None
    # 응답 자체는 받았으므로 종목은 `answered` 에 남는다 — 일정은 반영되어야 한다.
    assert fetch_company_snapshots(["005930.KS"]).answered == ["005930.KS"]


# ── 저장 ─────────────────────────────────────────────────────────────────


@pytest.fixture
async def seeded(db_session) -> ListedCompanyRepository:
    repo = ListedCompanyRepository(db_session)
    await repo.upsert_many(
        [
            ListedCompanyRecord(symbol="005930.KS", name="삼성전자", market="유가"),
            ListedCompanyRecord(symbol="000660.KS", name="SK하이닉스", market="유가"),
            ListedCompanyRecord(symbol="247540.KQ", name="에코프로비엠", market="코스닥"),
        ]
    )
    await repo.update_market_caps({"005930": 400_000_000, "000660": 200_000_000})
    return repo


async def test_answered_symbols_get_a_timestamp_even_without_dates(seeded) -> None:
    """**응답만 받았으면 날짜가 없어도 시각은 찍는다.**

    안 찍으면 일정이 없는 종목(대부분)이 `nullsfirst` 정렬 맨 앞에 영원히 남아,
    배치가 같은 종목만 반복해서 물어보고 나머지는 한 번도 못 채운다. 조용히 제자리를
    도는 종류라 로그로도 안 보인다 — 그래서 테스트가 필요하다.
    """
    answered = ["005930.KS", "000660.KS"]

    filled, _ = await seeded.update_snapshots(
        {"005930.KS": CalendarDates(next_earnings_date="2026-10-28")}, {}, answered
    )

    assert filled == 1  # 날짜를 얻은 것은 하나뿐이지만

    # 응답받은 둘 다 정렬 맨 앞에서 빠져야 한다 — 다음 배치는 아직 안 물어본 종목을 본다.
    following = await seeded.symbols_for_calendar_refresh(limit=3)
    assert following[0] == "247540.KQ"


async def test_unanswered_symbols_are_left_completely_alone(seeded) -> None:
    """**응답을 못 받은 종목은 건드리지 않는다 — 실제로 데이터를 지운 자리다.**

    전 종목 배치를 돌렸을 때 야후가 요청을 전부 거부했다(직전에 시총 배치가
    `get_info()` 를 2,747번 쳤다). 2,703종목이 113초 만에 0건으로 "끝났고", 그 0건이
    이미 수집돼 있던 29종목의 날짜를 NULL 로 덮었다. `calendar_updated_at` 까지 찍혀
    방금 확인한 행처럼 보였다.

    지금은 응답 못 받은 종목이 `answered` 에서 빠지므로, 값도 타임스탬프도 그대로다.
    """
    await seeded.update_snapshots(
        {"005930.KS": CalendarDates(next_earnings_date="2026-10-28")}, {}, ["005930.KS"]
    )

    # 다음 배치가 005930 은 응답을 못 받고 000660 만 받았다.
    await seeded.update_snapshots({}, {}, ["000660.KS"])

    kept = await seeded.upcoming_calendar(
        "next_earnings_date", _TODAY, date(2026, 12, 31), 10
    )
    assert [row.symbol for row in kept] == ["005930.KS"], "응답 못 받은 종목의 날짜가 지워졌다"


async def test_dates_are_overwritten_including_removal(seeded) -> None:
    """발표가 끝나면 공급자가 다음 분기 날짜를 준다 — 값이 **바뀌어야** 한다.

    없어진 일정(취소·미정)도 그대로 반영한다. 남겨 두면 지난 날짜가 화면에 계속 뜬다.
    """
    await seeded.update_snapshots(
        {"005930.KS": CalendarDates(next_earnings_date="2026-08-10")}, {}, ["005930.KS"]
    )
    await seeded.update_snapshots({}, {}, ["005930.KS"])

    events = await seeded.upcoming_calendar(
        "next_earnings_date", _TODAY, date(2026, 12, 31), 10
    )
    assert events == []


async def test_valuation_failure_does_not_erase_stored_per(seeded) -> None:
    """**밸류에이션 호출이 실패한 배치는 PER/PBR 을 건드리지 않는다.**

    이것이 16회차 사고의 지표 판(版)이다. 그때는 종목 전체가 실패였지만, 여기서는
    info 는 성공하고 별개 호출만 실패한다 — 종목 단위의 성공/실패로는 잡히지 않아
    `valuation_ok` 라는 값별 표시가 따로 필요하다.
    """
    good = CompanyMetrics(per=12.3, pbr=1.1, roe_pct=9.0, valuation_ok=True)
    await seeded.update_snapshots({}, {"005930.KS": good}, ["005930.KS"])

    blind = CompanyMetrics(per=None, pbr=None, roe_pct=8.0, valuation_ok=False)
    await seeded.update_snapshots({}, {"005930.KS": blind}, ["005930.KS"])

    company = await seeded.find_by_code("005930")
    assert (company.per, company.pbr) == (12.3, 1.1), "실패한 호출이 적재된 PER 을 지웠다"
    # 반면 info 에서 온 ROE 는 응답을 받았으므로 갱신된다.
    assert company.roe_pct == 8.0


async def test_present_valuation_overwrites_including_removal(seeded) -> None:
    """반대 방향도 지킨다 — 응답이 왔는데 PER 이 없으면 **그것은 사실이다.**

    적자로 돌아선 회사는 PER 이 사라져야 한다. `valuation_ok=False` 와 뭉개면
    이 갱신이 영원히 반영되지 않아 옛 PER 이 화면에 남는다.
    """
    await seeded.update_snapshots(
        {}, {"005930.KS": CompanyMetrics(per=12.3, valuation_ok=True)}, ["005930.KS"]
    )
    await seeded.update_snapshots(
        {}, {"005930.KS": CompanyMetrics(per=None, valuation_ok=True)}, ["005930.KS"]
    )

    company = await seeded.find_by_code("005930")
    assert company.per is None


async def test_market_cap_is_never_erased_by_this_batch(seeded) -> None:
    """시총은 **있을 때만** 쓴다 — 이 컬럼의 writer 가 둘이기 때문이다.

    KRX 벌크 경로(`update_market_caps`)의 계약이 "있는 값만" 이라, 이쪽만 NULL 을
    반영하면 같은 종목의 시총이 어느 배치가 나중에 돌았느냐에 따라 나타났다 사라진다.
    """
    before = (await seeded.find_by_code("005930")).market_cap
    assert before == 400_000_000

    await seeded.update_snapshots(
        {}, {"005930.KS": CompanyMetrics(market_cap=None, valuation_ok=True)}, ["005930.KS"]
    )

    assert (await seeded.find_by_code("005930")).market_cap == before


async def test_fundamentals_timestamp_only_moves_on_a_real_reading(seeded) -> None:
    """`fundamentals_updated_at` 은 PER/PBR 을 실제로 쓴 배치에서만 찍힌다.

    일정과 하나로 합치면, 밸류에이션만 실패한 날 화면이 옛 PER 을 오늘 값이라고
    말하게 된다 — 지표가 스테일하다는 유일한 신호가 이 시각이다.
    """
    await seeded.update_snapshots(
        {}, {"005930.KS": CompanyMetrics(per=None, valuation_ok=False)}, ["005930.KS"]
    )
    assert await seeded.latest_fundamentals_update() is None

    await seeded.update_snapshots(
        {}, {"005930.KS": CompanyMetrics(per=12.3, valuation_ok=True)}, ["005930.KS"]
    )
    assert await seeded.latest_fundamentals_update() is not None


async def test_symbols_absent_from_metrics_keep_their_indicators(seeded) -> None:
    """`metrics` 에 항목이 없는 종목은 지표를 아무것도 건드리지 않는다.

    일정만 반영하는 경로(테스트·부분 배치)가 지표를 통째로 지우면 안 된다.
    """
    await seeded.update_snapshots(
        {}, {"005930.KS": CompanyMetrics(per=12.3, valuation_ok=True)}, ["005930.KS"]
    )
    await seeded.update_snapshots({}, {}, ["005930.KS"])

    assert (await seeded.find_by_code("005930")).per == 12.3


# ── 큐 순서 ───────────────────────────────────────────────────────────────


async def test_batch_picks_the_stalest_first(seeded) -> None:
    """가장 오래 안 물어본 순. NULL(한 번도 안 물어봄)이 가장 오래된 것이다."""
    await seeded.update_snapshots({}, {}, ["005930.KS"])

    order = await seeded.symbols_for_calendar_refresh(limit=3)

    # 아직 안 물어본 둘이 먼저, 그중에서는 시총 큰 순.
    assert order == ["000660.KS", "247540.KQ", "005930.KS"]


async def test_batch_falls_back_to_kospi_when_no_market_cap(db_session) -> None:
    """**시총이 전부 비어 있어도 순서가 뜻을 가져야 한다.**

    실측으로 이 프로젝트의 DB 는 2,747건 전부 `market_cap` 이 NULL 이었다 — 시총
    배치가 한 번도 성공한 적이 없었다. 그 상태에서 `market_cap desc` 만 타이브레이크로
    두면 정렬 항이 통째로 죽고 물리적 행 순서가 남는다. 배치는 정상 동작하고 채우는
    순서만 무작위가 되어, 홈 화면이 2주 동안 무명 종목만 보여준다 —
    `symbols_without_market_cap` 이 겪었던 것과 정확히 같은 종류의 침묵이다.
    """
    repo = ListedCompanyRepository(db_session)
    await repo.upsert_many(
        [
            ListedCompanyRecord(symbol="900100.KQ", name="코스닥A", market="코스닥"),
            ListedCompanyRecord(symbol="000020.KS", name="유가B", market="유가"),
            ListedCompanyRecord(symbol="900200.KQ", name="코스닥C", market="코스닥"),
            ListedCompanyRecord(symbol="000010.KS", name="유가A", market="유가"),
        ]
    )

    order = await repo.symbols_for_calendar_refresh(limit=4)

    # 유가(.KS)가 먼저, 그 안에서는 심볼 오름차순으로 **결정적**이다.
    assert order == ["000010.KS", "000020.KS", "900100.KQ", "900200.KQ"]


# ── 응답률 가드 ───────────────────────────────────────────────────────────


async def test_collapsed_response_rate_discards_the_whole_batch(seeded, monkeypatch) -> None:
    """응답률이 무너지면 **응답받은 소수까지 포함해 통째로 버린다.**

    종목별 구분(`answered` 에서 제외)만으로도 전멸 사고는 막힌다. 이 층을 하나 더 두는
    이유는 **일부만 응답하는 중간 상태** 때문이다 — 공급자가 조이기 시작하면 소수만
    통과하는데, 그 소수의 "일정 없음" 을 곧이곧대로 반영하면 멀쩡하던 날짜가 지워진다.
    표본이 무너진 배치는 부분 반영도 하지 않는 편이 안전하다.

    이 테스트는 처음에 `answered=[]` 로 썼다가 **가드를 빼도 통과**했다. 빈 목록은
    리포지토리가 먼저 걸러내(`if not answered`) 가드까지 가지도 않기 때문이다 —
    검사기가 검사 대상을 안 지나가는, 안 잡는 테스트였다.
    """
    await seeded.update_snapshots(
        {"005930.KS": CalendarDates(next_earnings_date="2026-10-28")}, {}, ["005930.KS"]
    )

    def throttled(symbols):
        # 3종목에 물었지만 하나만 통과했고, 그마저 일정이 비어 있다.
        # 가드가 없으면 이 하나가 005930 의 날짜를 지운다.
        return SnapshotRecord(
            as_of="2026-08-07",
            attempted=3,
            answered=["005930.KS"],
            dates={},
            metrics={"005930.KS": CompanyMetrics(valuation_ok=True)},
        )

    monkeypatch.setattr(snapshot_service, "fetch_company_snapshots", throttled)

    filled = await snapshot_service.refresh_snapshots(seeded, force=True)

    assert filled == 0
    kept = await seeded.upcoming_calendar(
        "next_earnings_date", _TODAY, date(2026, 12, 31), 10
    )
    assert [row.symbol for row in kept] == ["005930.KS"], "버려야 할 배치가 기존 값을 덮었다"


async def test_healthy_batch_is_written_even_with_few_dates(seeded, monkeypatch) -> None:
    """반대 방향도 지킨다 — **응답률이 멀쩡하면 날짜가 적어도 반영한다.**

    가드를 '날짜 수확률' 로 걸면 안 되는 이유다. 소형주 배치는 일정이 잡힌 종목이
    원래 드물어서, 수확 0건이 정상인 날이 있다. 그때 배치를 버리면 그 종목들은
    영원히 타임스탬프를 못 받아 큐 맨 앞에 남는다.
    """

    def lean(symbols):
        return SnapshotRecord(
            as_of="2026-08-07",
            attempted=len(symbols),
            answered=list(symbols),
            dates={},
            metrics={symbol: CompanyMetrics(per=9.0, valuation_ok=True) for symbol in symbols},
        )

    monkeypatch.setattr(snapshot_service, "fetch_company_snapshots", lean)

    await snapshot_service.refresh_snapshots(seeded, force=True)

    # 전부 응답받았으므로 타임스탬프가 찍혀 다음 배치가 앞으로 나아간다.
    assert await seeded.latest_calendar_update() is not None
    # 같은 배치가 지표도 함께 채운다 — 이것이 배치를 합친 이유다.
    assert (await seeded.find_by_code("005930")).per == 9.0
