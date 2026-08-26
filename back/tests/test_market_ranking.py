"""종목 탐색 랭킹 (`GET /markets/ranking`). 외부 호출(yfinance)은 하지 않는다.

자동완성 랭킹(`test_ranking.py`)과 다른 기능이다. 이쪽은 등락률 스냅샷을 **다시 자르는**
화면용 목록이라 스캔을 새로 돌지 않는다 — 이 파일이 지키는 것도 그 계약이다.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.listed_company import ListedCompanyRepository
from app.schemas.market import MoverRow, MoversScan
from app.schemas.stock import ListedCompanyRecord
from app.services import market_service


@pytest.fixture(autouse=True)
def no_background_scan(monkeypatch: pytest.MonkeyPatch) -> None:
    """`test_market.py` 와 같은 가드. 막지 않으면 랭킹 조회가 실제 벌크 다운로드를 띄운다."""
    monkeypatch.setattr(market_service, "_schedule_movers_refresh", lambda: None)
    monkeypatch.setattr(market_service, "_scan", None)
    monkeypatch.setattr(market_service, "_scanned_at", None)


def _row(code: str, change_percent: float, suffix: str = ".KS") -> MoverRow:
    return MoverRow(
        name=f"종목{code}",
        symbol=f"{code}{suffix}",
        code=code,
        market="유가" if suffix == ".KS" else "코스닥",
        price=1000.0,
        change=change_percent * 10,
        change_percent=change_percent,
    )


# 등락률 내림차순 — 스캐너가 내보내는 순서 그대로다.
_SCAN = MoversScan(
    as_of="2026-08-04",
    universe_label="시가총액 상위 4종목",
    universe_size=4,
    rows=[
        _row("000001", 5.0),  # KOSPI · 시총 없음
        _row("000002", 2.0, ".KQ"),  # KOSDAQ · 시총 900
        _row("000003", -1.0),  # KOSPI · 시총 100
        _row("000004", -4.0, ".KQ"),  # KOSDAQ · 시총 500
    ],
)


async def _seed(session: AsyncSession) -> ListedCompanyRepository:
    repo = ListedCompanyRepository(session)
    await repo.upsert_many(
        [
            ListedCompanyRecord(symbol="000001.KS", name="종목000001", market="유가"),
            ListedCompanyRecord(symbol="000002.KQ", name="종목000002", market="코스닥"),
            ListedCompanyRecord(symbol="000003.KS", name="종목000003", market="유가"),
            ListedCompanyRecord(symbol="000004.KQ", name="종목000004", market="코스닥"),
        ]
    )
    await repo.update_market_caps({"000002": 900, "000004": 500, "000003": 100})
    return repo


# --- 정렬 -------------------------------------------------------------------


async def test_change_sort_preserves_scan_order_exactly(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`sort="change"` 는 재정렬하지 않는다.

    스냅샷이 이미 등락률 내림차순이라 다시 정렬하면 같은 답을 얻으려고 비용만 쓴다.
    누군가 `sorted(...)` 를 넣으면 이 단언이 깨진다.
    """
    repo = await _seed(db_session)
    monkeypatch.setattr(market_service, "_scan", _SCAN)

    result = await market_service.get_ranking(repo, sort="change", limit=10)

    assert [row.code for row in result.rows] == ["000001", "000002", "000003", "000004"]


