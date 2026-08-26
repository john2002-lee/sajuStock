"""재무 필드 해석. 스텁 ticker 를 넣어 네트워크 없이 고정한다.

이 파일이 지키는 것은 **실측으로 확인한 공급자 관례 세 가지**다. 셋 다 직관과 반대라
주석만으로는 다음 사람이 되돌린다.

1. `returnOnEquity` 는 소수(0.30792) → ×100 해야 30.79%
2. `dividendYield` 는 **이미 백분율**(0.57 = 0.57%) → 곱하면 안 된다
3. `earningsTimestamp` 는 **직전** 발표일 → 다음 발표일은 `earningsTimestampStart`

기준값은 2026-08-04에 005930.KS 로 직접 호출해 얻은 실제 응답이다.
"""

import pandas as pd

from app.integrations.yfinance import fundamentals
from app.integrations.yfinance.fundamentals import build_fundamentals

# 005930.KS 실측 응답에서 이 기능이 읽는 키만 추린 것.
_SAMSUNG_INFO = {
    "currency": "KRW",
    "trailingPE": None,  # 국내 종목은 항상 None 이다 — 이게 이 기능의 출발점이다
    "priceToBook": None,
    "trailingEps": None,
    "bookValue": None,
    "returnOnEquity": 0.30792,
    "marketCap": 1526725984911360,
    "dividendYield": 0.57,
    "dividendRate": 1496.0,
    "regularMarketPrice": 233750.0,
    "exDividendDate": 1782691200,  # 2026-06-29 (UTC 자정 정각)
    "earningsTimestamp": 1785304800,  # 2026-07-29 — 직전 발표일 (함정)
    "earningsTimestampStart": 1793167200,  # 2026-10-28 — 다음 발표일 (정답)
}

_VALUATION = pd.DataFrame(
    {"Current": [21.055587, 3.637733, 1.666e15]},
    index=["Trailing P/E", "Price/Book", "Market Cap"],
)

_INCOME = pd.DataFrame(
    {
        pd.Timestamp("2025-12-31"): [333_605_938_000_000, 43_601_051_000_000],
        pd.Timestamp("2024-12-31"): [300_870_903_000_000, 32_725_961_000_000],
    },
    index=["TotalRevenue", "OperatingIncome"],
)


# 인자를 생략한 것(기본값 사용)과 `None`(그 소스가 실패)을 구분해야 한다.
_DEFAULT = object()


class _StubTicker:
    """yfinance Ticker 의 이 기능이 쓰는 표면만 흉내낸다.

    `valuation=None` / `income=None` 은 **그 소스가 실패한다**는 뜻이다.
    """

    def __init__(self, info=_DEFAULT, valuation=_DEFAULT, income=_DEFAULT, calendar=None):
        self.info = _SAMSUNG_INFO if info is _DEFAULT else info
        self._valuation = _VALUATION if valuation is _DEFAULT else valuation
        self._income = _INCOME if income is _DEFAULT else income
        self._calendar = calendar or {}
        self.fast_info: dict = {}

    def get_valuation_measures(self, freq="quarterly", periods=5):
        if self._valuation is None:
            raise RuntimeError("밸류에이션 조회 실패")
        return self._valuation

    def get_income_stmt(self, pretty=True, freq="yearly"):
        if self._income is None:
            raise RuntimeError("손익 조회 실패")
        return self._income

    @property
    def calendar(self):
        return self._calendar


def test_roe_is_scaled_to_percent() -> None:
    """소수 0.30792 → 30.79%."""
    result = build_fundamentals(_StubTicker(), "005930.KS")

    assert result.roe_pct == 30.79


def test_dividend_yield_is_not_scaled() -> None:
    """0.57 은 이미 0.57% 다. 여기서 57.0 이 나오면 화면에 배당수익률 57%가 뜬다.

    검증 근거: dividendRate 1496 / regularMarketPrice 233,750 = 0.64%.
    소수였다면 57% 여야 하므로 백분율이 맞다.
    """
    result = build_fundamentals(_StubTicker(), "005930.KS")

    assert result.dividend_yield_pct == 0.57
    assert result.dividend_per_share == 1496.0


def test_next_earnings_uses_start_not_last() -> None:
    """earningsTimestamp(직전)가 아니라 earningsTimestampStart(다음)를 쓴다."""
    result = build_fundamentals(_StubTicker(), "005930.KS")

    assert result.next_earnings_date == "2026-10-28"
    assert result.next_earnings_date != "2026-07-29"


