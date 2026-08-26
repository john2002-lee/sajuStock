"""상장사 목록 · 자동완성 서비스 (명세 6.2)."""

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.core.background import schedule_once
from app.core.config import settings
from app.domain.ranking import rank_companies
from app.domain.symbols import krx_symbol_to_yfinance, normalize_stock_code
from app.integrations.krx.client import collect_listed_companies
from app.integrations.krx.market_cap import (
    fetch_market_caps_from_krx,
    fetch_market_caps_from_yfinance,
)
from app.repositories.listed_company import ListedCompanyRepository
from app.schemas.stock import (
    KrxListing,
    ListedCompaniesStatus,
    ListedSource,
    SourceStep,
    StockSuggestion,
)
from app.utils.text import get_initial_consonants, normalize_search_text

logger = logging.getLogger(__name__)

_SOURCE_LABELS: dict[ListedSource, str] = {
    "KRX": "KRX CSV",
    "KIND": "KIND 목록",
    "INTERNAL": "내부 기본 종목",
}
_PIPELINE: tuple[ListedSource, ...] = ("KRX", "KIND", "INTERNAL")


_MARKET_CAP_TTL = timedelta(days=1)


@dataclass
class _SeedState:
    """수집 진행 상태. 프로세스 메모리에만 있고 재시작하면 초기화된다.

    프런트의 첫 호출 지연 배너가 폴링할 대상이다 — 이 상태가 없으면 어느
    경로로 수집됐는지(KRX/KIND/내부)가 로그에만 남아 사용자에게 알릴 수 없다.
    """

    running: bool = False
    source: ListedSource = "KRX"
    total: int = 0


_seed = _SeedState()
_seed_lock = asyncio.Lock()
_market_cap_lock = asyncio.Lock()


async def refresh_market_caps(
    repo: ListedCompanyRepository, *, force: bool = False
) -> int:
    """전 종목 시가총액을 하루 1회 갱신한다. 반영된 종목 수를 돌려준다.

    자동완성 랭킹의 가중치일 뿐이므로 실패해도 서비스는 정상 동작해야 한다 —
    예외는 로깅만 하고 위로 던지지 않는다. 시총이 비어 있으면 랭킹이
    폴백 정렬(보통주 → KOSPI → 이름 길이 → 가나다)로 내려갈 뿐이다.
    """
    async with _market_cap_lock:
        try:
            if not force:
                latest = await repo.latest_market_cap_update()
                if latest and datetime.now(UTC) - latest < _MARKET_CAP_TTL:
                    return 0

            # 1차: pykrx 벌크 (동기 블로킹 → 이벤트 루프를 막지 않도록 스레드로)
            record = await asyncio.to_thread(fetch_market_caps_from_krx)

            # 2차: KRX 가 막혔거나 비었을 때만. 종목당 1회 호출이라 아직 값이 없는
            # 종목만, 한 번에 상한 개수까지 채운다 — 며칠에 걸쳐 완성된다.
            if not record.caps:
                pending = await repo.symbols_without_market_cap(
                    settings.market_cap_batch_limit
                )
                if pending:
                    logger.info(
                        "KRX 실패 → yfinance 폴백으로 %d종목 시도", len(pending)
                    )
                    record = await asyncio.to_thread(
                        fetch_market_caps_from_yfinance, pending
                    )

            if not record.caps:
                logger.warning("시가총액 배치: 가져온 값이 없어 갱신을 건너뜁니다")
                return 0

            updated = await repo.update_market_caps(record.caps)
            logger.info(
                "시가총액 배치: %d종목 반영 (기준일 %s)", updated, record.as_of
            )
            return updated
        except Exception:  # noqa: BLE001 - 랭킹 가중치 실패가 검색을 죽이면 안 된다
            logger.exception("시가총액 배치 실패 — 폴백 정렬로 계속합니다")
            return 0


async def ensure_seeded(repo: ListedCompanyRepository) -> None:
    """저장된 상장사가 임계값보다 적으면 수집을 시도한다.

    첫 호출은 외부 수집 때문에 느릴 수 있다 — 프런트에서 스켈레톤과
    "목록 준비 중" 안내를 보여주는 근거가 이 지연이다 (와이어프레임 1d).

    동시 요청이 같은 수집을 중복 실행하지 않도록 락으로 감싼다.
    """
    count = await repo.count()
    if count >= settings.listed_company_min_count:
        return

    async with _seed_lock:
        # 락을 기다리는 동안 다른 요청이 이미 채웠을 수 있다.
        if await repo.count() >= settings.listed_company_min_count:
            return

        logger.info(
            "상장사 %d건 저장됨 (임계값 %d) → 수집 시작",
            count,
            settings.listed_company_min_count,
        )
        _seed.running = True
        try:
            records, source = await collect_listed_companies()
            written = await repo.upsert_many(records)
            _seed.source = source
            _seed.total = len(records)
            logger.info("상장사 %d건 반영 완료 (source=%s)", written, source)
        finally:
            _seed.running = False


