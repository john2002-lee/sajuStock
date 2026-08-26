"""KRX / KIND 상장사 목록 수집 (명세 6.2).

원본은 블로킹 `urllib.request`를 스레드풀에 던졌다. 여기서는 `httpx.AsyncClient`로
네이티브 비동기 호출을 한다 — 이벤트 루프를 막지 않고 스레드도 쓰지 않는다.
"""

import logging

import httpx

from app.core.config import settings
from app.domain.constants import (
    KOREAN_STOCK_MARKETS_BY_SYMBOL,
    KOREAN_STOCK_NAMES_BY_SYMBOL,
)
from app.domain.symbols import krx_symbol_to_yfinance
from app.integrations.krx.parser import parse_kind_html, parse_krx_csv
from app.schemas.stock import ListedCompanyRecord, ListedSource
from app.utils.text import get_initial_consonants

logger = logging.getLogger(__name__)

_KRX_OTP_URL = "https://data.krx.co.kr/comm/fileDn/GenerateOTP/generate.cmd"
_KRX_CSV_URL = "https://data.krx.co.kr/comm/fileDn/download_csv/download.cmd"
_KRX_REFERER = "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader"

_KIND_URL = "https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13"
_KIND_REFERER = "https://kind.krx.co.kr/corpgeneral/corpList.do?method=loadInitPage"

_USER_AGENT = "Mozilla/5.0"
# KRX와 KIND는 모두 EUC-KR로 응답한다.
_KOREAN_ENCODING = "euc-kr"

_KRX_OTP_PARAMS = {
    "locale": "ko_KR",
    "mktId": "ALL",
    "share": "1",
    "csvxls_isNo": "false",
    "name": "fileDown",
    "url": "dbms/MDC/STAT/standard/MDCSTAT01901",
}


async def fetch_krx_listed_companies(client: httpx.AsyncClient) -> list[ListedCompanyRecord]:
    """1차 소스. OTP를 받아 CSV를 내려받는 2단계 흐름."""
    otp_response = await client.post(
        _KRX_OTP_URL,
        data=_KRX_OTP_PARAMS,
        headers={"Referer": _KRX_REFERER, "User-Agent": _USER_AGENT},
    )
    otp_response.raise_for_status()
    otp = otp_response.text.strip()

    csv_response = await client.post(
        _KRX_CSV_URL,
        data={"code": otp},
        headers={"Referer": _KRX_REFERER, "User-Agent": _USER_AGENT},
    )
    csv_response.raise_for_status()

    return parse_krx_csv(csv_response.content.decode(_KOREAN_ENCODING, errors="replace"))


async def fetch_kind_listed_companies(client: httpx.AsyncClient) -> list[ListedCompanyRecord]:
    """2차 소스. KRX가 실패했을 때의 HTML 테이블 폴백."""
    response = await client.get(
        _KIND_URL,
        headers={"Referer": _KIND_REFERER, "User-Agent": _USER_AGENT},
    )
    response.raise_for_status()

    return parse_kind_html(response.content.decode(_KOREAN_ENCODING, errors="replace"))


def fallback_listed_companies() -> list[ListedCompanyRecord]:
    """3차 소스. 네트워크 없이도 자동완성이 최소한 동작하도록 하는 내부 기본 종목."""
    return [
        ListedCompanyRecord(
            symbol=krx_symbol_to_yfinance(code, KOREAN_STOCK_MARKETS_BY_SYMBOL.get(code, "KOSPI")),
            name=name,
            market=KOREAN_STOCK_MARKETS_BY_SYMBOL.get(code, "KOSPI"),
            initial_consonants=get_initial_consonants(name),
        )
        for code, name in KOREAN_STOCK_NAMES_BY_SYMBOL.items()
    ]


async def collect_listed_companies() -> tuple[list[ListedCompanyRecord], ListedSource]:
    """KRX → KIND → 내부 기본값 순서로 시도한다.

    어느 경로에서 성공했는지를 함께 돌려준다 — 로그로만 남기면 프런트가
    "일부 종목이 빠질 수 있다"는 사실을 사용자에게 알릴 방법이 없다 (와이어프레임 1d).
    """
    timeout = httpx.Timeout(settings.http_timeout_seconds)

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        try:
            records = await fetch_krx_listed_companies(client)
            if records:
                logger.info("KRX 상장사 목록 %d건 수집", len(records))
                return records, "KRX"
            logger.warning("KRX 응답이 비어 있습니다 → KIND로 폴백")
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("KRX 상장사 목록 수집 실패 (%s) → KIND로 폴백", exc)

        try:
            records = await fetch_kind_listed_companies(client)
            if records:
                logger.info("KIND 상장사 목록 %d건 수집", len(records))
                return records, "KIND"
            logger.warning("KIND 응답이 비어 있습니다 → 내부 기본 종목 사용")
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("KIND 상장사 목록 수집 실패 (%s) → 내부 기본 종목 사용", exc)

    records = fallback_listed_companies()
    logger.warning("내부 기본 종목 %d건으로 대체했습니다 (일부 종목이 누락됩니다)", len(records))
    return records, "INTERNAL"
