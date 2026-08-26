"""스크리너 — 조건 검색 (P2).

이 화면은 **오류 없이 틀리기 쉬운 종류**다. 조건이 하나 안 먹어도 목록은 그럴듯하게
나오고, 정렬이 뒤집혀도 사람이 눈으로 알아채지 못한다. 그래서 지키는 것 다섯이다.

1. **조건이 실제로 좁히는가** — 안 먹는 조건은 아무 신호도 내지 않는다.
2. **값이 없는 종목이 조건에 걸리지 않는가** — "PER 15 이하" 에 PER 을 모르는 종목이
   섞이면 그 목록은 조건을 만족하지 않는다. SQL 이 그렇게 동작하는 것에 기대되,
   기대고 있다는 사실 자체를 고정한다.
3. **NULL 이 정렬 앞을 채우지 않는가** — 13회차에 `top_by_market_cap` 이 정확히 이
   방식으로 무너졌다. Postgres 의 `DESC` 기본값은 NULLS FIRST 다.
4. **`total` 과 행 수가 같은 조건에서 나오는가** — 갈라지면 "23건" 이라 쓰고 5줄만
   보여주는 화면이 된다.
5. **적자 기업이 '가장 싼 종목'으로 올라오지 않는가** — PER 은 음수가 될 수 있다.
"""

import pytest

from app.repositories.listed_company import ListedCompanyRepository
from app.schemas.market import ScreenerQuery
from app.schemas.stock import CompanyMetrics, ListedCompanyRecord
from app.services import screener_service, snapshot_service

# (심볼, 이름, 시장, 시총, PER, PBR, ROE%, 배당수익률%)
_UNIVERSE = [
    ("005930.KS", "삼성전자", "유가", 400_000_000, 18.5, 3.2, 30.8, 0.57),
    ("000660.KS", "SK하이닉스", "유가", 300_000_000, 13.5, 6.1, 92.7, 0.11),
    ("003490.KS", "대한항공", "유가", 100_000_000, 16.1, 0.92, 3.0, 2.76),
    ("247540.KQ", "에코프로비엠", "코스닥", 50_000_000, 182.6, 5.9, 5.6, 0.09),
    # 적자 기업 — PER 이 음수다. 상한만 건 조건에서 맨 앞에 오면 안 된다.
    ("900100.KQ", "적자테크", "코스닥", 10_000_000, -3.2, 0.8, -12.0, None),
    # 지표를 아직 못 받은 종목. 어떤 조건에도 걸리지 않아야 한다.
    ("900200.KQ", "미수집", "코스닥", None, None, None, None, None),
]


@pytest.fixture
async def universe(db_session) -> ListedCompanyRepository:
    repo = ListedCompanyRepository(db_session)
    await repo.upsert_many(
        [
            ListedCompanyRecord(symbol=symbol, name=name, market=market)
            for symbol, name, market, *_ in _UNIVERSE
        ]
    )

    answered = [symbol for symbol, *_ in _UNIVERSE if symbol != "900200.KQ"]
    metrics = {
        symbol: CompanyMetrics(
            market_cap=cap,
            per=per,
            pbr=pbr,
            roe_pct=roe,
            dividend_yield_pct=dividend,
            valuation_ok=True,
        )
        for symbol, _name, _market, cap, per, pbr, roe, dividend in _UNIVERSE
        if symbol != "900200.KQ"
    }
    await repo.update_snapshots({}, metrics, answered)
    return repo


async def _codes(repo: ListedCompanyRepository, **kwargs) -> list[str]:
    result = await screener_service.get_screener(
        repo, ScreenerQuery(**kwargs), limit=50, offset=0
    )
    return [row.code for row in result.rows]


# ── 조건 ─────────────────────────────────────────────────────────────────


async def test_per_range_narrows_the_list(universe) -> None:
    codes = await _codes(universe, per_min=0, per_max=17)

    assert set(codes) == {"003490", "000660"}


