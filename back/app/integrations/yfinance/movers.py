"""등락률 랭킹 스캔 (홈 화면 상승/하락 상위).

동기 함수다 — 서비스 계층이 `asyncio.to_thread`로 호출한다.

**왜 yfinance 벌크인가.** 원래 자리는 KRX다: pykrx의 `get_market_price_change`
한 번이면 전 종목 등락률이 나온다. 그런데 KRX 데이터포털이 로그인을 요구하도록
바뀌어 `KRX_ID`/`KRX_PW` 없이는 전부 실패한다 (시가총액 배치가 같은 이유로
yfinance 폴백을 두고 있다). 그래서 여기서는 `yf.download` 로 여러 종목을 한 번에
받아 등락률을 직접 계산한다.

전 종목(2,700+)을 훑지 않고 모집단을 시가총액 상위로 좁히는 이유는 시간이다 —
200종목이 약 7초다. 모집단은 호출자가 정해 넘기므로(`settings.market_movers_universe_size`)
이 파일에는 종목 목록이 박혀 있지 않다.
"""

import logging
from collections.abc import Sequence
from typing import Any

from app.domain.symbols import normalize_stock_code
from app.integrations.yfinance.client import load_yfinance
from app.schemas.market import MoverRow, MoversScan
from app.schemas.stock import ListedCompanyRecord
from app.utils.numbers import number_or_none

logger = logging.getLogger(__name__)

#: 스파크라인 점 개수. 홈 카드가 76×24px 라 그 이상은 그려도 보이지 않는다.
_SPARK_POINTS = 24
#: 24봉을 채우고도 휴장·신규상장 여유가 남는 길이.
_HISTORY_PERIOD = "3mo"


def _closes_of(frame: Any, symbol: str) -> Any | None:
    """벌크 프레임에서 한 종목의 종가 시리즈를 꺼낸다.

    **종목 수가 아니라 컬럼 모양을 본다.** 예전에는 `len(symbols) == 1` 이면
    티커 레벨이 없다고 가정하고 `frame["Close"]` 를 읽었는데, 지금 핀(yfinance>=1.5)
    은 1종목에도 MultiIndex 를 유지한다 — 실측:

        columns = [('005930.KS', 'Open'), ('005930.KS', 'Close'), …]   nlevels=2

    그래서 그 분기가 항상 KeyError 로 떨어져 **1종목 스캔이 통째로 0건**이 됐다.
    모집단 200종목인 홈·탐색에서는 이 분기를 타지 않아 드러나지 않다가, 관심종목
    (담은 것만 조회한다)이 생기면서 나타났다.

    버전에 따라 다시 평평해질 수 있으므로 두 모양을 모두 받되, 개수로 추측하지 않고
    실제 컬럼을 본다.
    """
    try:
        columns = getattr(frame, "columns", None)
        if getattr(columns, "nlevels", 1) > 1:
            series = frame[symbol]["Close"]
        else:
            series = frame["Close"]
    except (KeyError, IndexError):
        return None
    return series.dropna()


#: 이 비율 밑으로 떨어지면 상류가 아니라 **우리 파싱**을 의심한다.
#:
#: 개별 종목이 빠지는 것은 정상이다(신규 상장·거래정지는 전일 종가가 없다). 하지만
#: 대다수가 빠지면 그건 프레임 모양이 바뀌었다는 뜻이다 — 실제로 그렇게 당했다:
#: yfinance 가 1종목에도 MultiIndex 를 유지하도록 바뀌면서 `_closes_of` 의 단일 분기가
#: 항상 KeyError 로 떨어졌고, **스캔은 "완료" 로 로그를 남기며 0건을 돌려줬다.**
_HEALTHY_YIELD = 0.5


def _report_yield(scanned: int, requested: int, as_of: str | None) -> None:
    """수확률을 보고한다. 낮으면 INFO 가 아니라 WARNING 이다.

    예전에는 무조건 INFO 였다. `0/1종목` 이 정상 완료와 똑같은 모양으로 찍혀 아무도
    보지 않았고, 관심종목 시세가 통째로 비어 있는 것을 사람이 눈으로 볼 때까지
    몰랐다 — **오류 없이 틀리는 버그는 로그 레벨이 유일한 조기 경보다.**
    """
    if requested and scanned / requested < _HEALTHY_YIELD:
        logger.warning(
            "등락률 스캔 수확률이 낮습니다: %d/%d종목 (기준일 %s) — "
            "상류 장애가 아니라면 응답 프레임 모양이 바뀐 것이다",
            scanned,
            requested,
            as_of,
        )
        return

    logger.info("등락률 스캔 완료: %d/%d종목 (기준일 %s)", scanned, requested, as_of)


def scan_movers(
    universe: Sequence[ListedCompanyRecord],
    *,
    universe_label: str,
) -> MoversScan:
    """모집단의 전일 대비 등락률을 계산해 내림차순 전체를 돌려준다.

    이름은 넘겨받은 KRX 상호를 쓴다. 공급자의 `shortName` 은 영문이거나
    (ECOPROBM) 아예 이름이 아닐 수 있어(`"247540.KS,0P0001GZPV,623889"`)
    목록·검색·상세와 표기가 어긋난다.
    """
    if not universe:
        return MoversScan(universe_label=universe_label)

    yf = load_yfinance()
    symbols = [record.symbol for record in universe]

    frame = yf.download(
        tickers=symbols,
        period=_HISTORY_PERIOD,
        interval="1d",
        group_by="ticker",
        auto_adjust=False,
        threads=True,
        progress=False,
    )
    if frame is None or frame.empty:
        logger.warning("등락률 스캔: 응답이 비었습니다 (모집단 %d종목)", len(symbols))
        return MoversScan(universe_label=universe_label, universe_size=len(symbols))

    rows: list[MoverRow] = []

    for record in universe:
        closes = _closes_of(frame, record.symbol)
        # 전일 종가가 있어야 등락률이 성립한다 — 신규 상장·거래정지는 여기서 빠진다.
        if closes is None or len(closes) < 2:
            continue

        previous = number_or_none(closes.iloc[-2])
        latest = number_or_none(closes.iloc[-1])
        if not previous or latest is None:
            continue

        change = latest - previous
        rows.append(
            MoverRow(
                name=record.name,
                symbol=record.symbol,
                code=normalize_stock_code(record.symbol),
                market=record.market,
                price=latest,
                change=round(change, 2),
                change_percent=round(change / previous * 100, 2),
                spark=[
                    value
                    for value in (
                        number_or_none(point) for point in closes.tail(_SPARK_POINTS)
                    )
                    if value is not None
                ],
            )
        )

    rows.sort(key=lambda row: row.change_percent, reverse=True)

    as_of = None
    if len(frame.index):
        as_of = str(frame.index[-1].date())

    _report_yield(len(rows), len(symbols), as_of)
    return MoversScan(
        as_of=as_of,
        source="YFINANCE",
        universe_label=universe_label,
        universe_size=len(symbols),
        rows=rows,
    )
