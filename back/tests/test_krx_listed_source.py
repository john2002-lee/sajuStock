"""상장사 목록 1차 소스 — 우선주가 들어오는가.

이 파일이 생긴 이유는 하나다. **삼성전자우(005935)가 검색되지 않았다.**

원인은 검색이 아니라 적재였다. KRX 정보데이터시스템이 로그인을 요구하도록 바뀐 뒤
`fetch_krx_listed_companies` 의 OTP 요청이 토큰 대신 문자열 `LOGOUT` 을 받고
CSV 다운로드가 403 이 된다. 그래서 1차 소스가 **한 번도 성공하지 못한 채** 2차
소스(KIND)로 폴백해 왔다.

KIND 는 `corpList.do` — **상장법인** 목록이다. 회사당 보통주 한 종목만 있고
우선주는 애초에 없다. 그래서 실측 DB 2,747행 중 우선주는 0건이었고
(유가 833 vs 실제 KOSPI 종목 943, 격차 110 ≈ 우선주 109),
`삼성전자우` 는 찾을 행 자체가 없었다.

같은 저장소의 `krx/market_cap.py` 는 이 문제를 이미 풀어 두었다 — pykrx 에
`KRX_ID`/`KRX_PW` 를 넘기면 로그인이 되고 우선주까지 나온다. 한쪽 모듈만 그 교훈을
배운 상태였다.

**그래서 이 테스트는 결과가 아니라 소스 선택을 확인한다.** "우선주가 몇 건이냐"는
그날의 상장 상태에 따라 바뀌지만, "1차 소스가 pykrx 이고 그 결과가 그대로
쓰이는가"는 언제나 같아야 한다.
"""

import pytest

from app.integrations.krx import client as krx_client
from app.schemas.stock import ListedCompanyRecord

# 삼성전자와 삼성전자우 — **둘을 함께 두는 것이 핵심이다.**
# 보통주만 있는 픽스처는 KIND 폴백으로도 통과해 버려서 이 버그를 재현하지 못한다.
_PYKRX_ROWS = [
    ("005930", "삼성전자", "KOSPI"),
    ("005935", "삼성전자우", "KOSPI"),
    ("035720", "카카오", "KOSPI"),
    ("247540", "에코프로비엠", "KOSDAQ"),
]


def _records() -> list[ListedCompanyRecord]:
    from app.integrations.krx.client import build_records_from_tickers

    return build_records_from_tickers(_PYKRX_ROWS)


async def test_pykrx_source_carries_preferred_stock() -> None:
    """1차 소스가 우선주를 종목으로 실어 온다.

    `005935` 는 `005930` 과 **다른 종목**이다. 회사 기준으로 접는 소스(KIND)를
    쓰면 이 행이 사라지고, 사라진 것은 검색 단계에서 복구할 방법이 없다.
    """
    records = _records()
    by_code = {r.symbol.split(".")[0]: r for r in records}

    assert "005935" in by_code, "우선주가 1차 소스에서 누락됐다"
    assert by_code["005935"].name == "삼성전자우"
    # 보통주가 사라지지 않았는지도 함께 본다 — 한쪽만 남는 회귀를 막는다.
    assert by_code["005930"].name == "삼성전자"


async def test_pykrx_source_maps_market_to_yfinance_suffix() -> None:
    """시장에 따라 `.KS`/`.KQ` 가 붙는다.

    접미사가 없으면 `top_by_market_cap` 의 `_BOARD_FILTER` 가 그 행을 버린다 —
    적재는 됐는데 랭킹 모집단에는 없는 상태가 된다.
    """
    by_code = {r.symbol.split(".")[0]: r for r in _records()}

    assert by_code["005935"].symbol == "005935.KS"
    assert by_code["247540"].symbol == "247540.KQ"


async def test_pykrx_source_fills_initial_consonants() -> None:
    """초성이 적재 시점에 채워진다.

    `find_candidates` 는 `initial_consonants` 컬럼을 조회하므로, 비어 있으면
    초성 검색이 조용히 0건이 된다.
    """
    by_code = {r.symbol.split(".")[0]: r for r in _records()}

    assert by_code["005935"].initial_consonants == "ㅅㅅㅈㅈㅇ"
    assert by_code["005930"].initial_consonants == "ㅅㅅㅈㅈ"


