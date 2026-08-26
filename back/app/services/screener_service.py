"""스크리너 — 조건 검색 (P2). **조회만 한다.**

지표를 채우는 것은 `snapshot_service` 의 하루 1회 배치다. 이 파일은 그것이 적재한
컬럼을 조건에 맞춰 자른다.

## 랭킹(`market_service.get_ranking`)과 무엇이 다른가

같은 `/stocks` 화면의 두 탭이지만 **데이터 경로가 완전히 다르다.**

    랭킹      등락률 스냅샷(메모리) — 시가총액 상위 200종목. 가격·등락률·스파크라인이
              있고, 5분마다 배경 스캔이 갱신한다
    조건 검색  DB — 상장 전 종목(2,700+). 지표만 있고 시세가 없으며, 하루 1회 배치가
              갱신한다

둘을 한 경로로 합치려면 전 종목의 시세를 매번 스캔하거나(수 분) 조건 검색의 모집단을
200종목으로 줄여야 한다. 어느 쪽도 답이 아니라서 나눠 두고, 화면이 그 차이를 캡션으로
말한다. 그래서 조건 검색 결과에는 가격 열이 없다 (`schemas/market.ScreenerRow` 주석).
"""

import logging
from datetime import UTC, datetime

from app.domain.symbols import board_of
from app.integrations.yfinance.calendar import KST
from app.repositories.listed_company import ListedCompanyRepository
from app.schemas.market import SCREENER_ORDER, ScreenerQuery, ScreenerResult, ScreenerRow

logger = logging.getLogger(__name__)


def _row(company, rank: int) -> ScreenerRow | None:
    """행 하나. 시장을 단정할 수 없으면 None 이다.

    쿼리가 이미 `.KS`/`.KQ` 만 남기므로 여기서 걸릴 행은 없다. 그래도 `board_of` 의
    반환형이 `| None` 이라 무시하면 타입이 거짓말을 하게 되고, 나중에 모집단 조건을
    넓혔을 때 조용히 `board=None` 인 행이 프런트 계약을 깬다.
    """
    board = board_of(company.symbol)
    if board is None:
        return None

    return ScreenerRow(
        name=company.name,
        symbol=company.symbol,
        code=company.symbol.split(".", 1)[0],
        board=board,
        market_cap=company.market_cap,
        per=company.per,
        pbr=company.pbr,
        roe_pct=company.roe_pct,
        dividend_yield_pct=company.dividend_yield_pct,
        rank=rank,
    )


async def get_screener(
    repo: ListedCompanyRepository,
    query: ScreenerQuery,
    *,
    limit: int,
    offset: int,
) -> ScreenerResult:
    """조건에 맞는 종목 한 페이지.

    `total` 은 `limit` 으로 자르기 **전** 건수다 — 페이지네이션의 근거이고, 조건이
    너무 좁은지 사용자가 판단할 유일한 숫자이기도 하다.

    `rank` 는 `offset` 을 반영한 절대 순위다. 페이지마다 1부터 다시 매기면 2페이지
    첫 줄이 "1위" 가 되어 목록이 거짓말을 한다.
    """
    total = await repo.count_screened(query)
    companies = await repo.screen(query, limit=limit, offset=offset)

    rows = [
        row
        for index, company in enumerate(companies, start=offset + 1)
        if (row := _row(company, index)) is not None
    ]

    covered, universe = await repo.screener_coverage()
    latest = await repo.latest_fundamentals_update()

    return ScreenerResult(
        as_of=latest.astimezone(KST).date().isoformat() if latest else None,
        sort=query.sort,
        order=SCREENER_ORDER[query.sort],
        board=query.board,
        total=total,
        rows=rows,
        covered=covered,
        universe_size=universe,
        updated_at=datetime.now(UTC).isoformat(timespec="seconds"),
    )