async def test_market_cap_sort_puts_missing_caps_last(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """시총 미수집은 뒤로. 실제 DB도 2,748종목 중 829건만 채워져 있어 흔한 경우다."""
    repo = await _seed(db_session)
    monkeypatch.setattr(market_service, "_scan", _SCAN)

    result = await market_service.get_ranking(repo, sort="market_cap", limit=10)

    assert [row.code for row in result.rows] == ["000002", "000004", "000003", "000001"]
    assert result.rows[0].market_cap == 900
    assert result.rows[-1].market_cap is None


async def test_market_cap_sort_is_stable_on_ties(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """시총이 같으면 등락률 순서가 남는다 (파이썬 정렬이 안정적이라 공짜로 얻는다)."""
    repo = ListedCompanyRepository(db_session)
    await repo.upsert_many(
        [
            ListedCompanyRecord(symbol="000001.KS", name="A", market="유가"),
            ListedCompanyRecord(symbol="000003.KS", name="B", market="유가"),
        ]
    )
    await repo.update_market_caps({"000001": 500, "000003": 500})
    monkeypatch.setattr(
        market_service,
        "_scan",
        MoversScan(rows=[_row("000001", 5.0), _row("000003", -1.0)]),
    )

    result = await market_service.get_ranking(repo, sort="market_cap", limit=10)

    assert [row.code for row in result.rows] == ["000001", "000003"]


# --- 시장 필터 --------------------------------------------------------------


async def test_board_filter_uses_symbol_suffix(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`.KS`→KOSPI / `.KQ`→KOSDAQ.

    DB의 `market` 컬럼으로 거르지 않는다 — 실제 값이 `유가`·`코스닥`이라
    `market == "KOSPI"` 비교는 한 건도 맞지 않는다.
    """
    repo = await _seed(db_session)
    monkeypatch.setattr(market_service, "_scan", _SCAN)

    # 정렬을 명시한다 — 이 테스트가 확인하는 것은 필터지 순서가 아니다.
    kospi = await market_service.get_ranking(repo, sort="change", board="KOSPI", limit=10)
    kosdaq = await market_service.get_ranking(repo, sort="change", board="KOSDAQ", limit=10)

    assert [row.code for row in kospi.rows] == ["000001", "000003"]
    assert all(row.board == "KOSPI" for row in kospi.rows)
    assert [row.code for row in kosdaq.rows] == ["000002", "000004"]
    assert all(row.board == "KOSDAQ" for row in kosdaq.rows)


async def test_rows_without_suffix_are_excluded(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """접미사가 없으면 시장을 단정할 수 없어 목록에서 뺀다."""
    repo = await _seed(db_session)
    monkeypatch.setattr(
        market_service,
        "_scan",
        MoversScan(rows=[_row("000001", 5.0), _row("02180", 1.0, suffix="")]),
    )

    result = await market_service.get_ranking(repo, sort="change", limit=10)

    assert [row.code for row in result.rows] == ["000001"]
    assert result.total == 1


# --- 페이지네이션 -----------------------------------------------------------


async def test_total_reflects_filtered_count_not_raw(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`total` 이 필터 전 건수면 페이지 수 계산이 틀어진다."""
    repo = await _seed(db_session)
    monkeypatch.setattr(market_service, "_scan", _SCAN)

    result = await market_service.get_ranking(repo, board="KOSPI", limit=1)

    assert result.total == 2  # 전체 4건이 아니다
    assert len(result.rows) == 1


async def test_rank_is_renumbered_after_filtering(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """코스닥만 본 사용자에게 '2위 다음 4위'는 뜻이 없다 — 필터 후 다시 매긴다."""
    repo = await _seed(db_session)
    monkeypatch.setattr(market_service, "_scan", _SCAN)

    result = await market_service.get_ranking(repo, sort="change", board="KOSDAQ", limit=10)

    assert [row.rank for row in result.rows] == [1, 2]


async def test_offset_slices_without_changing_total(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = await _seed(db_session)
    monkeypatch.setattr(market_service, "_scan", _SCAN)

    result = await market_service.get_ranking(repo, sort="change", limit=2, offset=2)

    assert [row.code for row in result.rows] == ["000003", "000004"]
    assert result.total == 4


# --- 엔드포인트 -------------------------------------------------------------


async def test_ranking_endpoint_returns_empty_before_warm_up(client: AsyncClient) -> None:
    """스냅샷이 없어도 500이 아니라 빈 목록이다 — 프런트가 빈 상태를 그린다."""
    response = await client.get("/api/v1/markets/ranking")

    assert response.status_code == 200
    body = response.json()
    assert body["rows"] == []
    assert body["total"] == 0


async def test_ranking_endpoint_serves_snapshot(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _seed(db_session)
    monkeypatch.setattr(market_service, "_scan", _SCAN)

    response = await client.get(
        "/api/v1/markets/ranking", params={"sort": "market_cap", "limit": 2}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["universe_label"] == "시가총액 상위 4종목"
    assert body["sort"] == "market_cap"
    assert [row["code"] for row in body["rows"]] == ["000002", "000004"]
    assert body["rows"][0]["board"] == "KOSDAQ"
    assert body["total"] == 4


async def test_ranking_endpoint_rejects_unknown_sort(client: AsyncClient) -> None:
    response = await client.get("/api/v1/markets/ranking", params={"sort": "volume"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
