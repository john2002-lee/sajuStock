"""KRX / KIND 상장사 목록 수집 (명세 6.2).

원본은 블로킹 `urllib.request`를 스레드풀에 던졌다. 여기서는 `httpx.AsyncClient`로
네이티브 비동기 호출을 한다 — 이벤트 루프를 막지 않고 스레드도 쓰지 않는다.
"""

import asyncio
import logging
import re
from collections.abc import Iterable
from datetime import date, timedelta

import httpx

from app.core.config import settings
from app.domain.constants import (
    KOREAN_STOCK_MARKETS_BY_SYMBOL,
    KOREAN_STOCK_NAMES_BY_SYMBOL,
)
from app.domain.symbols import krx_symbol_to_yfinance, normalize_stock_code
from app.integrations.krx.parser import parse_kind_html, parse_krx_csv
from app.integrations.krx.session import prepare_pykrx
from app.schemas.stock import ListedCompanyRecord, ListedSource
from app.utils.text import clean_text, get_initial_consonants

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


# pykrx 가 종목 목록을 받는 시장 라벨. `ALL` 이 없어 셋을 각각 받아 합친다.
_PYKRX_MARKETS = ("KOSPI", "KOSDAQ", "KONEX")
# KRX 코드가 순수 6자리 숫자인지. 전환·신형 우선주와 일부 신규 상장 종목은 코드 끝에
# 영문이 붙는데(`37550K` DL이앤씨우 · `0013V0` 삼진식품), `normalize_stock_code` 가 그
# 영문을 버려 5자리로 뭉갠다. 그러면 접미사가 붙지 않아 `_BOARD_FILTER` 가 어차피
# 걸러내고, 더 나쁜 것은 **서로 다른 종목이 같은 코드로 충돌**한다는 점이다
# (실측 2,872건 중 82건 · 충돌 14개 그룹, `00410` 에는 3종목). 뭉개서 넣는 것보다
# 버리는 편이 낫다 — 되살리려면 `normalize_stock_code` 와 관심종목 라우터의 코드
# 검증, yfinance 심볼 해석을 함께 손봐야 한다.
_PURE_CODE = re.compile(r"\d{6}")
# 휴장일이면 직전 영업일로 내려간다 (`market_cap._MAX_LOOKBACK_DAYS` 와 같은 이유).
_MAX_LOOKBACK_DAYS = 10


def build_records_from_tickers(
    rows: Iterable[tuple[str, str, str]],
) -> list[ListedCompanyRecord]:
    """`(코드, 이름, 시장)` 을 적재 레코드로 옮긴다. 순수 함수 — 테스트가 이걸 본다.

    파서의 `_make_record` 와 같은 규약이지만 CSV/HTML 이 아니라 pykrx 의 튜플을 받는다.
    접미사(`.KS`/`.KQ`)와 초성을 여기서 채우는 것이 중요하다 — 접미사가 없으면
    `top_by_market_cap` 의 보드 필터가 그 행을 버리고, 초성이 비면 `find_candidates`
    의 초성 조회가 조용히 0건이 된다.
    """
    records: list[ListedCompanyRecord] = []
    seen: set[str] = set()
    dropped = 0
    for code, name, market in rows:
        cleaned = clean_text(code)
        if not name or not _PURE_CODE.fullmatch(cleaned):
            dropped += 1
            continue
        normalized = normalize_stock_code(cleaned)
        if not normalized or normalized in seen:
            dropped += 1
            continue
        seen.add(normalized)
        records.append(
            ListedCompanyRecord(
                symbol=krx_symbol_to_yfinance(normalized, market),
                name=name,
                market=market or None,
                initial_consonants=get_initial_consonants(name),
            )
        )

    if dropped:
        logger.info(
            "코드 형태가 맞지 않아 %d건 제외했습니다 (영문 포함 또는 중복)", dropped
        )
    return records