async def test_stocks_without_the_metric_never_match(universe) -> None:
    """**값을 모르는 종목은 조건에 걸리지 않는다.**

    SQL 이 `NULL <= 15` 를 참으로 보지 않기 때문인데, 그 성질에 기대고 있다는 사실을
    고정해 둔다. 조건을 파이썬으로 옮기는 순간(`or 0` 같은 기본값 하나면 충분하다)
    미수집 종목이 'PER 0' 으로 목록 맨 앞에 온다.
    """
    codes = await _codes(universe, per_max=1000)

    assert "900200" not in codes


async def test_negative_per_is_not_the_cheapest_stock(universe) -> None:
    """**적자 기업이 '저PER 상위'를 차지하지 않는가.**

    상한만 걸면 PER −3.2 인 회사가 가장 싼 종목으로 맨 앞에 온다. 숫자상으로는 맞고
    투자 판단으로는 완전히 틀린, 스크리너의 고전적인 함정이다. 화면의 프리셋이 하한을
    항상 함께 거는 근거가 이것이다.
    """
    without_floor = await _codes(universe, per_max=20, sort="per")
    assert without_floor[0] == "900100", "전제가 바뀌었다 — 하한이 없으면 적자가 앞에 온다"

    with_floor = await _codes(universe, per_min=0, per_max=20, sort="per")
    assert "900100" not in with_floor
    assert with_floor[0] == "000660"  # PER 13.5 가 가장 낮다


async def test_board_filter_uses_the_symbol_suffix(universe) -> None:
    """시장 구분은 심볼 접미사로 판정한다 — 지표와 무관하다.

    지표를 못 받은 종목(900200)도 여기서는 빠지지 않는다. 시장을 아는 것과 지표를
    아는 것은 다른 문제이고, 시장만 고른 사용자에게 "아직 안 채웠다" 를 이유로
    종목을 감추면 목록이 조용히 좁아진다.
    """
    codes = await _codes(universe, board="KOSDAQ")

    assert set(codes) == {"247540", "900100", "900200"}
    assert "005930" not in codes


async def test_conditions_stack(universe) -> None:
    """조건 둘 이상은 AND 다 — 하나만 먹으면 목록이 조용히 넓어진다.

    셋 중 어느 하나를 빼도 다른 종목이 딸려 오도록 값을 골랐다. `pbr_min` 을 빼면
    대한항공(PBR 0.92)이, `dividend_min` 을 빼면 SK하이닉스(배당 0.11%)가 들어온다.
    """
    codes = await _codes(universe, board="KOSPI", pbr_min=2.0, dividend_min=0.5)

    assert codes == ["005930"]


async def test_dividend_and_roe_are_lower_bounds(universe) -> None:
    assert set(await _codes(universe, dividend_min=2.0)) == {"003490"}
    assert set(await _codes(universe, roe_min=30.0)) == {"005930", "000660"}


# ── 정렬 ─────────────────────────────────────────────────────────────────


async def test_direction_follows_the_axis(universe) -> None:
    """축이 방향을 정한다 — 큰 값이 좋은 축은 내림차순, 작은 값이 좋은 축은 오름차순.

    "PER 높은 순" 은 조건 검색에서 아무도 찾지 않는 목록이라 파라미터로 열지 않았다.
    응답이 `order` 를 실어 보내는 것은 화면이 정렬 표식을 찍기 위해서다.
    """
    result = await screener_service.get_screener(
        universe, ScreenerQuery(sort="dividend_yield"), limit=50, offset=0
    )
    assert result.order == "desc"
    assert [row.code for row in result.rows][:2] == ["003490", "005930"]

    ascending = await screener_service.get_screener(
        universe, ScreenerQuery(sort="pbr"), limit=50, offset=0
    )
    assert ascending.order == "asc"
    assert ascending.rows[0].code == "900100"  # PBR 0.8


