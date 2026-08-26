"""자동완성 랭킹 (명세 6.2).

원본 스코어링은 등급 안에서 가나다순으로 끊겨 "삼성"을 치면 삼성E&A·삼성FN리츠…가
먼저 나오고 삼성전자가 화면에서 사라졌다. 그 회귀를 막는 테스트다.
"""

from app.domain.ranking import is_common_stock, rank_companies
from app.models.listed_company import ListedCompany
from app.utils.text import get_initial_consonants, normalize_search_text

# (심볼, 이름, 시장, 시가총액) — 시총은 실제 규모의 상대 비율만 맞춘 값이다.
_UNIVERSE = [
    ("005930.KS", "삼성전자", "KOSPI", 450_000_000_000_000),
    ("005935.KS", "삼성전자우", "KOSPI", 55_000_000_000_000),
    ("006400.KS", "삼성SDI", "KOSPI", 25_000_000_000_000),
    ("009150.KS", "삼성전기", "KOSPI", 12_000_000_000_000),
    ("028260.KS", "삼성물산", "KOSPI", 22_000_000_000_000),
    ("207940.KS", "삼성바이오로직스", "KOSPI", 70_000_000_000_000),
    ("088980.KS", "맥쿼리인프라", "KOSPI", 4_000_000_000_000),
    ("448730.KS", "삼성FN리츠", "KOSPI", 300_000_000_000),
    ("310210.KQ", "삼성스팩4호", "KOSDAQ", 20_000_000_000),
]


def _company(
    symbol: str, name: str, market: str, market_cap: int | None
) -> ListedCompany:
    return ListedCompany(
        symbol=symbol,
        name=name,
        market=market,
        search_symbol=normalize_search_text(symbol),
        search_name=normalize_search_text(name),
        initial_consonants=get_initial_consonants(name),
        market_cap=market_cap,
    )


def _universe(*, with_caps: bool) -> list[ListedCompany]:
    return [
        _company(symbol, name, market, cap if with_caps else None)
        for symbol, name, market, cap in _UNIVERSE
    ]


def _rank(query: str, *, with_caps: bool) -> list[str]:
    keyword = normalize_search_text(query)
    initials = get_initial_consonants(query)
    ranked = rank_companies(_universe(with_caps=with_caps), keyword, initials)
    return [company.name for company in ranked]


def test_partial_query_puts_largest_cap_first() -> None:
    """'삼성' → 삼성전자가 1위. 이것이 이번 변경의 목적이다."""
    names = _rank("삼성", with_caps=True)

    assert names[0] == "삼성전자"
    # 시총 내림차순이 그대로 이어진다.
    assert names[:3] == ["삼성전자", "삼성바이오로직스", "삼성전자우"]
    # 가나다순으로 앞서던 종목들이 더 이상 위를 차지하지 않는다.
    assert names.index("삼성FN리츠") > names.index("삼성전자")


def test_exact_name_match_is_first() -> None:
    """'삼성전자' 완전 일치가 최상단. 접두사로 걸리는 삼성전자우보다 위다."""
    names = _rank("삼성전자", with_caps=True)

    assert names[0] == "삼성전자"
    assert names[1] == "삼성전자우"


def test_exact_match_beats_bigger_cap() -> None:
    """완전 일치는 등급이 한 단계 위라 시총이 더 큰 접두사 일치도 이긴다."""
    companies = [
        # 일부러 우선주 시총을 본주보다 크게 둔다 — 등급이 시총보다 우선함을 증명.
        _company("005935.KS", "삼성전자우", "KOSPI", 900_000_000_000_000),
        _company("005930.KS", "삼성전자", "KOSPI", 450_000_000_000_000),
    ]
    names = [c.name for c in rank_companies(companies, "삼성전자", "")]

    assert names == ["삼성전자", "삼성전자우"]


def test_exact_symbol_match_is_first() -> None:
    """티커 완전 일치도 같은 최상위 등급이다."""
    names = _rank("005930.KS", with_caps=True)

    assert names[0] == "삼성전자"


def test_fallback_order_when_all_caps_null() -> None:
    """시총이 전부 비어도 삼성전자가 상위에 남는다.

    폴백 규칙: 보통주 → KOSPI → 이름 길이 → 가나다.
    우선주·리츠·스팩은 보통주 뒤로 밀린다.
    """
    names = _rank("삼성", with_caps=False)

    # 보통주가 아닌 것들은 반드시 뒤에 있다.
    for non_common in ("삼성전자우", "삼성FN리츠", "삼성스팩4호"):
        assert names.index("삼성전자") < names.index(non_common)

    # 이름이 짧은 보통주가 앞에 오므로 삼성전자는 상위권(4글자 그룹)에 든다.
    assert "삼성전자" in names[:3]


