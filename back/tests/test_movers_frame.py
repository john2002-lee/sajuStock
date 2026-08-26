"""`yf.download` 프레임에서 종가를 꺼내는 부분.

여기가 틀리면 **조용히 0건**이 된다. 스캔은 성공하고 로그도 정상인데 결과만 비어서,
"상류가 오늘 데이터를 안 준다"로 오해하기 딱 좋다. 실제로 한 번 그랬다 —
1종목 스캔이 통째로 0건이었고, 모집단 200종목인 홈·탐색에서는 그 분기를 타지 않아
관심종목이 생길 때까지 드러나지 않았다.

`yf.download` 를 부르지 않는다. 컬럼 모양만 흉내 낸 프레임으로 충분하고, 그래야
상류가 막힌 날에도 이 계약이 검증된다.
"""

import pandas as pd

from app.integrations.yfinance.movers import _closes_of


def _multi_frame(symbol: str, closes: list[float]) -> pd.DataFrame:
    """지금 핀(yfinance>=1.5)이 주는 모양 — **1종목이어도 티커 레벨이 있다.**"""
    columns = pd.MultiIndex.from_product([[symbol], ["Open", "Close"]])
    return pd.DataFrame(
        [[close, close] for close in closes], columns=columns
    )


def _flat_frame(closes: list[float]) -> pd.DataFrame:
    """예전 yfinance 가 1종목에 주던 모양. 다시 평평해질 수 있어 계속 받는다."""
    return pd.DataFrame({"Open": closes, "Close": closes})


def test_single_symbol_multiindex_is_read() -> None:
    """이것이 실제로 깨졌던 경우다.

    종목 수로 분기해 `frame["Close"]` 를 읽으면 KeyError 가 나고, 호출부는 그것을
    '데이터 없음'으로 처리해 조용히 건너뛴다.
    """
    frame = _multi_frame("005930.KS", [70_000.0, 71_400.0])

    closes = _closes_of(frame, "005930.KS")

    assert closes is not None
    assert list(closes) == [70_000.0, 71_400.0]


def test_multi_symbol_frame_is_read() -> None:
    columns = pd.MultiIndex.from_product([["005930.KS", "000660.KS"], ["Close"]])
    frame = pd.DataFrame([[70_000.0, 198_300.0]], columns=columns)

    assert list(_closes_of(frame, "000660.KS")) == [198_300.0]


def test_flat_frame_is_still_read() -> None:
    assert list(_closes_of(_flat_frame([70_000.0]), "005930.KS")) == [70_000.0]


def test_unknown_symbol_is_none_not_an_error() -> None:
    """모집단에 있는데 상류가 안 준 종목. 예외가 아니라 '없음'이어야 한 종목의
    실패가 스캔 전체를 죽이지 않는다."""
    frame = _multi_frame("005930.KS", [70_000.0])

    assert _closes_of(frame, "999999.KS") is None


def test_nan_closes_are_dropped() -> None:
    """휴장·거래정지 구간. 남겨 두면 등락률이 NaN 이 되어 화면에 그대로 샌다."""
    frame = _multi_frame("005930.KS", [70_000.0, float("nan"), 71_400.0])

    assert list(_closes_of(frame, "005930.KS")) == [70_000.0, 71_400.0]