def test_ex_dividend_epoch_becomes_date() -> None:
    result = build_fundamentals(_StubTicker(), "005930.KS")

    assert result.ex_dividend_date == "2026-06-29"


def test_valuation_table_supplies_per_pbr_when_info_is_empty() -> None:
    """국내 종목의 유일한 PER/PBR 경로."""
    result = build_fundamentals(_StubTicker(), "005930.KS")

    assert result.per == 21.06
    assert result.pbr == 3.64


def test_info_is_fallback_for_per_pbr() -> None:
    """밸류에이션 표가 없으면 info 로 내려간다 (미국 종목 경로)."""
    info = {**_SAMSUNG_INFO, "trailingPE": 34.84, "priceToBook": 41.23}
    result = build_fundamentals(_StubTicker(info=info, valuation=None), "AAPL")

    assert result.per == 34.84
    assert result.pbr == 41.23


def test_eps_bps_are_derived_from_price_when_absent() -> None:
    """국내 종목은 trailingEps/bookValue 가 None 이라 역산이 유일한 경로다.

    화면의 PER·PBR 과 곱셈이 맞아떨어지는 값이다 (공시 EPS 와는 다르다).
    """
    result = build_fundamentals(_StubTicker(), "005930.KS")

    assert result.eps == round(233750.0 / 21.06, 2)
    assert result.bps == round(233750.0 / 3.64, 2)


def test_reported_eps_bps_win_over_derivation() -> None:
    info = {**_SAMSUNG_INFO, "trailingEps": 8.71, "bookValue": 7.36}
    result = build_fundamentals(_StubTicker(info=info), "AAPL")

    assert result.eps == 8.71
    assert result.bps == 7.36


def test_market_cap_prefers_info_over_valuation_table() -> None:
    """밸류에이션 표의 Market Cap 은 야후의 다른 가격 기준이라 10% 가까이 어긋난다."""
    result = build_fundamentals(_StubTicker(), "005930.KS")

    assert result.market_cap == 1526725984911360


def test_annual_rows_keep_newest_first() -> None:
    result = build_fundamentals(_StubTicker(), "005930.KS")

    assert [row.fiscal_year for row in result.annual] == [2025, 2024]
    assert result.annual[0].revenue == 333_605_938_000_000
    assert result.annual[0].operating_income == 43_601_051_000_000


def test_alternate_income_row_labels_are_accepted() -> None:
    """공급자가 종목에 따라 다른 행 이름을 준다."""
    income = pd.DataFrame(
        {pd.Timestamp("2025-12-31"): [1_000, 200]},
        index=["OperatingRevenue", "TotalOperatingIncomeAsReported"],
    )
    result = build_fundamentals(_StubTicker(income=income), "005930.KS")

    assert result.annual[0].revenue == 1_000
    assert result.annual[0].operating_income == 200


def test_every_source_failing_yields_all_null_not_an_exception() -> None:
    """전 항목 실패가 오류가 되면 재무 탭 하나가 상세 페이지를 죽인다."""
    ticker = _StubTicker(info={}, valuation=None, income=None)

    result = build_fundamentals(ticker, "999999.KQ")

    assert result.symbol == "999999.KQ"
    assert result.per is None
    assert result.pbr is None
    assert result.roe_pct is None
    assert result.dividend_yield_pct is None
    assert result.annual == []


def test_calendar_is_used_when_info_has_no_dates() -> None:
    info = {key: value for key, value in _SAMSUNG_INFO.items() if "arnings" not in key}
    info.pop("exDividendDate")
    ticker = _StubTicker(
        info=info,
        calendar={
            "Ex-Dividend Date": pd.Timestamp("2026-06-29"),
            "Earnings Date": [pd.Timestamp("2026-10-28")],
        },
    )

    result = build_fundamentals(ticker, "005930.KS")

    assert result.ex_dividend_date == "2026-06-29"
    assert result.next_earnings_date == "2026-10-28"


def test_missing_valuation_api_is_logged_loudly(caplog) -> None:
    """yfinance < 1.5 는 조용히 넘어가면 안 된다 — 전 종목 PER 이 비게 된다."""

    class _OldTicker(_StubTicker):
        def get_valuation_measures(self, freq="quarterly", periods=5):
            raise AttributeError("'Ticker' object has no attribute 'get_valuation_measures'")

    with caplog.at_level("WARNING", logger=fundamentals.logger.name):
        build_fundamentals(_OldTicker(), "005930.KS")

    assert any("yfinance>=1.5" in record.getMessage() for record in caplog.records)
