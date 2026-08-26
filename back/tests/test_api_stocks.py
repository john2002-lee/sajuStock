"""API 계층 테스트. 외부 호출(KRX·yfinance·LLM)은 모두 대체한다."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.listed_company import ListedCompanyRepository
from app.schemas.stock import ListedCompanyRecord
from app.services import fundamentals_service, listed_company_service, stock_service
from app.utils.text import get_initial_consonants

_SEED = [
    ("005930.KS", "삼성전자", "KOSPI"),
    ("009150.KS", "삼성전기", "KOSPI"),
    ("006400.KS", "삼성SDI", "KOSPI"),
    ("086520.KQ", "에코프로", "KOSDAQ"),
    ("000660.KS", "SK하이닉스", "KOSPI"),
]


async def _seed(repo: ListedCompanyRepository) -> None:
    await repo.upsert_many(
        [
            ListedCompanyRecord(
                symbol=symbol,
                name=name,
                market=market,
                initial_consonants=get_initial_consonants(name),
            )
            for symbol, name, market in _SEED
        ]
    )


@pytest.fixture(autouse=True)
def no_external_collection(monkeypatch: pytest.MonkeyPatch) -> None:
    """`ensure_seeded`가 네트워크를 타지 않게 막는다."""

    async def _empty() -> tuple[list[ListedCompanyRecord], str]:
        return [], "KRX"

    monkeypatch.setattr(listed_company_service, "collect_listed_companies", _empty)
    monkeypatch.setattr(listed_company_service.settings, "listed_company_min_count", 1)
    # 시총 배치는 pykrx 네트워크를 탄다 — 검색 테스트에서는 스케줄 자체를 막는다.
    monkeypatch.setattr(listed_company_service, "_schedule_market_cap_refresh", lambda: None)


async def test_health(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_suggestions_ranks_prefix_first(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _seed(ListedCompanyRepository(db_session))

    response = await client.get("/api/v1/stocks/suggestions", params={"query": "삼성", "limit": 5})

    assert response.status_code == 200
    names = [item["name"] for item in response.json()]
    # 시총이 없는 상태 → 폴백 정렬(보통주 → KOSPI → 이름 길이 → 가나다).
    # 넷 다 보통주·KOSPI이므로 이름 길이가 갈라놓는다: 4글자 둘이 먼저, 그다음 삼성SDI(5).
    assert names[:3] == ["삼성전기", "삼성전자", "삼성SDI"]


async def test_suggestions_by_initials(client: AsyncClient, db_session: AsyncSession) -> None:
    await _seed(ListedCompanyRepository(db_session))

    response = await client.get("/api/v1/stocks/suggestions", params={"query": "ㅅㅅㅈㅈ"})

    assert response.status_code == 200
    assert [item["symbol"] for item in response.json()] == ["005930.KS"]


async def test_suggestions_by_code(client: AsyncClient, db_session: AsyncSession) -> None:
    await _seed(ListedCompanyRepository(db_session))

    response = await client.get("/api/v1/stocks/suggestions", params={"query": "000660"})

    assert response.status_code == 200
    assert [item["name"] for item in response.json()] == ["SK하이닉스"]


async def test_suggestions_empty_when_no_match(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _seed(ListedCompanyRepository(db_session))

    response = await client.get("/api/v1/stocks/suggestions", params={"query": "zzzz"})

    assert response.status_code == 200
    assert response.json() == []


async def test_history_rejects_unknown_timeframe(client: AsyncClient) -> None:
    response = await client.get(
        "/api/v1/stocks/history", params={"symbol": "005930", "timeframe": "hour"}
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "unsupported_timeframe"


async def test_history_rejects_inverted_date_range(client: AsyncClient) -> None:
    response = await client.get(
        "/api/v1/stocks/history",
        params={"symbol": "005930", "start_date": "2026-02-01", "end_date": "2026-01-01"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_date_range"


async def test_history_rejects_unknown_period(client: AsyncClient) -> None:
    response = await client.get(
        "/api/v1/stocks/history", params={"symbol": "005930", "period": "7mo"}
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "unsupported_period"


async def test_history_maps_not_found_to_404(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.exceptions import StockNotFoundError

    def _raise(*_args, **_kwargs):
        raise StockNotFoundError

    monkeypatch.setattr(stock_service, "fetch_stock_history", _raise)

    response = await client.get("/api/v1/stocks/history", params={"symbol": "없는종목"})

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "stock_not_found"


async def test_history_can_skip_content_for_speed(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """차트만 먼저 그릴 때 뉴스·리포트를 건너뛸 수 있어야 한다 (소요 시간의 95%)."""
    seen: dict[str, object] = {}

    def _fake(*args, **kwargs):
        seen.update(kwargs)
        from app.schemas.stock import StockHistory

        return StockHistory(
            name="삼성전자",
            symbol="005930.KS",
            query="005930",
            timeframe="day",
            period="6mo",
            interval="1d",
        )

    monkeypatch.setattr(stock_service, "fetch_stock_history", _fake)

    response = await client.get(
        "/api/v1/stocks/history", params={"symbol": "005930", "include_content": "false"}
    )

    assert response.status_code == 200
    assert seen["include_content"] is False


async def test_history_resolves_krx_symbol_and_name(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """6자리 코드는 KRX 목록에서 확정해 공급자에 넘겨야 한다.

    확정하지 않으면 `.KS`를 먼저 시도하는데, 야후는 틀린 접미사에도 응답을 준다 —
    247540(에코프로비엠, 코스닥)을 `.KS`로 물으면 하루 늦은 시세와
    `"247540.KS,0P0001GZPV,623889"`라는 이름이 돌아와 그대로 화면 제목이 된다.
    """
    repo = ListedCompanyRepository(db_session)
    await repo.upsert_many(
        [
            ListedCompanyRecord(
                symbol="247540.KQ",
                name="에코프로비엠",
                market="코스닥",
                initial_consonants=get_initial_consonants("에코프로비엠"),
            )
        ]
    )

    seen: dict[str, object] = {}

    def _fake(*args, **kwargs):
        seen.update(kwargs)
        from app.schemas.stock import StockHistory

        return StockHistory(
            name="에코프로비엠",
            symbol="247540.KQ",
            query="247540",
            timeframe="day",
            period="2y",
            interval="1d",
        )

    monkeypatch.setattr(stock_service, "fetch_stock_history", _fake)

    response = await client.get("/api/v1/stocks/history", params={"symbol": "247540"})

    assert response.status_code == 200
    listing = seen["listing"]
    assert listing is not None
    assert listing.symbol == "247540.KQ"
    assert listing.name == "에코프로비엠"


async def test_history_listing_is_none_for_unknown_code(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """목록에 없으면 확정하지 않고 기존 추측 경로로 내려간다 (해외 티커·신규 상장)."""
    seen: dict[str, object] = {}

    def _fake(*args, **kwargs):
        seen.update(kwargs)
        from app.schemas.stock import StockHistory

        return StockHistory(
            name="Apple Inc.",
            symbol="AAPL",
            query="AAPL",
            timeframe="day",
            period="2y",
            interval="1d",
        )

    monkeypatch.setattr(stock_service, "fetch_stock_history", _fake)

    response = await client.get("/api/v1/stocks/history", params={"symbol": "AAPL"})

    assert response.status_code == 200
    assert seen["listing"] is None


async def test_content_endpoint_returns_news_and_reports(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.schemas.stock import AnalystReport, NewsItem, StockContent

    def _fake(symbol: str) -> StockContent:
        return StockContent(
            symbol=symbol,
            news=[NewsItem(title="뉴스 제목")],
            reports=[AnalystReport(title="리포트 제목")],
        )

    monkeypatch.setattr(stock_service, "fetch_stock_content", _fake)

    response = await client.get("/api/v1/stocks/content", params={"symbol": "005930.KS"})

    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "005930.KS"
    assert body["news"][0]["title"] == "뉴스 제목"
    assert body["reports"][0]["title"] == "리포트 제목"


async def test_fundamentals_endpoint_returns_valuation(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.schemas.stock import AnnualFinancial, StockFundamentals

    def _fake(symbol: str) -> StockFundamentals:
        return StockFundamentals(
            symbol=symbol,
            currency="KRW",
            per=21.06,
            pbr=3.64,
            roe_pct=30.79,
            dividend_yield_pct=0.57,
            ex_dividend_date="2026-06-29",
            next_earnings_date="2026-10-28",
            annual=[AnnualFinancial(fiscal_year=2025, revenue=333.6, operating_income=43.6)],
        )

    monkeypatch.setattr(fundamentals_service, "fetch_stock_fundamentals", _fake)

    response = await client.get("/api/v1/stocks/fundamentals", params={"symbol": "005930.KS"})

    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "005930.KS"
    assert body["per"] == 21.06
    assert body["roe_pct"] == 30.79
    # 배당수익률은 공급자가 이미 백분율로 주므로 그대로 나가야 한다 (57.0 이 아니다).
    assert body["dividend_yield_pct"] == 0.57
    assert body["next_earnings_date"] == "2026-10-28"
    assert body["annual"][0]["fiscal_year"] == 2025


async def test_fundamentals_endpoint_tolerates_all_null(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """전 필드가 비어도 200이다 — 재무 탭 하나가 상세 페이지를 죽이면 안 된다."""
    from app.schemas.stock import StockFundamentals

    monkeypatch.setattr(
        fundamentals_service,
        "fetch_stock_fundamentals",
        lambda symbol: StockFundamentals(symbol=symbol),
    )

    response = await client.get("/api/v1/stocks/fundamentals", params={"symbol": "999999.KQ"})

    assert response.status_code == 200
    body = response.json()
    assert body["per"] is None
    assert body["annual"] == []


async def test_validation_error_envelope(client: AsyncClient) -> None:
    response = await client.get("/api/v1/stocks/history")  # symbol 누락

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
