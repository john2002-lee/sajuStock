"""판단 기록에 **지금 시세**를 붙인다.

## 무엇이 어디서 오는가

    advice_verdicts        판정 · 신뢰도 · 근거 · `price_at`   ← 판단할 때의 값
    yfinance (scan_movers) 현재가                              ← 조회 시점의 값

`price_at` 만 저장하고 현재가는 저장하지 않는다. 관심종목이 같은 규칙을 쓴다
(`watchlist_service` 모듈 주석) — 저장하면 그 순간부터 낡고, 화면은 항상 최신을
원한다.

## 왜 `scan_movers` 인가

**이미 있는 벌크 경로다.** 심볼 목록을 주면 한 번의 `yf.download` 로 전부 채워
온다. 기록 여섯 건에 `get_history` 를 여섯 번 부르면 홈 한 화면이 상류 왕복
여섯을 만든다 — 기획 5.5 가 "어디에 붙일지 따로 정할 일" 이라며 비워 둔 자리의
답이 이것이다: **새 경로를 만들 필요가 없었다.**

## 실패하면 그냥 없는 값이다

시세 조회가 실패해도 기록은 그대로 낸다. 화면은 `since_percent` 가 `None` 이면
그 줄을 그리지 않는다 — "그 뒤 0%" 는 **판단 뒤 그대로였다**는 틀린 사실이 된다.
"""

import asyncio
import logging

from app.integrations.yfinance.movers import scan_movers
from app.models.advice_verdict import AdviceVerdictRow
from app.schemas.stock import ListedCompanyRecord

logger = logging.getLogger(__name__)


async def current_prices(rows: list[AdviceVerdictRow]) -> dict[str, float]:
    """기록에 실린 심볼들의 현재가. 실패하면 빈 dict 다.

    캐시를 두지 않는다 — 관심종목 쪽은 목록이 크고(최대 20종목) 대시보드가 자주
    열려 TTL 캐시가 값을 하지만, 여기는 홈에서 최대 여섯 건이고 `scan_movers` 가
    이미 한 번의 다운로드다. 캐시를 하나 더 두면 무효화 규칙만 늘어난다.
    """
    if not rows:
        return {}

    # `scan_movers` 는 상장사 레코드를 받는다. 이름·시장은 표시에 쓰지 않으므로
    # 기록에 있는 값을 그대로 채워 넣는다 — 이 호출이 원하는 것은 심볼뿐이다.
    universe = [
        ListedCompanyRecord(symbol=row.symbol, name=row.name, market="KOSPI")
        for row in rows
    ]

    try:
        # yfinance 는 동기 블로킹이다 — 이벤트 루프를 막지 않도록 스레드로 넘긴다.
        scan = await asyncio.to_thread(scan_movers, universe, universe_label="판단 기록")
    except Exception:
        logger.warning("판단 기록 시세 조회 실패 — 시세 없이 목록만 냅니다", exc_info=True)
        return {}

    return {row.symbol: row.price for row in scan.rows if row.price is not None}


def since_percent(row: AdviceVerdictRow, price_now: float | None) -> float | None:
    """판단 이후 수익률. **기준가나 현재가가 없으면 `None`** — 0 이 아니다.

    `price_at` 은 나중에 추가된 컬럼이라 그 전에 저장된 행에는 없다. 없는 것을
    0%로 그리면 "판단 뒤 그대로였다" 는 **틀린 사실**을 말하게 된다.
    """
    if not row.price_at or price_now is None:
        return None
    return round((price_now - row.price_at) / row.price_at * 100, 2)
