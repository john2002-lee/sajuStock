"""관심종목 서비스 — 저장된 것과 시세를 합친다.

## 무엇이 어디서 오는가

    저장소(watchlist_items)      그룹 · 순서 · 보유 · 알림     ← 사용자가 정한 것
    listed_companies             종목명 · 시장 구분            ← KRX 수집분
    yfinance (scan_movers)       현재가 · 등락률 · 스파크      ← 조회 시점의 값

셋 중 저장하는 것은 첫 줄뿐이다. 나머지를 컬럼에 넣으면 그 순간부터 낡기 시작하고,
화면은 항상 최신 시세를 원한다.

## 시세를 `scan_movers` 로 가져오는 이유

이미 있는 벌크 경로다. 심볼 목록을 주면 한 번의 `yf.download` 로 이름·현재가·
등락률·3개월 스파크를 전부 채워 온다 — 홈 등락 상위와 종목 탐색이 쓰는 바로 그
함수다. 종목마다 `get_history` 를 부르면 20종목에 20왕복이 되고, 같은 값을 계산하는
코드가 두 벌이 된다.

## TTL 캐시의 키가 심볼 집합인 이유

소유자를 키로 잡으면 종목을 담거나 뺐을 때 캐시가 낡은 목록을 계속 준다. 심볼 집합을
키로 두면 **목록이 바뀌는 순간 키가 바뀌어** 자동으로 새로 받는다. 덤으로 같은 종목을
담은 두 사람이 캐시를 공유한다.
"""

import asyncio
import logging
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.domain.symbols import normalize_stock_code
from app.integrations.yfinance.movers import scan_movers
from app.models.watchlist import WatchlistItem
from app.repositories.listed_company import ListedCompanyRepository
from app.repositories.watchlist import MAX_ITEMS_PER_OWNER, WatchlistRepository
from app.schemas.market import MoverRow
from app.schemas.stock import ListedCompanyRecord
from app.schemas.watchlist import (
    DEFAULT_GROUP,
    Watchlist,
    WatchlistAlert,
    WatchlistGroup,
    WatchlistHolding,
    WatchlistItemPatch,
    WatchlistRow,
)

logger = logging.getLogger(__name__)

_quote_cache: dict[tuple[str, ...], tuple[datetime, dict[str, MoverRow]]] = {}
#: 캐시에 남겨 둘 심볼 조합 수. 조합마다 한 벌이라 사용자가 늘면 늘어난다.
_QUOTE_CACHE_SIZE = 64


class WatchlistFullError(RuntimeError):
    """소유자당 상한에 도달했다. 엔드포인트가 409 로 옮긴다."""


class UnknownSymbolError(RuntimeError):
    """KRX 목록에서 확정하지 못한 종목. 엔드포인트가 404 로 옮긴다."""


async def _quotes(records: Sequence[ListedCompanyRecord]) -> dict[str, MoverRow]:
    """심볼 → 시세. 실패는 빈 dict 로 흡수한다.

    상류가 막혔다고 관심종목 화면이 통째로 죽으면 안 된다 — 그룹·보유·알림은 우리
    저장소에 있고, 시세만 0 으로 비는 편이 낫다. 화면은 그 상태를 그릴 수 있다.
    """
    if not records:
        return {}

    key = tuple(sorted(record.symbol for record in records))
    cached = _quote_cache.get(key)
    if cached is not None and datetime.now(UTC) - cached[0] < timedelta(
        seconds=settings.market_movers_ttl_seconds
    ):
        return cached[1]

    try:
        # yfinance 는 동기 블로킹이다 — 이벤트 루프를 막지 않도록 스레드로 넘긴다.
        scan = await asyncio.to_thread(
            scan_movers, list(records), universe_label="관심종목"
        )
    except Exception:
        logger.warning("관심종목 시세 조회 실패 — 시세 없이 목록만 냅니다", exc_info=True)
        # 만료된 값이라도 있으면 그게 0 보다 낫다.
        return cached[1] if cached is not None else {}

    quotes = {row.symbol: row for row in scan.rows}
    _quote_cache[key] = (datetime.now(UTC), quotes)
    while len(_quote_cache) > _QUOTE_CACHE_SIZE:
        oldest = min(_quote_cache, key=lambda k: _quote_cache[k][0])
        del _quote_cache[oldest]
    return quotes


def _to_row(
    item: WatchlistItem,
    record: ListedCompanyRecord | None,
    quote: MoverRow | None,
) -> WatchlistRow:
    code = normalize_stock_code(item.symbol)
    holding = (
        WatchlistHolding(quantity=item.quantity, avg_price=item.avg_price)
        if item.quantity is not None and item.avg_price is not None
        else None
    )

    return WatchlistRow(
        # 이름은 KRX 상호 > 시세 응답 > 코드 순으로 떨어진다. 공급자의 shortName 은
        # 영문이거나 아예 이름이 아닐 수 있어(symbols.is_usable_stock_name) 뒤에 둔다.
        name=(record.name if record else None) or (quote.name if quote else None) or code,
        symbol=item.symbol,
        code=code,
        market=(record.market if record else None) or (quote.market if quote else None),
        group=item.group_name or DEFAULT_GROUP,
        position=item.position,
        price=quote.price if quote else 0.0,
        change_percent=quote.change_percent if quote else 0.0,
        spark=list(quote.spark) if quote else [],
        holding=holding,
        alert=WatchlistAlert(
            enabled=item.alert_enabled, condition=item.alert_condition
        ),
    )


