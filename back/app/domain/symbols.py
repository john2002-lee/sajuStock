"""종목 코드 · 종목명 정규화 (명세 6.2).

전부 순수 함수라 네트워크나 DB 없이 단위 테스트할 수 있다.
"""

import re
from typing import Literal

from app.domain.constants import (
    COMMON_STOCK_NAMES,
    COMMON_STOCK_SYMBOLS,
    KOREAN_STOCK_NAMES_BY_SYMBOL,
)
from app.utils.text import clean_text

_DIGITS_ONLY = re.compile(r"\D")
_SIX_DIGITS = re.compile(r"\d{6}")
_KOSDAQ_MARKERS = ("KOSDAQ", "KONEX", "코스닥", "코넥스")
# 티커·내부 ID 처럼 생긴 토큰 (공백이 없다). 사람이 읽는 상호에는 공백이나
# 한글이 섞이므로 이 패턴만으로 이루어진 값은 이름이 아니다.
_IDENTIFIER_TOKEN = re.compile(r"[A-Za-z0-9.\-^=]+")


def _alias_key(symbol: str) -> str:
    return symbol.strip().replace(" ", "").lower()


def normalize_stock_candidates(symbol: str) -> list[str]:
    """입력 한 건을 yfinance에 순서대로 시도할 후보 심볼 목록으로 바꾼다."""
    raw_symbol = symbol.strip()
    key = _alias_key(raw_symbol)

    if key in COMMON_STOCK_SYMBOLS:
        return [COMMON_STOCK_SYMBOLS[key]]

    if raw_symbol.isdigit() and len(raw_symbol) == 6:
        # 코스피/코스닥 접미사를 모르면 둘 다 시도한다.
        return [f"{raw_symbol}.KS", f"{raw_symbol}.KQ", raw_symbol]

    return [raw_symbol.upper()]


def get_common_stock_name(symbol: str) -> str | None:
    return COMMON_STOCK_NAMES.get(_alias_key(symbol))


def normalize_stock_code(symbol: str) -> str:
    """`005930.KS` → `005930`. 숫자가 아닌 문자는 버린다."""
    return _DIGITS_ONLY.sub("", symbol.split(".", 1)[0])[:6]


def get_korean_stock_name(symbol: str) -> str | None:
    return KOREAN_STOCK_NAMES_BY_SYMBOL.get(normalize_stock_code(symbol))


def is_usable_stock_name(name: str | None, symbol: str) -> bool:
    """공급자가 준 문자열을 화면 제목으로 내보내도 되는지.

    야후에 없는 심볼을 물으면 yfinance의 `shortName`이 검색 결과를 그대로
    흘려보낸다 — `247540.KS`를 물었을 때 돌아온 값이
    `"247540.KS,0P0001GZPV,623889"` 였다. 이런 값이 상세 화면 제목에 뜨면
    어떤 종목인지 알 수 없으므로, 이름이 아니라 '이름 없음'으로 취급해
    호출부가 다음 후보로 넘어가게 한다.
    """
    text = clean_text(name)
    if not text:
        return False

    # 심볼이나 코드를 되돌려준 것은 이름이 아니다.
    if text.upper() in {clean_text(symbol).upper(), normalize_stock_code(symbol)}:
        return False

    # 쉼표로 이어붙인 식별자 목록. 상호에는 공백·한글이 섞이므로
    # "Alphabet Inc., Class A" 같은 정상 이름은 여기 걸리지 않는다.
    if "," in text and all(
        _IDENTIFIER_TOKEN.fullmatch(part.strip()) for part in text.split(",")
    ):
        return False

    return True


def krx_symbol_to_yfinance(symbol: str, market: str | None) -> str:
    """KRX 6자리 코드 + 시장 구분 → yfinance 심볼 (`.KS` / `.KQ`)."""
    code = clean_text(symbol).split(".", 1)[0]
    if not _SIX_DIGITS.fullmatch(code):
        return code or symbol

    market_text = clean_text(market).upper()
    suffix = ".KQ" if any(marker in market_text for marker in _KOSDAQ_MARKERS) else ".KS"
    return f"{code}{suffix}"


def board_of(symbol: str) -> Literal["KOSPI", "KOSDAQ"] | None:
    """`.KS` → KOSPI, `.KQ` → KOSDAQ. 접미사가 없으면 판정하지 않는다(None).

    **DB의 `market` 컬럼을 쓰지 않는 이유**: 그 값은 수집 소스에 따라 한글이 들어온다
    (실측 `코스닥`·`유가`·`코넥스`). `KOSPI`/`KOSDAQ` 문자열은 한 건도 없어서
    `market == "KOSPI"` 같은 비교는 항상 거짓이다. 반면 접미사는 위
    `krx_symbol_to_yfinance` 가 시장 구분을 보고 붙인 값이고 **실제로 공급자에게
    물어본 심볼 그 자체**라, 그 행의 시세와 절대 어긋날 수 없다.

    코넥스도 `_KOSDAQ_MARKERS` 에 걸려 `.KQ` 가 되므로 KOSDAQ 로 분류된다. 이 함수를
    쓰는 랭킹은 시가총액 상위 모집단이라 코넥스가 올라올 일이 없어 그대로 둔다.
    """
    if symbol.endswith(".KS"):
        return "KOSPI"
    if symbol.endswith(".KQ"):
        return "KOSDAQ"
    return None
