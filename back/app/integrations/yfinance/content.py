"""뉴스 · 애널리스트 리포트만 조회 (명세 6.3).

주가와 분리한 이유는 측정 결과다 — 6개월 OHLCV + 보조지표 계산이 0.13초인 반면
뉴스·리포트는 yfinance 추가 호출이 4~5회 필요해 2.2초가 걸린다(전체의 95%).
같은 응답에 묶으면 차트가 뉴스를 기다리므로 엔드포인트를 나눴다.

동기 함수다 — 서비스 계층이 `asyncio.to_thread`로 호출한다.
"""

import logging

from app.integrations.yfinance.client import load_yfinance
from app.integrations.yfinance.news import fetch_stock_news
from app.integrations.yfinance.reports import fetch_analyst_reports
from app.schemas.stock import StockContent

logger = logging.getLogger(__name__)

_NEWS_LIMIT = 3
_REPORT_LIMIT = 3


def fetch_stock_content(symbol: str) -> StockContent:
    """이미 해석된 심볼(예: `005930.KS`)에 대한 뉴스·리포트를 가져온다.

    후보 심볼 탐색을 하지 않는다 — 호출자는 `/stocks/history` 응답의 `symbol`을
    그대로 넘기므로 어떤 심볼이 유효한지 이미 알고 있다.

    부분 실패는 빈 목록으로 흡수한다. 뉴스가 없다고 화면 전체가 깨지면 안 된다.
    """
    yf = load_yfinance()
    ticker = yf.Ticker(symbol)

    try:
        news = fetch_stock_news(ticker, _NEWS_LIMIT)
    except Exception as exc:
        logger.warning("%s 뉴스 조회 실패 (%s) → 빈 목록", symbol, exc)
        news = []

    try:
        reports = fetch_analyst_reports(ticker, symbol, _REPORT_LIMIT)
    except Exception as exc:
        logger.warning("%s 리포트 조회 실패 (%s) → 빈 목록", symbol, exc)
        reports = []

    return StockContent(symbol=symbol, news=news, reports=reports)
