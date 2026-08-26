"""재무 · 밸류에이션 수집 (명세 6.3).

주가·뉴스와 분리한 이유는 비용이다. `ticker.info` 한 번이 0.5~1.5초이고 여기에
밸류에이션·손익계산서 호출이 붙어 종목당 1~2초가 든다. 차트가 이걸 기다리면 안 된다.

동기 함수다 — 서비스 계층이 `asyncio.to_thread`로 호출하고, 캐시도 그쪽이 소유한다.

**이 파일에서 반드시 알아야 할 세 가지** (전부 실측으로 확인했다, 추측이 아니다):

1. 국내 종목은 `info["trailingPE"]`/`["priceToBook"]`가 **항상 None**이다.
   (005930.KS · 000660.KS · 247540.KQ 전부 None, AAPL은 34.84/41.23으로 정상)
   `get_valuation_measures()`가 유일한 경로이며 yfinance >= 1.5에만 있다.
2. `returnOnEquity`는 소수(0.30792)인데 `dividendYield`는 백분율(0.57)이다.
   같은 dict, 같은 호출, 단위 규약이 다르다. `roe_pct`·`dividend_yield_pct` 주석 참고.
   이 둘과 `read_valuation` 은 **공개 함수**다 — 스크리너 지표 배치
   (`yfinance/snapshot.py`)가 같은 규칙으로 읽어야 하고, 두 벌로 두면 한쪽만 고쳐
   화면의 ROE 와 스크리너의 ROE 가 100배 어긋난다.
3. `earningsTimestamp`는 **직전** 발표일이다. 다음 발표일은 `earningsTimestampStart`.
   이 규칙(과 UTC/KST 구분, calendar 폴백)은 `yfinance/calendar.py` 가 소유한다 —
   '오늘의 일정' 배치가 같은 날짜를 읽으므로 두 벌로 두면 한쪽만 고쳐 어긋난다.
"""

import logging
from dataclasses import dataclass
from typing import Any

from app.integrations.yfinance.calendar import extract_calendar_dates
from app.integrations.yfinance.client import is_empty_frame, load_yfinance
from app.schemas.stock import AnnualFinancial, QuarterlyFinancial, StockFundamentals
from app.utils.numbers import is_number, number_or_none

logger = logging.getLogger(__name__)

_ANNUAL_YEARS = 4
#: 공급자가 주는 분기 수 (실측 005930.KS: 5). 그보다 많이 와도 화면이 쓰지 않는다.
_QUARTERS = 5

# yfinance scrapers/quote.py 의 _VALUATION_MEASURE_LABELS 값과 정확히 일치해야 한다.
# 표시용 라벨이라 **이 파일 밖으로 나가지 않는다** — 호출부는 `Valuation` 을 받는다.
_PE_LABEL = "Trailing P/E"
_PB_LABEL = "Price/Book"
_MARKET_CAP_LABEL = "Market Cap"
_CURRENT_COLUMN = "Current"

# 손익계산서 행 이름. get_income_stmt(pretty=False) 의 원본 camelCase 라벨이다.
# pretty=True(= income_stmt 프로퍼티)는 camel2title 로 "Total Revenue"가 되는
# 표시용 변환이라 계약으로 삼지 않는다.
_REVENUE_KEYS = ("TotalRevenue", "OperatingRevenue")
_OPERATING_INCOME_KEYS = ("OperatingIncome", "TotalOperatingIncomeAsReported")
# 당기순이익. **지배주주 기준**이다 — 실측(005930.KS)에서 `NetIncome` 과
# `NetIncomeCommonStockholders` 가 44.26조로 같고,
# `NetIncomeIncludingNoncontrollingInterests`(45.21조)만 비지배지분을 포함한다.
# 국내 재무 사이트가 "당기순이익" 으로 보여주는 값이 앞의 둘이라 그쪽을 쓴다.
_NET_INCOME_KEYS = ("NetIncome", "NetIncomeCommonStockholders")


def _info(ticker: Any) -> dict:
    """`ticker.info`는 느리고 자주 실패한다 — 실패하면 빈 dict로 계속 진행한다."""
    try:
        info = ticker.info
    except Exception as exc:
        logger.debug("ticker.info 조회 실패: %s", exc)
        return {}

    return info if isinstance(info, dict) else {}


