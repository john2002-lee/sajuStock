"""시가총액 수집 (자동완성 랭킹 가중치용).

두 소스를 순서대로 시도한다.

1. **pykrx** — `get_market_cap_by_ticker(date)` 한 번으로 전 종목을 받는다. 가장 싸다.
   단, KRX 데이터포털이 로그인을 요구하도록 바뀌어 `KRX_ID` / `KRX_PW` 가 없으면
   실패한다. pykrx 는 그것을 **`os.environ` 에서** 읽으므로 `.env` 에 적어 두는 것만
   으로는 닿지 않는다 — 그 간극을 `_prepare_pykrx()` 가 메운다.
2. **yfinance** — 종목당 1회 호출이라 비싸다(~1초). 그래서 폴백이고, 아직 시총이 없는
   종목만, 한 번에 `limit` 개까지만 채운다. 며칠에 걸쳐 채워지는 것을 전제로 한다.

실시간성은 필요 없다 — "삼성" 입력에 삼성전자가 먼저 나오게 하는 용도라 시총이
며칠 스테일해도 순서가 바뀌지 않는다.
"""

import contextlib
import io
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from types import ModuleType

from app.core.config import settings
from app.schemas.stock import MarketCapRecord

logger = logging.getLogger(__name__)

# 휴장일이면 직전 영업일로 내려간다. 연휴가 가장 긴 경우(설·추석 + 주말)를 덮는다.
_MAX_LOOKBACK_DAYS = 10
_KRX_MARKETS = ("KOSPI", "KOSDAQ")
# yfinance 폴백의 동시 요청 수. 너무 올리면 Yahoo 가 조인다.
_YF_WORKERS = 8


def _to_yyyymmdd(value: date) -> str:
    return value.strftime("%Y%m%d")


_pykrx_stock: ModuleType | None = None


def _prepare_pykrx() -> ModuleType:
    """pykrx 를 쓸 수 있는 상태로 만들고 `stock` 모듈을 돌려준다.

    ## 자격증명을 `os.environ` 으로 옮기는 것이 이 함수의 핵심이다

    pykrx 는 `os.getenv("KRX_ID")` 를 직접 읽는다. 반면 pydantic-settings 는 `.env`
    를 `Settings` 객체로만 옮기고 `os.environ` 은 건드리지 않는다(`dotenv_values`).
    그래서 `.env` 를 정확히 채워도 pykrx 에는 닿지 않았고, 배치는 자격증명이 있는데도
    매번 yfinance 폴백으로 내려갔다. 경계 밖 라이브러리의 규약이므로 경계에서 흡수한다.

    ## import 보다 **먼저** 넣어야 한다

    pykrx 는 import 시점에 로그인한다 — `website/comm/webio.py` 가 모듈 최상단에서
    `build_krx_session()` 을 부르고, 그 기본 인자가 `os.getenv("KRX_ID")` 다. 둘 다
    import 때 확정되므로 순서가 뒤집히면 첫 로그인이 빈손으로 나간다. 그래서 import
    를 이 함수가 소유한다 — 호출부가 순서를 지켜야 할 필요를 없앤다.

    ## 그 로그인이 **로그인 ID 를 stdout 에 찍는다**

    서버 로그에 계정을 남길 이유가 없어 삼켜서 DEBUG 로만 흘린다. 세션 만료 뒤의
    재로그인은 ID 를 찍지 않으므로(`comm/auth.get_auth_session`) 이 한 번으로 족하다.
    """
    global _pykrx_stock
    if _pykrx_stock is not None:
        return _pykrx_stock

    # 빈 문자열은 넣지 않는다 — pykrx 는 truthy 검사를 하므로 결과는 같지만,
    # 실제 OS 환경변수로 자격증명을 준 경우를 빈 `.env` 값이 덮어써서는 안 된다.
    if settings.krx_id:
        os.environ["KRX_ID"] = settings.krx_id
    if settings.krx_pw:
        os.environ["KRX_PW"] = settings.krx_pw

    chatter = io.StringIO()
    with contextlib.redirect_stdout(chatter):
        from pykrx import stock

    for line in chatter.getvalue().splitlines():
        if line.strip():
            logger.debug("pykrx: %s", line.strip())

    _pykrx_stock = stock
    return stock


