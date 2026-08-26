"""종목 스냅샷 수집 — '오늘의 일정' + 스크리너 지표를 **한 번에**.

## 왜 배치가 하나인가

일정(실적발표·배당락)과 지표(시총·PER·PBR·ROE·배당수익률)는 서로 다른 화면이 쓰지만
**출처가 같다.** 둘 다 종목당 `ticker.get_info()` 한 번에서 나온다(PER/PBR 만
`get_valuation_measures()` 가 하나 더 붙는데, 실측 0.18초로 info 의 1/3 이다).

배치를 기능별로 나누면 같은 종목에 `get_info()` 를 두 번 친다. 16회차에 그렇게 했다가
야후가 전 종목 요청을 거부했다 — 2,703종목이 113초 만에 "끝나고" 응답 0건이었고,
그 0건이 이미 수집한 날짜를 지웠다. 그때 `calendar_service` 모듈 주석에 "두 배치를
연달아 돌리지 않는다" 고 적었는데, 지키는 쪽보다 **없애는 쪽**이 낫다.

## 규칙은 여기서 만들지 않는다

날짜 두 개를 읽는 규칙은 `calendar.py`, 단위 규약(ROE 는 소수 · 배당수익률은 이미
백분율)과 밸류에이션 표 읽기는 `fundamentals.py` 가 단일 출처다. 이 파일은 그 규칙들을
**불러다 조립**할 뿐이다. 복사해 오면 화면의 ROE 와 스크리너의 ROE 가 100배 어긋난다.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from app.integrations.yfinance.calendar import KST, extract_calendar_dates
from app.integrations.yfinance.fundamentals import (
    dividend_yield_pct,
    read_valuation,
    roe_pct,
)
from app.schemas.stock import CalendarDates, CompanyMetrics, SnapshotRecord
from app.utils.numbers import int_or_none

logger = logging.getLogger(__name__)

#: 동시 요청 수. 시총 폴백(`krx/market_cap.py`)과 같은 값이다 — 더 올리면 Yahoo 가 조인다.
_WORKERS = 8


def _fetch_one(symbol: str) -> tuple[str, CalendarDates | None, CompanyMetrics | None]:
    """종목 하나의 일정 + 지표. 응답을 못 받으면 `(symbol, None, None)`.

    **`None` 과 빈 값은 다르다.**

        None                응답을 못 받았다 (예외 · 빈 info). 아무것도 모르는 상태다
        CalendarDates()     응답은 받았고 일정이 없다. 이건 **사실**이라 그대로 반영한다

    처음에는 둘을 같은 값으로 뭉갰다. "일정 없는 종목이 어차피 다수라 구분할 실익이
    없다" 고 봤는데 틀렸다 — 저장 계층이 이 값으로 **덮어쓰기** 때문이다. 야후가
    요청을 거부하는 순간 전 종목이 "일정 없음" 이 되어 이미 수집한 날짜를 지운다
    (`schemas/stock.CalendarRecord` 주석에 실제로 겪은 내용을 적어 뒀다).

    `info` 가 비어 있는 것을 실패로 보는 근거: 살아 있는 종목의 `get_info()` 는 항상
    채워진 dict 를 준다. 빈 dict 는 조회가 막혔거나 심볼이 죽었다는 뜻이고, 어느
    쪽이든 "일정이 없다" 고 단정할 근거가 되지 못한다.

    같은 구분이 PER/PBR 에도 필요하다. 그쪽은 **별개의 호출**이라 info 는 멀쩡한데
    밸류에이션만 실패할 수 있어서, 종목 단위의 `None` 으로는 표현되지 않는다.
    그래서 `CompanyMetrics.valuation_ok` 로 따로 실어 보낸다.
    """
    import yfinance as yf

    try:
        ticker = yf.Ticker(symbol)
        info = ticker.get_info() or {}
    except Exception:  # noqa: BLE001 - 종목 하나가 배치 전체를 세우면 안 된다
        return symbol, None, None

    if not info:
        return symbol, None, None

    ex_dividend, next_earnings = extract_calendar_dates(ticker, info)
    valuation = read_valuation(ticker)

    return (
        symbol,
        CalendarDates(ex_dividend_date=ex_dividend, next_earnings_date=next_earnings),
        CompanyMetrics(
            # 밸류에이션 표의 Market Cap 은 야후의 다른 가격 기준이라 10%가량 어긋난다.
            # 시총은 `info` 쪽 하나만 쓴다 (`build_fundamentals` 와 같은 판단).
            market_cap=int_or_none(info.get("marketCap")),
            per=valuation.per,
            pbr=valuation.pbr,
            roe_pct=roe_pct(info),
            dividend_yield_pct=dividend_yield_pct(info),
            valuation_ok=valuation.ok,
        ),
    )


def fetch_company_snapshots(symbols: list[str]) -> SnapshotRecord:
    """종목 목록의 일정·지표를 모아 온다. 블로킹이므로 서비스가 `to_thread` 로 감싼다.

    `answered` 에는 **응답을 받은 심볼만** 담는다. 일정이 없다는 응답도 포함이다 —
    그건 사실이므로 저장 계층이 반영하고 `calendar_updated_at` 을 찍어야 배치가
    앞으로 나아간다. 반면 응답을 못 받은 종목은 빠지므로 아무것도 기록되지 않고
    다음 배치가 다시 물어본다.

    `dates` 에는 날짜를 **하나라도 가진** 종목만 담는 반면 `metrics` 는 응답받은 종목
    전부를 담는다. 비대칭이 의도적인 이유: 일정 쪽은 저장 계층이 `answered` 를 보고
    빠진 종목을 NULL 로 지우는 계약이 이미 있고(발표가 취소되면 지워져야 한다),
    지표 쪽은 `valuation_ok` 라는 종목별 판단이 값과 함께 가야 해서 항목이 있어야 한다.
    """
    if not symbols:
        return SnapshotRecord()

    dates: dict[str, CalendarDates] = {}
    metrics: dict[str, CompanyMetrics] = {}
    answered: list[str] = []

    with ThreadPoolExecutor(max_workers=_WORKERS) as pool:
        for symbol, value, metric in pool.map(_fetch_one, symbols):
            if value is None or metric is None:
                continue
            answered.append(symbol)
            metrics[symbol] = metric
            if value.ex_dividend_date or value.next_earnings_date:
                dates[symbol] = value

    priced = sum(1 for metric in metrics.values() if metric.per is not None)
    logger.info(
        "스냅샷 수집: %d종목에 물어 %d종목이 응답, 일정 %d종목 · PER %d종목",
        len(symbols),
        len(answered),
        len(dates),
        priced,
    )
    return SnapshotRecord(
        as_of=datetime.now(KST).date().isoformat(),
        attempted=len(symbols),
        answered=answered,
        dates=dates,
        metrics=metrics,
    )