@dataclass(frozen=True)
class Valuation:
    """밸류에이션 표에서 읽은 값 한 벌.

    dict 가 아니라 이름 붙은 값으로 내보내는 이유: 키가 야후의 표시용 라벨
    (`"Trailing P/E"`)이라, 호출부가 그 문자열을 알아야 하면 공급자 표기가 이 파일
    밖으로 새어 나간다. 라벨이 바뀌는 날 고칠 곳이 여러 군데가 된다.
    """

    per: float | None = None
    pbr: float | None = None
    market_cap: float | None = None
    #: 응답을 받았는가. `False` 면 위 값들의 None 은 "없다" 가 아니라 "모른다" 다.
    ok: bool = False


def read_valuation(ticker: Any) -> Valuation:
    """PER · PBR · 시가총액을 밸류에이션 표에서 읽는다.

    국내 종목에서 PER/PBR 의 **유일한** 소스다. `AttributeError` 는 yfinance 가
    1.5 미만이라는 뜻이므로 debug 가 아니라 warning 으로 남긴다 — 그러지 않으면
    전 종목 PER 이 조용히 비어도 아무도 모른다.

    ## `ok` 가 왜 필요한가

    상세 화면은 이 구분이 필요 없다 — 값을 못 읽으면 그 자리를 비워 보여주면 끝이다.
    **지표를 DB 에 적재하는 배치는 다르다.** 거기서는 `None` 이 두 가지 뜻을 가진다.

        ok=True,  per=None    응답을 받았고 PER 이 없다 (적자 기업 등). **사실이다**
        ok=False, per=None    호출이 실패했다. 아무것도 모르는 상태다

    둘을 뭉개면 호출 한 번 실패했을 때 이미 적재된 PER 을 NULL 로 덮는다 — 16회차에
    일정 배치가 정확히 그렇게 데이터를 지웠다 (`schemas/stock.CalendarRecord` 주석).
    `get_info()` 와 **별개의 호출**이라 info 는 멀쩡한데 이쪽만 실패할 수 있다.
    """
    try:
        frame = ticker.get_valuation_measures(freq="yearly", periods=0)
    except AttributeError as exc:
        logger.warning(
            "get_valuation_measures 를 찾을 수 없습니다 (%s). yfinance>=1.5 가 필요합니다 "
            "— 국내 종목 PER/PBR 이 전부 비게 됩니다.",
            exc,
        )
        return Valuation()
    except Exception as exc:
        logger.debug("밸류에이션 조회 실패: %s", exc)
        return Valuation()

    if is_empty_frame(frame) or _CURRENT_COLUMN not in frame.columns:
        # 빈 표는 실패로 본다. 살아 있는 종목의 밸류에이션 표는 비지 않으므로,
        # 비었다면 조회가 막혔거나 심볼이 죽은 것이고 어느 쪽이든 "값이 없다" 고
        # 단정할 근거가 못 된다 (`yfinance/snapshot._fetch_one` 의 빈 info 와 같은 판단).
        return Valuation()

    def read(label: str) -> float | None:
        if label not in frame.index:
            return None
        return number_or_none(frame.loc[label, _CURRENT_COLUMN])

    return Valuation(
        per=read(_PE_LABEL), pbr=read(_PB_LABEL), market_cap=read(_MARKET_CAP_LABEL), ok=True
    )


def _price(ticker: Any, info: dict) -> float | None:
    """현재가. EPS/BPS 역산에만 쓴다 (market.py `_previous_close` 와 같은 체인)."""
    price = number_or_none(info.get("regularMarketPrice"))
    if price:
        return price

    try:
        return number_or_none(ticker.fast_info.get("last_price"))
    except Exception as exc:
        logger.debug("fast_info.last_price 조회 실패: %s", exc)
        return None


def roe_pct(info: dict) -> float | None:
    """`returnOnEquity`는 **소수**다 — 0.30792 → 30.79%.

    바로 아래 `dividend_yield_pct`와 단위 규약이 반대다. 실측: 005930.KS 0.30792,
    AAPL 1.4875(=148.75%). 크기로 소수/백분율을 판별하려는 시도는 하지 마라 —
    AAPL 의 1.49 를 걸러내는 임계값은 정상적인 고ROE 종목도 같이 망가뜨린다.
    """
    value = number_or_none(info.get("returnOnEquity"), digits=6)
    return round(value * 100, 2) if is_number(value) else None


