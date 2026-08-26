"""등락률 랭킹. 외부 호출(yfinance)은 하지 않는다."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.listed_company import ListedCompanyRepository
from app.schemas.market import MoverRow, MoversScan
from app.schemas.stock import ListedCompanyRecord
from app.services import market_service


@pytest.fixture(autouse=True)
def no_background_scan(monkeypatch: pytest.MonkeyPatch) -> None:
    """스냅샷이 없으면 서비스가 배경 스캔을 예약한다 — 테스트에서는 막는다.

    막지 않으면 등락률 조회 한 번이 실제 yfinance 벌크 다운로드(수 초)를 띄운다.
    """
    monkeypatch.setattr(market_service, "_schedule_movers_refresh", lambda: None)
    # 모듈 전역 스냅샷은 테스트 사이에 남는다 — 매번 빈 상태에서 시작한다.
    monkeypatch.setattr(market_service, "_scan", None)
    monkeypatch.setattr(market_service, "_scanned_at", None)


def _row(code: str, change_percent: float) -> MoverRow:
    return MoverRow(
        name=f"종목{code}",
        symbol=f"{code}.KS",
        code=code,
        market="유가",
        price=1000.0,
        change=change_percent * 10,
        change_percent=change_percent,
    )


def test_response_splits_by_sign() -> None:
    """상승 목록에 마이너스 종목이 올라오면 랭킹이 아니라 거짓말이다."""
    scan = MoversScan(
        as_of="2026-07-31",
        universe_label="시가총액 상위 5종목",
        universe_size=5,
        rows=[_row("000001", 3.0), _row("000002", 1.0), _row("000003", -2.0)],
    )

    result = market_service._to_response(scan, limit=5)

    assert [row.code for row in result.gainers] == ["000001", "000002"]
    assert [row.code for row in result.losers] == ["000003"]
    assert result.scanned == 3
    assert result.universe_label == "시가총액 상위 5종목"


def test_response_respects_limit_and_orders_losers_worst_first() -> None:
    scan = MoversScan(
        rows=[_row("000001", 5.0), _row("000002", 2.0), _row("000003", -1.0), _row("000004", -4.0)]
    )

    result = market_service._to_response(scan, limit=1)

    assert [row.code for row in result.gainers] == ["000001"]
    # 하락률 '상위'는 가장 많이 빠진 종목이 먼저다
    assert [row.code for row in result.losers] == ["000004"]


def test_response_without_snapshot_is_empty() -> None:
    """워밍업 전에는 빈 목록. 프런트는 이걸 보고 예시 데이터로 내려간다."""
    result = market_service._to_response(None, limit=5)

    assert result.gainers == []
    assert result.losers == []
    assert result.scanned == 0


async def test_universe_skips_symbols_without_suffix(db_session: AsyncSession) -> None:
    """접미사 없는 수집 원본 파손 행은 yfinance 심볼로 쓸 수 없어 제외한다."""
    repo = ListedCompanyRepository(db_session)
    await repo.upsert_many(
        [
            ListedCompanyRecord(symbol="005930.KS", name="삼성전자", market="유가"),
            ListedCompanyRecord(symbol="247540.KQ", name="에코프로비엠", market="코스닥"),
            ListedCompanyRecord(symbol="02180", name="네오뷰", market="코스닥"),
        ]
    )

    companies = await repo.top_by_market_cap(10)

    assert {company.symbol for company in companies} == {"005930.KS", "247540.KQ"}


async def test_universe_orders_by_market_cap_desc(db_session: AsyncSession) -> None:
    """시총 미수집(NULL)은 뒤로 — 배치가 아직 안 돈 환경에서도 순서가 선다."""
    repo = ListedCompanyRepository(db_session)
    await repo.upsert_many(
        [
            ListedCompanyRecord(symbol="000001.KS", name="작은회사", market="유가"),
            ListedCompanyRecord(symbol="000002.KS", name="큰회사", market="유가"),
            ListedCompanyRecord(symbol="000003.KS", name="미수집", market="유가"),
        ]
    )
    await repo.update_market_caps({"000001": 100, "000002": 900})

    companies = await repo.top_by_market_cap(10)

    assert [company.symbol for company in companies] == [
        "000002.KS",
        "000001.KS",
        "000003.KS",
    ]


async def test_movers_endpoint_returns_empty_before_warm_up(client: AsyncClient) -> None:
    response = await client.get("/api/v1/markets/movers", params={"limit": 5})

    assert response.status_code == 200
    body = response.json()
    assert body["gainers"] == []
    assert body["losers"] == []


async def test_movers_endpoint_serves_snapshot(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        market_service,
        "_scan",
        MoversScan(
            as_of="2026-07-31",
            universe_label="시가총액 상위 200종목",
            universe_size=200,
            rows=[_row("000001", 4.0), _row("000002", -3.0)],
        ),
    )

    response = await client.get("/api/v1/markets/movers", params={"limit": 5})

    assert response.status_code == 200
    body = response.json()
    assert body["universe_label"] == "시가총액 상위 200종목"
    assert body["as_of"] == "2026-07-31"
    assert [row["code"] for row in body["gainers"]] == ["000001"]
    assert [row["code"] for row in body["losers"]] == ["000002"]