def _summarize(rows: Sequence[WatchlistRow]) -> Watchlist:
    groups: dict[str, int] = {}
    for row in rows:
        groups[row.group] = groups.get(row.group, 0) + 1

    # 평가손익은 **금액 가중**이다. 종목별 수익률을 단순 평균하면 100원짜리 1주와
    # 10만원짜리 100주가 같은 무게가 되어 합계가 실제 손익과 어긋난다.
    cost = 0.0
    value = 0.0
    for row in rows:
        if row.holding is None or row.price <= 0:
            continue
        cost += row.holding.avg_price * row.holding.quantity
        value += row.price * row.holding.quantity

    return Watchlist(
        items=list(rows),
        groups=[WatchlistGroup(name=name, count=count) for name, count in groups.items()],
        total_count=len(rows),
        group_count=len(groups),
        active_alerts=sum(1 for row in rows if row.alert.enabled),
        total_return_percent=round((value - cost) / cost * 100, 2) if cost > 0 else 0.0,
        updated_at=datetime.now(UTC).isoformat(timespec="seconds"),
    )


async def get_watchlist(
    watchlist_repo: WatchlistRepository,
    listing_repo: ListedCompanyRepository,
    owner_key: str,
) -> Watchlist:
    items = list(await watchlist_repo.list_for_owner(owner_key))
    if not items:
        return Watchlist(updated_at=datetime.now(UTC).isoformat(timespec="seconds"))

    companies = await listing_repo.find_by_symbols([item.symbol for item in items])
    records = {
        company.symbol: ListedCompanyRecord(
            symbol=company.symbol, name=company.name, market=company.market
        )
        for company in companies
    }
    quotes = await _quotes(list(records.values()))

    rows = [_to_row(item, records.get(item.symbol), quotes.get(item.symbol)) for item in items]
    return _summarize(rows)


async def add_item(
    watchlist_repo: WatchlistRepository,
    listing_repo: ListedCompanyRepository,
    owner_key: str,
    *,
    symbol: str,
    group: str | None = None,
) -> bool:
    """담는다. 새로 담겼으면 True, 이미 있었으면 False.

    **심볼을 KRX 목록으로 확정하고 저장한다.** 6자리 코드만 저장하면 나중에 시세를
    부를 때 `.KS`/`.KQ` 를 추측해야 하고, 야후는 틀린 접미사에도 다른 종목의 시세를
    돌려준다 (`domain/symbols.board_of` 주석).
    """
    code = normalize_stock_code(symbol)
    company = await listing_repo.find_by_code(code) if len(code) == 6 else None
    if company is None:
        raise UnknownSymbolError(f"KRX 목록에서 찾을 수 없는 종목입니다: {symbol}")

    # 상한은 **새로 담을 때만** 본다. 이미 담긴 종목을 다시 눌렀을 때 상한 오류가
    # 나면, 사용자는 아무것도 바꾸지 않았는데 실패를 본다.
    if await watchlist_repo.find(owner_key, company.symbol) is None:
        if await watchlist_repo.count_for_owner(owner_key) >= MAX_ITEMS_PER_OWNER:
            raise WatchlistFullError(
                f"관심종목은 {MAX_ITEMS_PER_OWNER}개까지 담을 수 있습니다"
            )

    _, created = await watchlist_repo.add(
        owner_key, company.symbol, group=group or DEFAULT_GROUP
    )
    return created


async def patch_item(
    watchlist_repo: WatchlistRepository,
    owner_key: str,
    code: str,
    patch: WatchlistItemPatch,
) -> bool:
    """그룹·알림·보유 부분 수정. 대상이 없으면 False.

    `model_fields_set` 으로 **보내지 않은 필드와 명시적 null 을 구분**한다.
    그러지 않으면 그룹만 바꾸려는 요청이 보유 정보를 조용히 지운다.
    """
    item = await watchlist_repo.find_by_code(owner_key, code)
    if item is None:
        return False

    sent = patch.model_fields_set

    if "group" in sent and patch.group:
        item.group_name = patch.group

    if "alert" in sent:
        item.alert_enabled = patch.alert.enabled if patch.alert else False
        item.alert_condition = patch.alert.condition if patch.alert else ""

    if "holding" in sent:
        item.quantity = patch.holding.quantity if patch.holding else None
        item.avg_price = patch.holding.avg_price if patch.holding else None

    # ORM 객체를 고친 것만으로는 아무것도 저장되지 않는다 (repository.save 주석).
    await watchlist_repo.save()
    return True