def _fetch_one_day(day: date) -> dict[str, int]:
    """해당 일자의 전 종목 시총. 휴장일이면 빈 dict."""
    stock = _prepare_pykrx()

    caps: dict[str, int] = {}
    for market in _KRX_MARKETS:
        frame = stock.get_market_cap_by_ticker(_to_yyyymmdd(day), market=market)
        if frame is None or frame.empty:
            continue
        for ticker, row in frame.iterrows():
            value = row.get("시가총액")
            if value is None:
                continue
            try:
                cap = int(value)
            except (TypeError, ValueError):
                continue
            if cap > 0:
                caps[str(ticker)] = cap
    return caps


def fetch_market_caps_from_krx(today: date | None = None) -> MarketCapRecord:
    """1차 소스. 전 종목 시총을 한 번에. 휴장일이면 직전 영업일로 폴백한다.

    블로킹 호출이므로 서비스 계층에서 `asyncio.to_thread` 로 감싼다.
    실패해도 예외를 올리지 않는다 — 시총은 랭킹 가중치일 뿐이고 이것 때문에
    자동완성이 죽어서는 안 된다.
    """
    cursor = today or datetime.now().date()

    for offset in range(_MAX_LOOKBACK_DAYS):
        day = cursor - timedelta(days=offset)
        # 주말은 조회조차 하지 않는다 (월=0 … 토=5, 일=6).
        if day.weekday() >= 5:
            continue
        try:
            caps = _fetch_one_day(day)
        except Exception as exc:  # noqa: BLE001 - 외부 라이브러리 예외 종류가 넓다
            logger.warning("KRX 시가총액 조회 실패 (%s): %s", day, exc)
            continue

        if caps:
            logger.info("KRX 시가총액 %d종목 수집 (기준일 %s)", len(caps), day)
            return MarketCapRecord(as_of=day.isoformat(), caps=caps)

        logger.info("KRX 응답이 비어 있습니다 (휴장 추정 %s) → 직전 영업일로", day)

    if not settings.krx_bulk_enabled:
        # 원인을 짚어 준다. 이 경로에서 예전에는 "로그인 필요 여부 확인" 만 남았고,
        # 설정이 채워져 있는데도 같은 문장이 나와 원인을 찾는 데 오래 걸렸다.
        logger.warning(
            "KRX_ID / KRX_PW 가 설정되지 않아 시가총액 벌크를 건너뜁니다 — "
            "yfinance 폴백으로 내려갑니다"
        )
    else:
        logger.warning(
            "KRX 로그인 정보는 있으나 시가총액을 가져오지 못했습니다 (자격증명 또는 KRX 응답 확인)"
        )
    return MarketCapRecord(as_of=None, caps={})


def _yf_market_cap(symbol: str) -> tuple[str, int | None]:
    """yfinance 단일 종목 시총. 실패는 None 으로 흡수한다."""
    import yfinance as yf

    try:
        info = yf.Ticker(symbol).get_info()
        value = info.get("marketCap")
        return symbol, int(value) if value else None
    except Exception:  # noqa: BLE001 - 종목 하나가 배치 전체를 세우면 안 된다
        return symbol, None


def fetch_market_caps_from_yfinance(symbols: list[str]) -> MarketCapRecord:
    """2차 소스. 종목당 1회 호출이라 호출자가 목록을 좁혀서 넘긴다.

    반환 키는 KRX 소스와 맞추기 위해 접미사를 뗀 6자리 코드다.
    """
    if not symbols:
        return MarketCapRecord(as_of=None, caps={})

    caps: dict[str, int] = {}
    with ThreadPoolExecutor(max_workers=_YF_WORKERS) as pool:
        for symbol, cap in pool.map(_yf_market_cap, symbols):
            if cap and cap > 0:
                caps[symbol.split(".", 1)[0]] = cap

    logger.info(
        "yfinance 시가총액 %d/%d종목 수집", len(caps), len(symbols)
    )
    return MarketCapRecord(
        as_of=datetime.now().date().isoformat() if caps else None, caps=caps
    )