def _collect_tickers_blocking() -> list[tuple[str, str, str]]:
    """pykrx 로 전 종목을 받는다. **블로킹이므로 스레드에서 부른다.**

    `get_market_ticker_list` 가 우선주를 **종목으로** 준다 — 그것이 이 소스를 1차로
    올린 이유 전부다. KIND 는 상장법인 목록이라 회사당 보통주 하나뿐이고, 거기서
    빠진 종목은 검색 단계에서 되살릴 방법이 없다 (삼성전자우 005935 가 그랬다).
    """
    stock = prepare_pykrx()

    day = date.today()
    for _ in range(_MAX_LOOKBACK_DAYS):
        ymd = day.strftime("%Y%m%d")
        rows: list[tuple[str, str, str]] = []
        for market in _PYKRX_MARKETS:
            for ticker in stock.get_market_ticker_list(ymd, market=market) or []:
                rows.append((ticker, stock.get_market_ticker_name(ticker), market))
        if rows:
            return rows
        # 휴장일이면 어느 시장도 티커를 주지 않는다. 하루 내린다.
        day -= timedelta(days=1)

    return []


async def fetch_listed_companies_via_pykrx() -> list[ListedCompanyRecord]:
    """1차 소스. 자격증명(`KRX_ID`/`KRX_PW`)이 있어야 값이 나온다.

    없으면 pykrx 가 빈 목록을 주고 호출부가 KIND 로 내려간다 — 자격증명 없는 개발
    환경을 버리지 않기 위해 예외로 만들지 않는다.
    """
    rows = await asyncio.to_thread(_collect_tickers_blocking)
    return build_records_from_tickers(rows)


async def collect_listed_companies() -> tuple[list[ListedCompanyRecord], ListedSource]:
    """pykrx → KIND → 내부 기본값 순서로 시도한다.

    어느 경로에서 성공했는지를 함께 돌려준다 — 로그로만 남기면 프런트가
    "일부 종목이 빠질 수 있다"는 사실을 사용자에게 알릴 방법이 없다 (와이어프레임 1d).

    ## 왜 1차가 CSV 다운로드가 아니라 pykrx 인가

    예전 1차 소스는 `data.krx.co.kr` 의 OTP + CSV 다운로드였다. KRX 가 로그인을
    요구하도록 바뀐 뒤 그 경로는 **한 번도 성공하지 못했다** — `GenerateOTP` 가
    토큰 대신 문자열 `LOGOUT` 을 주고 CSV 는 403 이 된다. 세션 쿠키·브라우저
    User-Agent·Origin 을 다 붙여도 같다.

    문제는 그 실패가 조용했다는 것이다. KIND 폴백이 2,800건을 성공적으로 가져오니
    에러도 빈 화면도 없었다. 그런데 **KIND 는 상장법인 목록**이라 회사당 보통주
    하나뿐이고, 우선주 109종목이 통째로 빠졌다 — 삼성전자우(005935)를 검색해도
    아무것도 나오지 않은 이유다.

    pykrx 는 같은 로그인을 `krx/session.prepare_pykrx()` 로 통과하고 우선주를
    종목으로 준다. 시가총액 수집이 이미 그 경로로 동작하고 있었다.

    `fetch_krx_listed_companies` 는 **남겨 둔다** — 로그인 없이 CSV 를 받을 수 있게
    KRX 가 되돌리거나 자격증명 없는 환경에서 다시 쓸 수 있고, 지운다고 얻는 것이 없다.
    """
    try:
        records = await fetch_listed_companies_via_pykrx()
        if records:
            logger.info("pykrx 상장사 목록 %d건 수집 (우선주 포함)", len(records))
            return records, "KRX"
        logger.warning(
            "pykrx 가 빈 목록을 주었습니다 (KRX_ID/KRX_PW 미설정?) → KIND로 폴백"
        )
    except Exception as exc:  # noqa: BLE001 - 어떤 실패든 폴백이 있어야 한다
        logger.warning("pykrx 상장사 목록 수집 실패 (%s) → KIND로 폴백", exc)

    timeout = httpx.Timeout(settings.http_timeout_seconds)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        try:
            records = await fetch_kind_listed_companies(client)
            if records:
                logger.warning(
                    "KIND 상장사 목록 %d건 수집 — **우선주가 누락됩니다** (상장법인 목록)",
                    len(records),
                )
                return records, "KIND"
            logger.warning("KIND 응답이 비어 있습니다 → 내부 기본 종목 사용")
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("KIND 상장사 목록 수집 실패 (%s) → 내부 기본 종목 사용", exc)

    records = fallback_listed_companies()
    logger.warning("내부 기본 종목 %d건으로 대체했습니다 (일부 종목이 누락됩니다)", len(records))
    return records, "INTERNAL"
