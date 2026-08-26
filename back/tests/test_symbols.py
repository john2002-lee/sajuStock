"""종목 코드 · 이름 정규화 (명세 6.2)."""

import pytest

from app.domain.symbols import (
    board_of,
    get_common_stock_name,
    get_korean_stock_name,
    is_usable_stock_name,
    krx_symbol_to_yfinance,
    normalize_stock_candidates,
    normalize_stock_code,
)
from app.integrations.yfinance.history import _candidates
from app.schemas.stock import KrxListing
from app.utils.text import escape_like, get_initial_consonants, normalize_search_text


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("삼성전자", ["005930.KS"]),
        ("삼성", ["005930.KS"]),
        ("NAVER", ["035420.KS"]),
        ("005930", ["005930.KS", "005930.KQ", "005930"]),
        ("aapl", ["AAPL"]),
    ],
)
def test_normalize_stock_candidates(value: str, expected: list[str]) -> None:
    assert normalize_stock_candidates(value) == expected


def test_normalize_stock_code_strips_suffix() -> None:
    assert normalize_stock_code("005930.KS") == "005930"
    assert normalize_stock_code("AAPL") == ""


@pytest.mark.parametrize(
    ("code", "market", "expected"),
    [
        ("005930", "KOSPI", "005930.KS"),
        ("035720", "KOSDAQ", "035720.KQ"),
        ("322310", "코스닥", "322310.KQ"),
        ("AAPL", None, "AAPL"),
    ],
)
def test_krx_symbol_to_yfinance(code: str, market: str | None, expected: str) -> None:
    assert krx_symbol_to_yfinance(code, market) == expected


def test_display_name_lookups() -> None:
    assert get_common_stock_name("네이버") == "NAVER"
    assert get_korean_stock_name("005930.KS") == "삼성전자"
    assert get_common_stock_name("없는종목") is None


@pytest.mark.parametrize(
    ("name", "symbol", "expected"),
    [
        # 야후에 없는 심볼을 물었을 때 shortName 에 섞여 나오는 검색 결과.
        # 이 값이 통과하면 상세 화면 제목이 그대로 이렇게 뜬다.
        ("247540.KS,0P0001GZPV,623889", "247540.KS", False),
        ("", "247540.KQ", False),
        (None, "247540.KQ", False),
        # 심볼·코드를 되돌려준 것은 이름이 아니다
        ("247540.KQ", "247540.KQ", False),
        ("247540", "247540.KQ", False),
        ("AAPL", "AAPL", False),
        # 정상 이름 — 쉼표가 있어도 공백이 섞이면 상호다
        ("에코프로비엠", "247540.KQ", True),
        ("ECOPROBM", "247540.KQ", True),
        ("Alphabet Inc., Class A", "GOOGL", True),
    ],
)
def test_is_usable_stock_name(name: str | None, symbol: str, expected: bool) -> None:
    assert is_usable_stock_name(name, symbol) is expected


def test_candidates_try_resolved_symbol_first() -> None:
    """확정 심볼이 있으면 맨 앞. 없으면 기존 추측 순서 그대로."""
    listing = KrxListing(symbol="247540.KQ", name="에코프로비엠")

    assert _candidates("247540", listing) == ["247540.KQ", "247540.KS", "247540"]
    # 확정 심볼이 실패했을 때 되돌아갈 자리는 남겨 둔다 (KRX 목록이 늦을 수 있다)
    assert _candidates("247540", None) == ["247540.KS", "247540.KQ", "247540"]


def test_initial_consonants() -> None:
    assert get_initial_consonants("삼성전자") == "ㅅㅅㅈㅈ"
    assert get_initial_consonants("LG에너지솔루션") == "lgㅇㄴㅈㅅㄹㅅ"


def test_initial_consonants_pass_through_like_metacharacters() -> None:
    """**이 함수는 `%`·`_` 를 막지 않는다** — 막는 자리는 질의를 만드는 쪽이다.

    이 성질을 테스트로 고정해 두는 이유: 여기서 문자를 더 버리도록 고치면 이미
    적재된 `initial_consonants` 값과 질의가 어긋나 배치가 한 바퀴 돌기 전까지
    조용히 못 찾는 상태가 된다. 와일드카드 차단은
    `find_candidates` 의 `autoescape=True` 가 담당한다.
    """
    assert get_initial_consonants("ㅅ%") == "ㅅ%"
    assert get_initial_consonants("A_C") == "a_c"


def test_escape_like_neutralizes_wildcards() -> None:
    """raw SQL 로 ILIKE 를 만드는 자리(`repositories/admin`)가 쓰는 이스케이프."""
    assert escape_like("a_c") == r"a\_c"
    assert escape_like("100%") == r"100\%"
    # 역슬래시를 먼저 치환해야 한다 — 나중에 하면 방금 넣은 이스케이프까지 다시 이스케이프된다.
    assert escape_like(r"a\_c") == r"a\\\_c"
    assert escape_like("평범한 이름") == "평범한 이름"


def test_normalize_search_text_drops_symbols() -> None:
    assert normalize_search_text("LG에너지솔루션 (주)") == "lg에너지솔루션주"


def test_board_of_uses_suffix_not_market_column() -> None:
    """랭킹의 시장 필터 근거. DB의 `market` 컬럼은 한글이라(유가·코스닥) 쓸 수 없다."""
    assert board_of("005930.KS") == "KOSPI"
    assert board_of("247540.KQ") == "KOSDAQ"


def test_board_of_returns_none_without_suffix() -> None:
    """접미사 없는 수집 파손 행은 시장을 단정할 수 없다 — 목록에서 빠진다."""
    assert board_of("02180") is None
    assert board_of("AAPL") is None


def test_konex_is_reported_as_kosdaq_on_purpose() -> None:
    """코넥스도 `krx_symbol_to_yfinance` 가 `.KQ` 로 매핑해 KOSDAQ 로 분류된다.

    의도된 동작이다 — 랭킹 모집단이 시가총액 상위라 코넥스가 올라올 일이 없다.
    누군가 '버그'로 보고 고치지 않도록 여기에 고정한다.
    """
    konex_symbol = krx_symbol_to_yfinance("123456", "코넥스")

    assert konex_symbol == "123456.KQ"
    assert board_of(konex_symbol) == "KOSDAQ"