async def test_collect_prefers_pykrx_over_kind(monkeypatch: pytest.MonkeyPatch) -> None:
    """pykrx 가 응답하면 KIND·내부 기본값은 부르지 않는다.

    순서가 이 버그의 전부였다. 1차가 조용히 실패하고 2차가 성공하면 아무 에러도
    없이 **덜 완전한 데이터**로 서비스가 돌아간다.
    """
    called: list[str] = []

    async def _pykrx() -> list[ListedCompanyRecord]:
        called.append("pykrx")
        return _records()

    async def _kind(_client: object) -> list[ListedCompanyRecord]:
        called.append("kind")
        return []

    monkeypatch.setattr(krx_client, "fetch_listed_companies_via_pykrx", _pykrx)
    monkeypatch.setattr(krx_client, "fetch_kind_listed_companies", _kind)

    records, source = await krx_client.collect_listed_companies()

    assert source == "KRX"
    assert called == ["pykrx"], f"1차 소스만 불려야 한다 (실제: {called})"
    assert any(r.symbol.startswith("005935") for r in records)


async def test_collect_falls_back_to_kind_when_pykrx_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """pykrx 가 실패하면 KIND 로 내려간다 — 자격증명 없는 환경을 버린 것이 아니다.

    `KRX_ID`/`KRX_PW` 가 없는 개발 환경에서도 자동완성이 최소한 동작해야 한다.
    폴백을 없애는 것이 이 수정의 목적이 아니다.
    """
    called: list[str] = []

    async def _pykrx() -> list[ListedCompanyRecord]:
        called.append("pykrx")
        raise RuntimeError("KRX_ID 없음")

    async def _kind(_client: object) -> list[ListedCompanyRecord]:
        called.append("kind")
        return [
            ListedCompanyRecord(symbol="005930.KS", name="삼성전자", market="유가")
        ]

    monkeypatch.setattr(krx_client, "fetch_listed_companies_via_pykrx", _pykrx)
    monkeypatch.setattr(krx_client, "fetch_kind_listed_companies", _kind)

    records, source = await krx_client.collect_listed_companies()

    assert source == "KIND"
    assert called == ["pykrx", "kind"]
    assert len(records) == 1


async def test_letter_bearing_codes_are_dropped_not_mangled() -> None:
    r"""영문이 섞인 KRX 코드(`37550K` 등)는 **버린다.** 뭉개서 넣지 않는다.

    전환·신형 우선주와 일부 신규 상장 종목은 코드 끝에 영문이 붙는다
    (`37550K` DL이앤씨우 · `03481K` 해성산업1우 · `0013V0` 삼진식품). 실측 2,872건 중
    82건이 그렇다.

    `normalize_stock_code` 는 숫자가 아닌 문자를 버리므로 `37550K` 가 `37550` 이 된다.
    다섯 자리는 `krx_symbol_to_yfinance` 가 접미사를 붙이지 못해 `_BOARD_FILTER` 가
    어차피 걸러내고, 더 나쁜 것은 **서로 다른 종목이 같은 코드로 충돌**한다는 점이다
    (실측: 14개 그룹, `00410` 에는 3종목). `upsert_many` 는 첫 건만 남기므로 나머지는
    조용히 사라진다 — 없는 것보다 나쁘다.

    그래서 이 함수가 입구에서 버린다. 되살리려면 `normalize_stock_code` 와
    관심종목 라우터의 `^\d{6}$` 검증, yfinance 심볼 해석을 함께 손봐야 한다.
    """
    from app.integrations.krx.client import build_records_from_tickers

    records = build_records_from_tickers(
        [
            ("005935", "삼성전자우", "KOSPI"),   # 순수 6자리 — 통과
            ("37550K", "DL이앤씨우", "KOSPI"),   # 영문 포함 — 제외
            ("0013V0", "삼진식품", "KOSDAQ"),    # 영문 포함 — 제외
        ]
    )

    codes = [r.symbol.split(".")[0] for r in records]
    assert codes == ["005935"], f"영문 코드가 새어 들어왔다: {codes}"
    # 다섯 자리 쓰레기 심볼이 만들어지지 않았는지도 본다.
    assert all("." in r.symbol for r in records)


async def test_no_two_records_share_a_symbol() -> None:
    """같은 심볼이 두 번 나오지 않는다.

    `upsert_many` 가 중복 심볼의 첫 건만 반영하므로, 여기서 새면 어느 종목이
    남는지가 소스 순서에 달린다 — 재현되지 않는 누락이 된다.
    """
    from app.integrations.krx.client import build_records_from_tickers

    records = build_records_from_tickers(
        [
            ("37550K", "DL이앤씨우", "KOSPI"),
            ("37550L", "DL이앤씨2우(전환)", "KOSPI"),
            ("005930", "삼성전자", "KOSPI"),
        ]
    )

    symbols = [r.symbol for r in records]
    assert len(symbols) == len(set(symbols))
    assert symbols == ["005930.KS"]