def dividend_yield_pct(info: dict) -> float | None:
    """`dividendYield`는 **이미 백분율**이다 — 0.57 이 곧 0.57%다. 100을 곱하지 마라.

    실측 검증(005930.KS): dividendRate 1496 / regularMarketPrice 233,750 = 0.64%.
    dividendYield 값은 0.57 — 소수였다면 57%여야 하므로 백분율이 맞다.
    야후가 2025년 초 이 필드만 백분율로 바꿨고 yfinance 는 formatted=false 원본을
    그대로 통과시킨다(정규화 코드가 없다). 되돌아갈 수 있으니 화면에 57%가 뜨면
    가장 먼저 여기를 본다.
    """
    return number_or_none(info.get("dividendYield"))


def _first_row(frame: Any, keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in frame.index:
            return frame.loc[key]
    return None


def _income_frame(ticker: Any, freq: str) -> Any:
    """손익계산서 한 벌. 실패는 `None` 으로 접는다 — 재무 한 칸 때문에 상세가 죽지 않는다."""
    try:
        frame = ticker.get_income_stmt(pretty=False, freq=freq)
    except Exception as exc:
        logger.debug("%s 손익계산서 조회 실패: %s", freq, exc)
        return None
    return None if is_empty_frame(frame) else frame


def _quarterly(ticker: Any) -> list[QuarterlyFinancial]:
    """분기 손익 최대 5분기.

    **국내 종목에도 온다** — 실측(005930.KS)에서 5분기가 왔고 매출·영업이익·순이익이
    모두 있었다. 연간과 **같은 행 이름**을 쓰므로 아래 `_first_row` 를 그대로 쓴다.

    호출이 하나 더 붙는다(`ticker.info` + 밸류에이션 + 연간 + 분기). 종목당 1~2초가
    조금 더 늘지만 `fundamentals_service` 의 종목별 TTL 캐시가 반복 비용을 흡수하고,
    이 응답은 애초에 차트를 막지 않도록 분리된 호출이다(모듈 주석).

    분기 번호는 **컬럼의 월에서 유도한다.** 공급자가 주는 것은 분기 말일이라
    3월→1, 6월→2, 9월→3, 12월→4 다. 12월 결산이 아닌 회사는 이 계산이 회계
    분기와 어긋날 수 있는데, 화면이 쓰는 것은 "언제의 실적인가" 라 달력 분기가
    오히려 읽기 쉽다.
    """
    frame = _income_frame(ticker, "quarterly")
    if frame is None:
        return []

    revenue_row = _first_row(frame, _REVENUE_KEYS)
    income_row = _first_row(frame, _OPERATING_INCOME_KEYS)
    net_row = _first_row(frame, _NET_INCOME_KEYS)
    if revenue_row is None and income_row is None:
        return []

    rows: list[QuarterlyFinancial] = []
    for column in list(frame.columns)[:_QUARTERS]:
        year = getattr(column, "year", None)
        month = getattr(column, "month", None)
        if year is None or month is None:
            continue

        rows.append(
            QuarterlyFinancial(
                fiscal_year=int(year),
                quarter=(int(month) - 1) // 3 + 1,
                revenue=number_or_none(revenue_row[column]) if revenue_row is not None else None,
                operating_income=(
                    number_or_none(income_row[column]) if income_row is not None else None
                ),
                net_income=(number_or_none(net_row[column]) if net_row is not None else None),
            )
        )

    return rows


def _annual(ticker: Any) -> list[AnnualFinancial]:
    """연간 매출 · 영업이익 최대 4개년. 컬럼은 공급자가 이미 최신 우선으로 정렬해 준다."""
    frame = _income_frame(ticker, "yearly")
    if frame is None:
        return []

    revenue_row = _first_row(frame, _REVENUE_KEYS)
    income_row = _first_row(frame, _OPERATING_INCOME_KEYS)
    net_row = _first_row(frame, _NET_INCOME_KEYS)
    # 순이익은 게이트에 넣지 않는다 — 매출도 영업이익도 없는 표는 쓸 것이 없지만,
    # 순이익만 없는 표는 나머지 두 열이 여전히 쓸모 있다.
    if revenue_row is None and income_row is None:
        return []

    rows: list[AnnualFinancial] = []
    for column in list(frame.columns)[:_ANNUAL_YEARS]:
        year = getattr(column, "year", None)
        if year is None:
            continue

        rows.append(
            AnnualFinancial(
                fiscal_year=int(year),
                revenue=number_or_none(revenue_row[column]) if revenue_row is not None else None,
                operating_income=(
                    number_or_none(income_row[column]) if income_row is not None else None
                ),
                net_income=(
                    number_or_none(net_row[column]) if net_row is not None else None
                ),
            )
        )

    return rows


def _derive(numerator: float | None, denominator: float | None) -> float | None:
    """현재가 ÷ PER → EPS. 0 나눗셈과 None 을 한 곳에서 막는다."""
    if not is_number(numerator) or not is_number(denominator) or denominator == 0:
        return None

    return round(numerator / denominator, 2)


def build_fundamentals(ticker: Any, symbol: str) -> StockFundamentals:
    """Ticker 하나에서 재무·밸류에이션을 조립한다. 네트워크 생성과 분리해 둔 이유는
    테스트에서 스텁 ticker 를 그대로 주입하기 위해서다 (`tests/test_fundamentals_parse.py`).

    항목별 실패는 `None` 으로 흡수한다. 전 필드가 `None` 이어도 예외를 올리지 않는다.
    """
    info = _info(ticker)
    # 상세 화면은 `valuation.ok` 를 보지 않는다 — 못 읽은 칸은 비워 보여주면 된다.
    # 그 구분이 필요한 곳은 값을 **덮어쓰는** 배치뿐이다 (`read_valuation` 주석).
    valuation = read_valuation(ticker)

    per = valuation.per or number_or_none(info.get("trailingPE"))
    pbr = valuation.pbr or number_or_none(info.get("priceToBook"))
    price = _price(ticker, info)

    # 국내 종목은 trailingEps/bookValue 도 None 이라 역산이 유일한 경로다.
    # 화면의 PER·PBR 과 곱셈이 맞아떨어지는 값이지만 공시 EPS 와는 다르다.
    eps = number_or_none(info.get("trailingEps")) or _derive(price, per)
    bps = number_or_none(info.get("bookValue")) or _derive(price, pbr)

    # 날짜 두 개의 규칙(직전/다음 발표일, UTC/KST, calendar 폴백)은 여기가 아니라
    # `yfinance/calendar.py` 가 단일 출처다 — '오늘의 일정' 배치가 같은 규칙을 쓴다.
    ex_dividend, next_earnings = extract_calendar_dates(ticker, info)

    return StockFundamentals(
        symbol=symbol,
        currency=info.get("currency") or None,
        per=per,
        pbr=pbr,
        eps=eps,
        bps=bps,
        roe_pct=roe_pct(info),
        # 앱의 다른 곳(krx/market_cap.py)도 info["marketCap"] 을 쓴다. 밸류에이션 표의
        # Market Cap 은 야후의 다른 가격 기준이라 10% 가까이 어긋나므로 2차로 둔다.
        market_cap=number_or_none(info.get("marketCap")) or valuation.market_cap,
        dividend_yield_pct=dividend_yield_pct(info),
        dividend_per_share=(
            number_or_none(info.get("dividendRate"))
            or number_or_none(info.get("lastDividendValue"))
        ),
        ex_dividend_date=ex_dividend,
        next_earnings_date=next_earnings,
        annual=_annual(ticker),
        quarterly=_quarterly(ticker),
    )


def fetch_stock_fundamentals(symbol: str) -> StockFundamentals:
    """이미 해석된 심볼(예: `005930.KS`)의 재무·밸류에이션을 가져온다.

    후보 심볼 탐색을 하지 않는다 — 호출자는 `/stocks/history` 응답의 `symbol`을
    그대로 넘기므로 어떤 심볼이 유효한지 이미 알고 있다 (`/stocks/content`와 같은 계약).
    """
    yf = load_yfinance()
    return build_fundamentals(yf.Ticker(symbol), symbol)
