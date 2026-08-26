"""시장 개요 · 등락률 랭킹 서비스 (명세 6.1)."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from app.core.background import schedule_once
from app.core.config import settings
from app.domain.symbols import board_of
from app.integrations.yfinance.market import fetch_market_overview
from app.integrations.yfinance.movers import scan_movers
from app.repositories.listed_company import ListedCompanyRepository
from app.schemas.market import (
    MarketMovers,
    MarketOverview,
    MarketRanking,
    MoverRow,
    MoversScan,
    RankingRow,
)
from app.schemas.stock import ListedCompanyRecord

logger = logging.getLogger(__name__)


async def get_overview(category: str = "index") -> MarketOverview:
    return await asyncio.to_thread(fetch_market_overview, category)


# ── 등락률 랭킹 스냅샷 ────────────────────────────────────────────────
# 스캔 한 번이 200종목 기준 약 7초다. 요청마다 돌 수 없고, 그렇다고 첫 요청을
# 7초 기다리게 할 수도 없다(프런트의 캐시 조회 타임아웃이 5초다). 그래서
# stale-while-revalidate: 만료된 스냅샷도 일단 그대로 내보내고 갱신은 배경으로
# 던진다. 시가총액 배치(`listed_company_service`)가 쓰는 방식과 같다.
#
# 프로세스 메모리에만 있다. 재시작하면 비고, 기동 시 warm-up 이 다시 채운다.
_scan: MoversScan | None = None
# 성공·실패와 무관한 '마지막 시도' 시각. 실패했을 때 이 값을 갱신하지 않으면
# 매 요청이 갱신을 예약해 실패를 계속 두드린다.
_scanned_at: datetime | None = None
_scan_lock = asyncio.Lock()


def _is_fresh() -> bool:
    if _scanned_at is None:
        return False
    return datetime.now(UTC) - _scanned_at < timedelta(
        seconds=settings.market_movers_ttl_seconds
    )


async def _load_universe(repo: ListedCompanyRepository) -> list[ListedCompanyRecord]:
    """스캔 모집단. 종목 목록을 코드에 박지 않고 KRX 수집 결과에서 뽑는다."""
    companies = await repo.top_by_market_cap(settings.market_movers_universe_size)
    return [
        ListedCompanyRecord(symbol=company.symbol, name=company.name, market=company.market)
        for company in companies
    ]


async def refresh_movers(repo: ListedCompanyRepository) -> MoversScan | None:
    """등락률 스냅샷을 다시 만든다. 실패하면 직전 스냅샷을 그대로 둔다.

    ## 시도 시각을 `finally` 에서 찍는다

    "실패해도 시각은 갱신한다"(실패 연타 방지)는 규칙이 세 갈래에 흩어져 있었고,
    **한 갈래가 빠져 있었다** — `_load_universe` 의 DB 실패다. 그 예외는 try 밖이라
    시각을 남기지 않고 밖으로 새어, `_is_fresh()` 가 계속 False 인 채
    `/markets/movers` 요청마다 새 태스크가 같은 자리에서 죽었다. 배경 태스크였으므로
    화면에는 흔적이 없고 홈만 조용히 직전 스냅샷으로 남는다.

    `finally` 는 **조기 반환(이미 신선함)보다 뒤에** 있다. 그 경로까지 시각을 다시
    찍으면 TTL 이 매 요청 앞으로 밀려 스냅샷이 영원히 갱신되지 않는다 — 규칙을 한
    곳으로 모으면서 정확히 그 함정을 밟을 수 있는 자리다.
    """
    global _scan, _scanned_at

    async with _scan_lock:
        # 락을 기다리는 동안 다른 요청이 이미 채웠을 수 있다.
        # **이 반환은 try 밖이어야 한다** (위 주석).
        if _is_fresh():
            return _scan

        try:
            universe = await _load_universe(repo)
            if not universe:
                logger.info("등락률 스캔: 상장사 목록이 비어 있어 건너뜁니다")
                return _scan

            label = f"시가총액 상위 {len(universe)}종목"
            scan = await asyncio.to_thread(scan_movers, universe, universe_label=label)

            if not scan.rows:
                logger.warning("등락률 스캔 결과가 비어 직전 스냅샷을 유지합니다")
                return _scan

            _scan = scan
            return scan
        except Exception:  # noqa: BLE001 - 랭킹 실패가 홈 화면을 죽이면 안 된다
            logger.exception("등락률 스캔 실패 — 직전 스냅샷을 유지합니다")
            return _scan
        finally:
            _scanned_at = datetime.now(UTC)


async def _refresh_in_new_session() -> None:
    """요청 세션은 응답과 함께 닫히므로 배경 갱신은 자기 세션을 연다."""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        await refresh_movers(ListedCompanyRepository(session))


def _schedule_movers_refresh() -> None:
    """갱신을 배경 태스크로 띄운다. 이미 도는 중이면 아무것도 하지 않는다.

    **`min_interval` 을 주지 않는다** — 만료 판정은 `refresh_movers` 가 `_is_fresh()`
    로 이미 한다. 여기서 한 번 더 걸면 같은 판정이 두 곳에 생기고, `market_movers_ttl_seconds`
    를 고칠 때 한쪽만 고치는 자리가 된다.

    테스트가 이 이름을 대역으로 세운다(`test_market.py` · `test_market_ranking.py`) —
    막지 않으면 랭킹 테스트가 실제 yfinance 벌크 다운로드를 친다. 그래서 공용
    스케줄러를 부르더라도 **이 함수 자체는 남는다.**
    """
    schedule_once("movers", _refresh_in_new_session)


def _to_response(scan: MoversScan | None, limit: int) -> MarketMovers:
    """스냅샷을 상승/하락 상위로 자른다.

    부호로 갈라 담는다 — 전 종목이 하락한 날 '상승률 상위'에 마이너스 종목이
    올라오면 그건 랭킹이 아니라 거짓말이다. 그런 날은 그쪽 목록이 짧아진다.
    """
    updated_at = (_scanned_at or datetime.now(UTC)).isoformat(timespec="seconds")
    if scan is None:
        return MarketMovers(updated_at=updated_at)

    gainers = [row for row in scan.rows if row.change_percent > 0][:limit]
    losers = [row for row in reversed(scan.rows) if row.change_percent < 0][:limit]

    return MarketMovers(
        as_of=scan.as_of,
        source=scan.source,
        universe_label=scan.universe_label,
        universe_size=scan.universe_size,
        scanned=len(scan.rows),
        gainers=gainers,
        losers=losers,
        updated_at=updated_at,
    )


def _ranked_rows(scan: MoversScan, caps: dict[str, int | None], sort: str) -> list[MoverRow]:
    """필터 전 정렬만 적용한 행 목록.

    `sort == "change"` 는 **재정렬하지 않는다** — `scan.rows` 가 이미 등락률
    내림차순이라 다시 정렬하면 같은 순서를 얻으려고 비용만 쓴다.
    """
    if sort == "change":
        return list(scan.rows)

    # 시총 미수집(None)은 항상 뒤로. 파이썬 정렬은 안정적이라 시총이 같거나 둘 다
    # 없으면 등락률 순서가 그대로 유지된다.
    return sorted(
        scan.rows,
        key=lambda row: (caps.get(row.symbol) is None, -(caps.get(row.symbol) or 0)),
    )


async def get_ranking(
    repo: ListedCompanyRepository,
    *,
    sort: str = "market_cap",
    board: str = "ALL",
    limit: int = 50,
    offset: int = 0,
) -> MarketRanking:
    """탐색 화면용 랭킹. 등락률 스냅샷을 그대로 재사용한다.

    스캔을 새로 돌지 않는 이유: `MoversScan.rows` 가 이미 모집단 **전체**를 담고 있고
    그 모집단이 곧 `top_by_market_cap` 이다. 랭킹은 그걸 다르게 자를 뿐이다.

    시가총액은 스냅샷에 없다(`_load_universe` 가 `ListedCompanyRecord` 로 좁히며 버린다).
    그래서 모집단을 만든 그 쿼리를 다시 돌려 심볼로 붙인다 — 인덱스 쿼리 한 번이다.
    **이 딕셔너리를 캐시하면 안 된다**: 시총 배치보다 오래 살아남아 갱신을 가린다.
    """
    if not _is_fresh():
        # 반드시 기존 스케줄러를 쓴다 — 테스트가 이 이름 하나만 막고 있어서,
        # 별도 스케줄러를 두면 랭킹 테스트가 실제 네트워크를 친다.
        _schedule_movers_refresh()

    updated_at = (_scanned_at or datetime.now(UTC)).isoformat(timespec="seconds")
    scan = _scan
    if scan is None:
        return MarketRanking(sort=sort, board=board, updated_at=updated_at)

    companies = await repo.top_by_market_cap(settings.market_movers_universe_size)
    caps: dict[str, int | None] = {c.symbol: c.market_cap for c in companies}

    rows = _ranked_rows(scan, caps, sort)
    ranked = [
        RankingRow(
            **row.model_dump(),
            board=row_board,
            market_cap=caps.get(row.symbol),
            rank=index,
        )
        for index, row in enumerate(rows, start=1)
        # 접미사가 없는 종목은 시장을 단정할 수 없어 목록에서 뺀다.
        if (row_board := board_of(row.symbol)) is not None
        and (board == "ALL" or row_board == board)
    ]

    # rank 는 필터 후 다시 매긴다 — 코스닥만 본 사용자에게 "3위 다음 7위"는 뜻이 없다.
    for position, item in enumerate(ranked, start=1):
        item.rank = position

    return MarketRanking(
        as_of=scan.as_of,
        source=scan.source,
        universe_label=scan.universe_label,
        sort=sort,
        board=board,
        total=len(ranked),
        rows=ranked[offset : offset + limit],
        updated_at=updated_at,
    )


async def get_movers(limit: int) -> MarketMovers:
    """상승률·하락률 상위. 만료됐으면 배경 갱신을 예약하고 즉시 응답한다.

    리포지토리를 받지 않는다 — 갱신은 배경 태스크가 자기 세션으로 하므로 요청
    세션과 무관하다. 스냅샷이 아직 없으면 빈 응답이고, 프런트는 그때 예시
    데이터로 내려간다 (기동 시 warm-up 이 이 창을 없앤다).
    """
    if not _is_fresh():
        _schedule_movers_refresh()

    return _to_response(_scan, limit)