def test_null_cap_always_sorts_after_valued_cap_in_same_tier() -> None:
    """같은 등급 안에서 시총 NULL 은 항상 뒤."""
    companies = [
        _company("448730.KS", "삼성FN리츠", "KOSPI", 300_000_000_000),
        _company("005930.KS", "삼성전자", "KOSPI", None),
    ]
    names = [c.name for c in rank_companies(companies, "삼성", "")]

    # 값이 있는 쪽이 먼저 — 삼성전자가 실제로는 크지만 값이 없으면 뒤로 간다.
    assert names == ["삼성FN리츠", "삼성전자"]


def test_kosdaq_after_kospi_in_fallback() -> None:
    companies = [
        _company("310210.KQ", "대신종목", "KOSDAQ", None),
        _company("000000.KS", "대신종목", "KOSPI", None),
    ]
    ranked = rank_companies(companies, "대신", "")

    assert [c.market for c in ranked] == ["KOSPI", "KOSDAQ"]


def test_korean_market_labels_are_recognised() -> None:
    """실제 DB 는 시장을 한글로 저장한다 (KRX CSV 가 '코스피'로 준다).

    영문 키만 넣어두면 이 우선순위가 통째로 무시되므로 두 표기 모두 인식해야 한다.
    """
    companies = [
        _company("310210.KQ", "대신종목", "코스닥", None),
        _company("000000.KS", "대신종목", "코스피", None),
    ]
    ranked = rank_companies(companies, "대신", "")

    assert [c.market for c in ranked] == ["코스피", "코스닥"]


def test_real_db_label_yuga_is_treated_as_kospi() -> None:
    """**실측 DB 는 '코스피'가 아니라 '유가'로 저장한다.**

    2,748행 실측: `코스닥 1806 · 유가 833 · 코넥스 109`. `코스피`·`KOSPI` 는 0건이다.
    위 `test_korean_market_labels_are_recognised` 가 초록이면서도 운영 데이터에서는
    유가증권 833종목이 전부 기본값(3)으로 떨어져 **코스닥(1)보다 뒤로 밀렸다** —
    테스트가 실제 값이 아닌 표기를 쓰면 이렇게 거짓 안심을 준다.

    심볼에 접미사를 **일부러 빼서** 라벨 경로만 남긴다. `.KS`/`.KQ` 를 붙이면
    라벨 표를 통째로 지워도 `board_of` 폴백이 받아내 이 테스트가 초록으로 남는다 —
    두 겹으로 막아 둔 것은 좋지만, 그러면 어느 겹이 살아 있는지 확인할 수 없다.
    """
    companies = [
        _company("310210", "대신종목", "코스닥", None),
        _company("000000", "대신종목", "유가", None),
    ]
    ranked = rank_companies(companies, "대신", "")

    assert [c.market for c in ranked] == ["유가", "코스닥"]


def test_konex_sorts_after_kosdaq() -> None:
    """코넥스는 접미사가 `.KQ` 라 board_of 로는 코스닥과 구분되지 않는다.

    셋을 가르는 정보는 라벨에만 있으므로, 라벨을 먼저 보는 순서가 지켜져야 한다.
    """
    companies = [
        _company("111111.KQ", "대신종목", "코넥스", None),
        _company("310210.KQ", "대신종목", "코스닥", None),
        _company("000000.KS", "대신종목", "유가", None),
    ]
    ranked = rank_companies(companies, "대신", "")

    assert [c.market for c in ranked] == ["유가", "코스닥", "코넥스"]


def test_unknown_label_falls_back_to_symbol_suffix() -> None:
    """처음 보는 표기가 와도 접미사가 답을 준다.

    접미사는 `krx_symbol_to_yfinance` 가 시장 구분을 보고 붙인 값이라 그 행의
    시세와 어긋날 수 없다. 수집 소스가 하나 더 늘어 라벨이 또 바뀌어도
    (이 버그가 바로 그 사례다) 순서가 통째로 죽지는 않는다.
    """
    companies = [
        _company("310210.KQ", "대신종목", "처음보는표기", None),
        _company("000000.KS", "대신종목", "처음보는표기", None),
    ]
    ranked = rank_companies(companies, "대신", "")

    assert [c.symbol for c in ranked] == ["000000.KS", "310210.KQ"]


def test_missing_label_falls_back_to_symbol_suffix() -> None:
    """`market` 이 비어 있어도(실측 44행) 접미사로 갈린다."""
    companies = [
        _company("310210.KQ", "대신종목", "", None),
        _company("000000.KS", "대신종목", "", None),
    ]
    ranked = rank_companies(companies, "대신", "")

    assert [c.symbol for c in ranked] == ["000000.KS", "310210.KQ"]


def test_initials_query_ranks_by_cap() -> None:
    """초성 검색도 같은 규칙을 탄다."""
    names = _rank("ㅅㅅㅈㅈ", with_caps=True)

    assert names[0] == "삼성전자"


def test_non_matching_company_is_dropped() -> None:
    names = _rank("에코", with_caps=True)

    assert names == []


def test_is_common_stock() -> None:
    assert is_common_stock("삼성전자")
    assert not is_common_stock("삼성전자우")
    assert not is_common_stock("현대차2우B")
    assert not is_common_stock("삼성FN리츠")
    assert not is_common_stock("교보14호스팩")