async def _refresh_market_caps_in_new_session() -> int:
    """요청 세션은 응답과 함께 닫히므로 백그라운드 작업은 자기 세션을 연다."""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        return await refresh_market_caps(ListedCompanyRepository(session))


def _schedule_market_cap_refresh() -> None:
    """갱신을 백그라운드 태스크로 띄운다.

    검색 요청이 시총 수집(수 초)을 기다리게 하지 않는다. `min_interval` 은 DB 를
    보지 않는 메모리 가드다 — 매 검색마다 세션을 열어 마지막 갱신 시각을 확인하면
    그 확인이 곧 낭비다 (`core/background` 주석).

    테스트가 이 이름을 대역으로 세운다(`test_api_stocks.py`). 공용 스케줄러를
    부르더라도 이 함수 자체는 남는다.
    """
    schedule_once(
        "market_cap", _refresh_market_caps_in_new_session, min_interval=_MARKET_CAP_TTL
    )


def _steps(used: ListedSource) -> list[SourceStep]:
    """실제로 쓰인 경로 앞은 '실패', 그 자리는 '사용', 뒤는 '대기'."""
    used_at = _PIPELINE.index(used)
    return [
        SourceStep(
            label=_SOURCE_LABELS[source],
            source=source,
            state="실패" if index < used_at else "사용" if index == used_at else "대기",
        )
        for index, source in enumerate(_PIPELINE)
    ]


async def get_status(repo: ListedCompanyRepository) -> ListedCompaniesStatus:
    """상장사 목록 준비 상태 (명세 6.2 `ensure_listed_companies`).

    수집은 벌크 다운로드 한 번이라 '몇 건 중 몇 건' 같은 세분 진행률이 없다.
    loaded 는 DB에 실제로 들어간 건수, total 은 수집한 원본 건수(아직이면 임계값)다.
    """
    count = await repo.count()
    ready = not _seed.running and count >= settings.listed_company_min_count
    return ListedCompaniesStatus(
        ready=ready,
        loaded=count,
        total=_seed.total or max(count, settings.listed_company_min_count),
        source=_seed.source,
        steps=_steps(_seed.source),
    )


async def resolve_listing(
    repo: ListedCompanyRepository, symbol: str
) -> KrxListing | None:
    """입력 심볼을 KRX 목록에서 확정한다. 국내 6자리 코드가 아니면 None.

    상세·AI 판단이 yfinance를 부르기 전에 거치는 단계다. 여기서 접미사를 확정하지
    않으면 `247540` → `.KS` 먼저 시도 → 야후가 엉뚱한 계열(하루 늦은 시세 +
    `"247540.KS,0P0001GZPV,623889"` 이름)을 돌려주고 그게 화면에 뜬다.

    `ensure_seeded()`를 부르지 않는다 — 상세 화면 한 번 여는데 KRX 벌크 수집(수 초)을
    기다리게 할 수는 없다. 목록이 아직 비어 있으면 None 을 주고 기존 경로로 내려간다.
    """
    code = normalize_stock_code(symbol)
    if len(code) != 6:
        return None

    company = await repo.find_by_code(code)
    if company is None:
        return None

    return KrxListing(
        symbol=krx_symbol_to_yfinance(company.symbol, company.market),
        name=company.name,
    )


async def search(
    repo: ListedCompanyRepository,
    query: str,
    limit: int,
) -> list[StockSuggestion]:
    """종목명 · 코드 · 초성 검색."""
    await ensure_seeded(repo)
    # 하루 지났을 때만 실제로 갱신한다. 첫 요청이 느려지지 않도록 백그라운드로 던지고
    # 결과를 기다리지 않는다 — 이번 검색은 기존(또는 빈) 시총으로 랭킹된다.
    _schedule_market_cap_refresh()

    keyword = normalize_search_text(query)
    initials = get_initial_consonants(query)
    if not keyword and not initials:
        return []

    candidates = await repo.find_candidates(keyword, initials, settings.suggestion_candidate_limit)
    matches = rank_companies(list(candidates), keyword, initials)

    return [StockSuggestion.model_validate(company) for company in matches[:limit]]
