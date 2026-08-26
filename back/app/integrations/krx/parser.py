"""KRX CSV · KIND HTML 파서. 순수 함수라 고정 픽스처로 테스트할 수 있다."""

import csv
import io
import re
from html import unescape

from app.domain.symbols import krx_symbol_to_yfinance, normalize_stock_code
from app.schemas.stock import ListedCompanyRecord
from app.utils.text import clean_text, get_initial_consonants

_ROW_PATTERN = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S | re.I)
_CELL_PATTERN = re.compile(r"<t[dh][^>]*>(.*?)</t[dh]>", re.S | re.I)
_TAG_PATTERN = re.compile(r"<.*?>")

# KRX CSV는 헤더 표기가 자주 바뀐다 — 알려진 이름을 모두 시도한다.
_SYMBOL_KEYS = ("단축코드", "종목코드", "isuSrtCd", "ISU_SRT_CD")
_NAME_KEYS = ("한글 종목명", "종목명", "isuKorNm", "ISU_KOR_NM")
_MARKET_KEYS = ("시장구분", "시장구분명", "mktNm", "MKT_NM")


def _first_value(row: dict[str, str], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = row.get(key)
        if value:
            return clean_text(value)
    return ""


def _make_record(symbol: str, name: str, market: str) -> ListedCompanyRecord | None:
    code = normalize_stock_code(symbol)
    if not code or not name:
        return None

    return ListedCompanyRecord(
        symbol=krx_symbol_to_yfinance(code, market),
        name=name,
        market=market or None,
        initial_consonants=get_initial_consonants(name),
    )


def parse_krx_csv(csv_text: str) -> list[ListedCompanyRecord]:
    reader = csv.DictReader(io.StringIO(csv_text))
    records = []
    for row in reader:
        record = _make_record(
            _first_value(row, _SYMBOL_KEYS),
            _first_value(row, _NAME_KEYS),
            _first_value(row, _MARKET_KEYS),
        )
        if record is not None:
            records.append(record)
    return records


def parse_kind_html(html: str) -> list[ListedCompanyRecord]:
    records = []
    for row_html in _ROW_PATTERN.findall(html)[1:]:  # 첫 행은 헤더
        cells = [
            unescape(_TAG_PATTERN.sub("", cell)).strip() for cell in _CELL_PATTERN.findall(row_html)
        ]
        if len(cells) < 3:
            continue

        name, market, code = cells[0], cells[1], cells[2]
        record = _make_record(code, name, market)
        if record is not None:
            records.append(record)
    return records