async def test_missing_values_sort_last_in_both_directions(universe) -> None:
    """**NULL 은 어느 축에서도 앞에 오지 않는다.**

    Postgres 는 `DESC` 의 기본이 NULLS FIRST 라, 명시하지 않으면 지표를 아직 못 받은
    종목이 '시가총액 1위' 자리를 차지한다. 13회차에 등락률 랭킹이 이렇게 무너졌고
    오류가 나지 않아 오래 살아남았다.
    """
    descending = await _codes(universe, sort="market_cap")
    assert descending[0] == "005930"
    assert descending[-1] == "900200", "값이 없는 종목이 내림차순 맨 앞을 채웠다"

    # 오름차순 축에서도 마찬가지다. 이쪽은 Postgres 기본값과 방향이 같지만, 기본값에
    # 기대면 나중에 축을 추가하며 조용히 뒤집힌다.
    ascending = await _codes(universe, sort="per")
    assert ascending[-1] == "900200"


async def test_rank_is_absolute_across_pages(universe) -> None:
    """`rank` 는 offset 을 반영한다 — 2페이지 첫 줄이 '1위'면 목록이 거짓말을 한다."""
    page = await screener_service.get_screener(
        universe, ScreenerQuery(sort="market_cap"), limit=2, offset=2
    )

    assert [row.rank for row in page.rows] == [3, 4]
    assert page.total == 6  # 자르기 전 전체 건수


async def test_total_and_rows_come_from_the_same_conditions(universe) -> None:
    """`total` 과 행 수가 같은 WHERE 절에서 나오는가.

    두 곳에 조건을 나눠 적으면 한쪽만 고쳐 어긋나고, 그건 "23건" 이라 쓰고 5줄만
    보여주는 형태로만 드러난다 — 오류가 나지 않는다.
    """
    result = await screener_service.get_screener(
        universe, ScreenerQuery(board="KOSDAQ", per_min=0), limit=50, offset=0
    )

    assert result.total == len(result.rows) == 1  # 247540 만 남는다


# ── 진행률 · 엔드포인트 ────────────────────────────────────────────────────


async def test_coverage_separates_empty_from_unfilled(universe) -> None:
    """조건에 걸린 종목이 없을 때 '없다' 인지 '아직 안 채웠다' 인지 구분할 근거."""
    result = await screener_service.get_screener(
        universe, ScreenerQuery(per_max=-999), limit=50, offset=0
    )

    assert result.rows == []
    assert (result.covered, result.universe_size) == (5, 6)
    assert result.as_of is not None


async def test_endpoint_returns_empty_screener_without_data(client, monkeypatch) -> None:
    """지표 배치가 안 돌았어도 200 이다. 빈 목록은 오류가 아니다."""
    monkeypatch.setattr(snapshot_service, "schedule_snapshot_refresh", lambda: None)

    response = await client.get("/api/v1/markets/screener")

    assert response.status_code == 200
    body = response.json()
    assert body["rows"] == []
    assert body["sort"] == "market_cap"
    assert body["order"] == "desc"


async def test_endpoint_never_triggers_a_live_fetch(client, monkeypatch) -> None:
    """요청이 수집(수십 초)을 기다리지 않는다 — 배경 배치로만 던진다."""
    scheduled: list[bool] = []
    monkeypatch.setattr(
        snapshot_service, "schedule_snapshot_refresh", lambda: scheduled.append(True)
    )

    await client.get("/api/v1/markets/screener?per_max=15&sort=per")

    assert scheduled == [True]


async def test_endpoint_rejects_an_unknown_sort(client, monkeypatch) -> None:
    """정렬 축은 열거다 — 문자열이 SQL 로 가는 유일한 통로라 여기서 막힌다."""
    monkeypatch.setattr(snapshot_service, "schedule_snapshot_refresh", lambda: None)

    response = await client.get("/api/v1/markets/screener?sort=market_cap;drop")

    assert response.status_code == 422
