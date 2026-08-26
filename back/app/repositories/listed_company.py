"""상장사 영속성 계층. 여기서만 SQL을 작성한다."""

import logging
from collections.abc import Mapping, Sequence
from datetime import UTC, date, datetime

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listed_company import ListedCompany
from app.schemas.market import SCREENER_ORDER, ScreenerQuery, ScreenerSort
from app.schemas.stock import CalendarDates, CompanyMetrics, ListedCompanyRecord
from app.utils.text import get_initial_consonants, normalize_search_text

logger = logging.getLogger(__name__)

#: 일정 조회가 허용하는 컬럼. 호출자가 넘긴 문자열을 SQL 에 그대로 넣지 않기 위한 관문이다.
_CALENDAR_COLUMNS = {
    "next_earnings_date": ListedCompany.next_earnings_date,
    "ex_dividend_date": ListedCompany.ex_dividend_date,
}

#: 배치·조회의 모집단. 접미사 없는 행(수집 원본이 깨진 44건)은 yfinance 심볼로 쓸 수
#: 없어 물어봐야 빈손이고, 분모에 넣으면 진행률이 영원히 100%에 닿지 않는다.
_BOARD_FILTER = or_(ListedCompany.symbol.like("%.KS"), ListedCompany.symbol.like("%.KQ"))

#: 정렬 축 → 컬럼. `ScreenerSort` 의 값만 여기 있다 — 문자열이 SQL 로 가는 유일한
#: 통로이므로, 매핑에 없는 값은 존재할 수 없어야 한다 (`_CALENDAR_COLUMNS` 와 같은 관문).
_SCREENER_COLUMNS: dict[ScreenerSort, ColumnElement] = {
    "market_cap": ListedCompany.market_cap,
    "per": ListedCompany.per,
    "pbr": ListedCompany.pbr,
    "dividend_yield": ListedCompany.dividend_yield_pct,
    "roe": ListedCompany.roe_pct,
}

#: 시장 구분 필터. 랭킹이 파이썬에서 `board_of(symbol)` 로 판정하는 것과 같은 근거를
#: SQL 로 옮긴 것이다 — 접미사는 실제로 공급자에게 물어본 심볼 그 자체라 행과 어긋날 수
#: 없다 (`domain/symbols.board_of` 주석).
_BOARD_SUFFIX = {"KOSPI": "%.KS", "KOSDAQ": "%.KQ"}


def _screener_conditions(query: ScreenerQuery) -> list:
    """조건 검색의 WHERE 절. 조회와 건수 세기가 **같은 목록**을 써야 한다.

    두 곳에 나눠 적으면 한쪽만 고쳐 `total` 과 행 수가 어긋나고, 그건 화면에서
    "23건" 이라 쓰고 5줄만 나오는 형태로만 드러난다 — 오류가 나지 않는다.

    비어 있는 조건은 절을 만들지 않는다. `None >= x` 같은 항을 넣으면 SQL 이 전부
    거짓이 되어 결과가 통째로 사라진다.
    """
    conditions: list = [_BOARD_FILTER]

    suffix = _BOARD_SUFFIX.get(query.board)
    if suffix:
        conditions.append(ListedCompany.symbol.like(suffix))

    ranges: list[tuple[ColumnElement, float | int | None, float | int | None]] = [
        (ListedCompany.market_cap, query.market_cap_min, query.market_cap_max),
        (ListedCompany.per, query.per_min, query.per_max),
        (ListedCompany.pbr, query.pbr_min, query.pbr_max),
        (ListedCompany.dividend_yield_pct, query.dividend_min, None),
        (ListedCompany.roe_pct, query.roe_min, None),
    ]
    for column, low, high in ranges:
        if low is not None:
            conditions.append(column >= low)
        if high is not None:
            conditions.append(column <= high)

    return conditions


def _as_date(value: str | None) -> date | None:
    """`'2026-10-28'` → `date`. 비었거나 형식이 다르면 None.

    `repositories/document_chunk._as_date` 와 같은 이유로 문자열을 그대로 넘기지
    않는다 — 컬럼이 `Date` 라 드라이버가 date 를 기대하고, 문자열은 바인딩에서 터진다.
    형식이 이상한 값 하나가 배치 전체를 죽이지 않도록 예외 대신 None 이다.
    """
    text = (value or "").strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        logger.debug("일정 날짜를 읽지 못했습니다: %r", value)
        return None


class ListedCompanyRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def count(self) -> int:
        result = await self._db.execute(select(func.count()).select_from(ListedCompany))
        return result.scalar_one()

    async def find_by_code(self, code: str) -> ListedCompany | None:
        """6자리 코드로 상장사 한 건. 저장된 심볼은 `247540.KQ` 형태라 접두 매칭한다.

        `search_symbol`이 아니라 `symbol`을 보는 이유: 코드는 이미 정규화된
        숫자열이라 검색용 사본을 거칠 이유가 없고, `symbol`에는 unique 인덱스가 있다.
        """
        if not code:
            return None

        stmt = (
            select(ListedCompany)
            .where(or_(ListedCompany.symbol == code, ListedCompany.symbol.like(f"{code}.%")))
            .limit(1)
        )
        result = await self._db.execute(stmt)
        return result.scalars().first()

    async def find_by_symbols(self, symbols: Sequence[str]) -> Sequence[ListedCompany]:
        """여러 심볼을 한 번에. 관심종목처럼 목록 전체의 상호가 필요할 때 쓴다.

        `find_by_code` 를 N번 도는 대신 IN 하나로 끝낸다 — 관심종목 상한이 200이라
        최악의 경우 쿼리 200개가 왕복한다. 호출부가 순서를 정하므로 정렬은 하지 않는다.
        """
        if not symbols:
            return []

        stmt = select(ListedCompany).where(ListedCompany.symbol.in_(list(symbols)))
        result = await self._db.execute(stmt)
        return result.scalars().all()

    async def find_candidates(
        self,
        keyword: str,
        initials: str,
        candidate_limit: int,
    ) -> Sequence[ListedCompany]:
        """키워드/초성에 걸릴 가능성이 있는 행만 SQL로 좁혀 가져온다.

        순위 계산은 파이썬에서 하지만(원본과 동일한 스코어링), 후보 집합을 SQL로 줄여
        전체 테이블을 ORM 객체로 적재하지 않는다. `candidate_limit`에 걸리면 경고를
        남긴다 — 조용히 잘리면 "다 봤다"로 오해되기 때문이다.

        **`autoescape=True` 가 필요한 이유.** 예전에는 f-string 으로 패턴을 만들어
        `%`·`_` 가 와일드카드로 새어 들어갔다. `keyword` 는 `normalize_search_text` 가
        영숫자·한글만 남기므로 안전했지만 `initials` 는 아니다 —
        `get_initial_consonants` 는 한글이 아닌 문자를 소문자로 **그대로 통과시킨다**
        (`LG` → `lg` 가 되는 경로가 그것이다). 그래서 `ㅅ%` 같은 질의가 초성 검색을
        전 종목 스캔으로 바꿀 수 있었다.

        정규화 함수를 조이는 대신 여기서 이스케이프한다. `initial_consonants` 컬럼은
        같은 함수로 **적재**되므로, 함수가 버리는 문자를 늘리면 이미 적재된 값과
        질의가 어긋난다 — 배치가 한 바퀴 돌기 전까지 조용히 못 찾는 상태가 된다.
        """
        conditions = []
        if keyword:
            conditions += [
                ListedCompany.search_symbol.startswith(keyword, autoescape=True),
                ListedCompany.search_name.contains(keyword, autoescape=True),
            ]
        if initials:
            conditions.append(
                ListedCompany.initial_consonants.contains(initials, autoescape=True)
            )

        if not conditions:
            return []

        stmt = select(ListedCompany).where(or_(*conditions)).limit(candidate_limit + 1)
        result = await self._db.execute(stmt)
        companies = result.scalars().all()

        if len(companies) > candidate_limit:
            logger.warning(
                "자동완성 후보가 상한(%d)을 초과해 잘렸습니다 (keyword=%r, initials=%r)",
                candidate_limit,
                keyword,
                initials,
            )
            return companies[:candidate_limit]

        return companies

    async def top_by_market_cap(self, limit: int) -> Sequence[ListedCompany]:
        """등락률 스캔의 모집단. 시가총액 상위부터, 큰 값 먼저.

        `.KS`/`.KQ` 가 붙은 행만 남긴다 — 접미사 없는 행(수집 원본이 깨진 44건)은
        yfinance 심볼로 쓸 수 없어 스캔 자리만 낭비한다.

        **`nullslast()` 가 반드시 있어야 한다.** 예전에는 없었고, 주석은 "SQLite 는
        NULL 을 가장 작은 값으로 보므로 DESC 에서 뒤로 밀린다" 고 적혀 있었다.
        그 전제는 Postgres 에서 **정반대**다 — `DESC` 의 기본이 `NULLS FIRST` 라
        시총이 아직 없는 종목이 모집단 맨 앞을 채웠다. 배치가 덜 돈 상태에서 랭킹이
        조용히 빈 종목으로 채워지는, 오류 없이 틀리는 종류의 버그였다.
        """
        stmt = (
            select(ListedCompany)
            .where(_BOARD_FILTER)
            .order_by(ListedCompany.market_cap.desc().nullslast(), ListedCompany.symbol)
            .limit(limit)
        )
        result = await self._db.execute(stmt)
        return result.scalars().all()

    async def latest_market_cap_update(self) -> datetime | None:
        """가장 최근 시총 갱신 시각. 하루 1회 배치의 TTL 판단에 쓴다."""
        result = await self._db.execute(
            select(func.max(ListedCompany.market_cap_updated_at))
        )
        value = result.scalar_one_or_none()
        if value is None:
            return None
        # Postgres 의 timestamptz 는 tz 를 실어 오므로 대개 그대로 통과한다.
        # 방어를 남겨 두는 이유는 naive 값 하나가 들어오면 아래 비교가 TypeError 로
        # 배치를 통째로 세우기 때문이다 — 되살리는 비용이 그 위험보다 싸다.
        return value if value.tzinfo else value.replace(tzinfo=UTC)

    async def symbols_without_market_cap(self, limit: int) -> list[str]:
        """아직 시총이 없는 종목 심볼. yfinance 폴백이 한 번에 처리할 만큼만 가져온다.

        KOSPI 를 먼저 채운다 — 대형주가 몰려 있어 랭킹 개선 효과가 가장 크다.

        **`market == "KOSPI"` 로 정렬하면 안 된다.** 그 컬럼의 실제 값은 한글이고
        (실측: 코스닥 1806 · 유가 833 · 코넥스 109) `KOSPI` 문자열은 **0건**이라,
        이 비교는 모든 행에서 거짓이 된다 — 정렬 항이 통째로 죽어 심볼 오름차순만
        남는다. 조용히 틀리는 종류라 오래 살아남았다: 배치는 정상 동작하고 채우는
        순서만 무작위에 가까웠다.

        대신 심볼 접미사를 쓴다. `krx_symbol_to_yfinance` 가 시장 구분을 보고 붙인
        값이고 **실제로 공급자에게 물어본 심볼 그 자체**라 그 행과 어긋날 수 없다
        (`domain/symbols.board_of` 주석과 같은 근거).
        """
        stmt = (
            select(ListedCompany.symbol)
            .where(ListedCompany.market_cap.is_(None))
            .order_by(ListedCompany.symbol.like("%.KS").desc(), ListedCompany.symbol)
            .limit(limit)
        )
        result = await self._db.execute(stmt)
        symbols = list(result.scalars().all())

        # 정렬이 살아 있는지 결과로 확인한다.
        #
        # 이 정렬은 **죽어도 오류가 안 난다** — 실제로 그렇게 오래 살아 있었다.
        # 배치는 정상 동작하고 채우는 순서만 무작위가 되므로, "우선순위가 먹었는가" 를
        # 사람이 눈으로 볼 방법이 없었다. 한 번 물어보는 비용이 그 침묵보다 싸다.
        if symbols and not any(s.endswith(".KS") for s in symbols):
            remaining = await self._count_missing_cap_kospi()
            if remaining:
                logger.warning(
                    "시총 배치 %d건에 .KS 가 하나도 없는데 아직 %d종목 남아 있습니다 — "
                    "우선순위 정렬이 죽었을 수 있습니다",
                    len(symbols),
                    remaining,
                )

        return symbols

    async def _count_missing_cap_kospi(self) -> int:
        """시총이 아직 없는 유가증권 종목 수. 위 경보의 근거로만 쓴다."""
        stmt = (
            select(func.count())
            .select_from(ListedCompany)
            .where(
                ListedCompany.market_cap.is_(None),
                ListedCompany.symbol.like("%.KS"),
            )
        )
        return int((await self._db.execute(stmt)).scalar_one())

    async def update_market_caps(self, caps: dict[str, int]) -> int:
        """6자리 코드 → 시총 매핑을 반영한다. 반영된 행 수를 돌려준다.

        pykrx 는 접미사 없는 6자리 코드를 주고 저장된 심볼은 `005930.KS` 이므로
        접미사를 떼고 맞춘다. 매칭되지 않는 종목(해외·신규 상장)은 그대로 NULL 로 둔다.
        """
        if not caps:
            return 0

        now = datetime.now(UTC)
        result = await self._db.execute(select(ListedCompany))
        updated = 0

        for company in result.scalars().all():
            code = company.symbol.split(".", 1)[0]
            cap = caps.get(code)
            if cap is None:
                continue
            company.market_cap = cap
            company.market_cap_updated_at = now
            updated += 1

        await self._db.commit()

        # 받은 것이 있는데 한 건도 못 붙였다면 코드 형식이 어긋난 것이다.
        #
        # pykrx 가 `005930` 을 주고 우리가 `005930.KS` 를 저장한다는 전제가 이 매칭의
        # 전부다. 공급자가 형식을 바꾸면(접미사를 붙여 준다든가) 조용히 0건이 되고,
        # 배치는 "성공" 으로 끝난 채 시총이 영원히 안 채워진다.
        if not updated:
            logger.warning(
                "시총 %d건을 받았지만 한 종목도 매칭되지 않았습니다 — "
                "공급자 코드 형식이 바뀌었을 수 있습니다 (예: %s)",
                len(caps),
                next(iter(caps)),
            )

        return updated

    # --- 오늘의 일정 (실적발표 · 배당락) --------------------------------------

    async def latest_calendar_update(self) -> datetime | None:
        """가장 최근 일정 갱신 시각. 하루 1회 배치의 TTL 판단에 쓴다."""
        result = await self._db.execute(select(func.max(ListedCompany.calendar_updated_at)))
        value = result.scalar_one_or_none()
        if value is None:
            return None
        # `latest_market_cap_update` 와 같은 방어다 — naive 값 하나가 들어오면
        # 호출부의 비교가 TypeError 로 배치를 통째로 세운다.
        return value if value.tzinfo else value.replace(tzinfo=UTC)

    async def symbols_for_calendar_refresh(self, limit: int) -> list[str]:
        """이번 배치가 물어볼 종목. **가장 오래 안 물어본 순**으로 고른다.

        종목당 1회 호출(~1초)이라 전 종목(2,700+)을 한 번에 돌 수 없다. 그래서 시총
        배치처럼 며칠에 걸쳐 채우는데, 시총과 다른 점이 하나 있다: **일정은 만료된다.**
        실적발표일이 지나면 그 값은 과거를 가리키므로 다시 물어봐야 한다. 그래서
        "아직 없는 것" 이 아니라 "가장 오래된 것" 이 기준이다.

        `nullsfirst()` 가 여기서는 **맞다.** 한 번도 안 물어본 종목(NULL)이 가장 오래된
        것이므로 맨 앞이어야 한다 — `top_by_market_cap` 의 `nullslast()` 와 방향이
        반대인 이유는 거기서는 NULL 이 "값 없음"(뒤로)이고 여기서는 "가장 오래됨"(앞으로)
        이기 때문이다. 둘 다 **명시**한다는 것이 규칙이고, 방향은 뜻이 정한다.

        모집단은 `.KS`/`.KQ` 로 제한한다. 접미사 없는 행은 yfinance 심볼로 쓸 수 없어
        물어봐야 빈손이고 배치 자리만 낭비한다 (`top_by_market_cap` 과 같은 근거).

        ## 같은 시각끼리는 무엇으로 가르나 — 신호 셋을 순서대로

        전 종목이 한 번도 안 물어본 상태(전부 NULL)면 첫 항이 통째로 동점이라 **그
        아래가 실제 순서를 정한다.** 그래서 세 겹을 둔다.

        1. `market_cap desc nullslast` — 있으면 이게 가장 좋은 신호다
        2. `.KS` 먼저 — **시총이 비어 있을 때 실제로 일하는 항이다.** 실측으로 이 DB 는
           2,747건 전부 `market_cap` 이 NULL 이었고(시총 배치가 성공한 적이 없다),
           그 상태에서 1번만 있으면 정렬이 사실상 임의가 된다 — 배치가 무명 종목부터
           채워 홈 화면이 2주 동안 엉뚱한 이름만 보여준다. `symbols_without_market_cap`
           이 같은 이유로 같은 항을 쓴다
        3. `symbol` — 순서를 **결정적으로** 만든다. 없으면 동점 구간이 물리적 행 순서라
           실행마다 달라지고, "왜 이 종목이 먼저인가" 를 설명할 수 없다
        """
        stmt = (
            select(ListedCompany.symbol)
            .where(_BOARD_FILTER)
            .order_by(
                ListedCompany.calendar_updated_at.asc().nullsfirst(),
                ListedCompany.market_cap.desc().nullslast(),
                ListedCompany.symbol.like("%.KS").desc(),
                ListedCompany.symbol,
            )
            .limit(limit)
        )
        result = await self._db.execute(stmt)
        return list(result.scalars().all())

    async def update_snapshots(
        self,
        dates: Mapping[str, CalendarDates],
        metrics: Mapping[str, CompanyMetrics],
        answered: Sequence[str],
    ) -> tuple[int, int]:
        """일정과 지표를 반영한다. `(날짜를 얻은 종목 수, 지표를 얻은 종목 수)`.

        **`answered` 는 "응답을 받은 종목" 이지 "물어본 종목" 이 아니다.** 그 둘을
        같게 두었다가 실제로 데이터를 지웠다 — 공급자가 요청을 거부한 배치가 전 종목을
        "일정 없음" 으로 만들어 이미 수집한 날짜를 NULL 로 덮었다
        (`schemas/stock.CalendarRecord` 주석). 응답을 못 받은 종목은 이 목록에서
        빠지므로 여기서 아무것도 하지 않고, 다음 배치가 다시 물어본다.

        응답받은 종목에는 **날짜가 없어도 `calendar_updated_at` 을 찍는다.** 일정이 없는
        종목(배당을 안 하거나 발표일이 안 잡힌 곳)이 다수인데 이걸 안 찍으면 그것들이
        `nullsfirst` 정렬 맨 앞에 영원히 남아 배치가 같은 자리를 돈다. 로그로도 안
        보이는 제자리걸음이다.

        날짜를 **덮어쓰는** 것은 의도다. 실적발표가 끝나면 공급자가 다음 분기 날짜를
        주고, 그때 값이 바뀌어야 '오늘의 일정' 이 과거를 가리키지 않는다. 응답받은
        종목에서 일정이 사라졌으면(취소·미정) 그것도 반영한다.

        ## 지표는 세 갈래로 나뉜다 — 값이 온 **경로**가 다르기 때문이다

        `metrics` 에 항목이 없는 종목은 지표를 **아무것도 건드리지 않는다.** 항목이
        있으면 그 안에서 다시 갈린다.

            ROE · 배당수익률   그대로 덮어쓴다. `get_info()` 응답에서 왔고 응답은
                              받았으므로, 값이 없으면 없는 것이 사실이다 (배당을
                              중단한 회사는 수익률이 사라져야 한다)
            PER · PBR         `valuation_ok` 일 때만 쓴다. 이 둘만 `get_info()` 가
                              아니라 `get_valuation_measures()` 에서 오는데, **별개의
                              호출이라 info 는 멀쩡한데 이쪽만 실패할 수 있다.**
                              그때 None 은 "없다" 가 아니라 "모른다" 다
            시가총액          **있을 때만** 쓴다. 이 컬럼은 이 배치만의 것이 아니다 —
                              KRX 벌크 경로(`update_market_caps`)도 같은 컬럼에 쓰고
                              그쪽 계약이 "있는 값만" 이다. 두 writer 가 반대 규칙을
                              가지면 같은 종목의 시총이 어느 배치가 나중에 돌았느냐에
                              따라 나타났다 사라진다

        `fundamentals_updated_at` 은 PER/PBR 을 실제로 쓴 경우에만 찍는다. 밸류에이션
        호출이 실패한 배치에서 이 시각을 갱신하면, 화면이 옛날 PER 을 오늘 값이라고
        말하게 된다 (`models/listed_company` 주석).
        """
        if not answered:
            return 0, 0

        now = datetime.now(UTC)
        result = await self._db.execute(
            select(ListedCompany).where(ListedCompany.symbol.in_(list(answered)))
        )

        filled_dates = 0
        filled_metrics = 0
        for company in result.scalars().all():
            value = dates.get(company.symbol)
            company.ex_dividend_date = _as_date(value.ex_dividend_date) if value else None
            company.next_earnings_date = _as_date(value.next_earnings_date) if value else None
            company.calendar_updated_at = now
            if company.ex_dividend_date or company.next_earnings_date:
                filled_dates += 1

            metric = metrics.get(company.symbol)
            if metric is None:
                continue

            company.roe_pct = metric.roe_pct
            company.dividend_yield_pct = metric.dividend_yield_pct
            if metric.market_cap:
                company.market_cap = metric.market_cap
                company.market_cap_updated_at = now
            if metric.valuation_ok:
                company.per = metric.per
                company.pbr = metric.pbr
                company.fundamentals_updated_at = now
            if metric.per is not None or metric.pbr is not None:
                filled_metrics += 1

        await self._db.commit()
        return filled_dates, filled_metrics

    async def calendar_coverage(self) -> tuple[int, int]:
        """`(일정을 한 번이라도 받은 종목 수, 배치 모집단 크기)`.

        화면이 "아직 채우는 중" 을 말할 근거다. 분모는 전 종목이 아니라 배치가 실제로
        물어보는 모집단(`.KS`/`.KQ`)이다 — 접미사 없는 행을 분모에 넣으면 진행률이
        영원히 100%에 닿지 않는다.
        """
        total = int(
            (
                await self._db.execute(
                    select(func.count()).select_from(ListedCompany).where(_BOARD_FILTER)
                )
            ).scalar_one()
        )
        covered = int(
            (
                await self._db.execute(
                    select(func.count())
                    .select_from(ListedCompany)
                    .where(
                        _BOARD_FILTER,
                        or_(
                            ListedCompany.next_earnings_date.is_not(None),
                            ListedCompany.ex_dividend_date.is_not(None),
                        ),
                    )
                )
            ).scalar_one()
        )
        return covered, total

    async def upcoming_calendar(
        self, column: str, start: date, end: date, limit: int
    ) -> Sequence[ListedCompany]:
        """`[start, end]` 안에 해당 일정이 있는 종목. 날짜 오름차순, 같은 날은 시총 큰 순.

        `column` 은 `"next_earnings_date"` 또는 `"ex_dividend_date"` 다. 문자열로 받는
        이유는 두 컬럼의 쿼리가 완전히 같아서인데, **호출자가 넘긴 문자열을 그대로 SQL 에
        넣지 않는다** — 아래 매핑에 없는 값은 거부한다.

        `nullslast()` 가 없다. 여기서는 `between` 이 NULL 을 이미 걸러내므로 정렬에
        NULL 이 도달할 수 없다 — `test_postgres_dialect` 의 규칙 검사기가 이 자리를
        지적하지 않는 것도 그 때문이다(그 검사기는 `DESC` 정렬만 본다).
        시총 정렬에는 `nullslast()` 를 붙인다. 그쪽은 진짜로 NULL 이 섞인다.
        """
        target = _CALENDAR_COLUMNS.get(column)
        if target is None:
            raise ValueError(f"알 수 없는 일정 컬럼: {column!r}")

        stmt = (
            select(ListedCompany)
            .where(target.between(start, end))
            .order_by(target.asc(), ListedCompany.market_cap.desc().nullslast())
            .limit(limit)
        )
        result = await self._db.execute(stmt)
        return result.scalars().all()

    async def count_upcoming_calendar(self, column: str, start: date, end: date) -> int:
        """위 조회의 전체 건수. `limit` 으로 잘리기 전 숫자다."""
        target = _CALENDAR_COLUMNS.get(column)
        if target is None:
            raise ValueError(f"알 수 없는 일정 컬럼: {column!r}")

        stmt = (
            select(func.count())
            .select_from(ListedCompany)
            .where(target.between(start, end))
        )
        return int((await self._db.execute(stmt)).scalar_one())

    # --- 스크리너 (조건 검색) --------------------------------------------------

    async def latest_fundamentals_update(self) -> datetime | None:
        """가장 최근 지표 갱신 시각. 화면의 `as_of` 가 여기서 나온다.

        `latest_calendar_update` 와 **따로** 둔다. 같은 배치가 둘 다 찍지만
        밸류에이션 호출만 실패한 배치는 일정만 갱신하므로, 하나로 합치면 화면이
        옛날 PER 을 오늘 값이라고 말하게 된다.
        """
        result = await self._db.execute(select(func.max(ListedCompany.fundamentals_updated_at)))
        value = result.scalar_one_or_none()
        if value is None:
            return None
        # `latest_market_cap_update` 와 같은 방어다.
        return value if value.tzinfo else value.replace(tzinfo=UTC)

    async def screener_coverage(self) -> tuple[int, int]:
        """`(지표를 한 번이라도 받은 종목 수, 배치 모집단 크기)`.

        `calendar_coverage` 와 같은 목적이고 분모도 같다 — 접미사 없는 행을 넣으면
        진행률이 영원히 100%에 닿지 않는다.

        분자는 PER **또는** PBR 이 있는 종목이다. ROE·배당수익률로 세지 않는 이유:
        그 둘은 값이 없는 것이 정상인 종목이 많아(적자·무배당) 진행률이 아니라
        시장 구성을 재게 된다.
        """
        covered = int(
            (
                await self._db.execute(
                    select(func.count())
                    .select_from(ListedCompany)
                    .where(
                        _BOARD_FILTER,
                        or_(ListedCompany.per.is_not(None), ListedCompany.pbr.is_not(None)),
                    )
                )
            ).scalar_one()
        )
        total = int(
            (
                await self._db.execute(
                    select(func.count()).select_from(ListedCompany).where(_BOARD_FILTER)
                )
            ).scalar_one()
        )
        return covered, total

    async def count_with_market_cap(self) -> int:
        """시가총액이 채워진 종목 수. 관리자 화면의 배치 진행률에 쓴다.

        분모는 `calendar_coverage`/`screener_coverage` 와 같은 모집단(`.KS`/`.KQ`)이라
        여기서는 분자만 센다 — 세 진행률이 같은 분모를 공유해야 나란히 읽힌다.
        """
        stmt = (
            select(func.count())
            .select_from(ListedCompany)
            .where(_BOARD_FILTER, ListedCompany.market_cap.is_not(None))
        )
        return int((await self._db.execute(stmt)).scalar_one())

    async def screen(
        self, query: ScreenerQuery, *, limit: int, offset: int
    ) -> Sequence[ListedCompany]:
        """조건에 맞는 종목. 정렬 축의 방향은 `SCREENER_ORDER` 가 정한다.

        **NULL 은 정렬의 맨 뒤다 — 방향과 무관하게.** `asc()` 의 Postgres 기본값이
        이미 NULLS LAST 이고 `desc()` 는 NULLS FIRST 지만, 여기서는 둘 다 명시한다.
        기본값에 기대면 나중에 축을 하나 추가하면서 방향만 바꿨을 때 조용히 뒤집힌다 —
        13회차에 `top_by_market_cap` 이 정확히 그렇게 무너졌다. 뜻은 한 문장이다:
        **값이 없는 종목은 어느 축에서도 앞에 오지 않는다.**

        타이브레이크로 `symbol` 을 둔다. 없으면 동점 구간이 물리적 행 순서라 페이지를
        넘길 때 같은 종목이 두 번 나오거나 사라진다 (`offset` 페이지네이션의 고전적 사고).
        """
        column = _SCREENER_COLUMNS[query.sort]
        direction = (
            column.asc().nullslast()
            if SCREENER_ORDER[query.sort] == "asc"
            else column.desc().nullslast()
        )

        stmt = (
            select(ListedCompany)
            .where(*_screener_conditions(query))
            .order_by(direction, ListedCompany.symbol)
            .limit(limit)
            .offset(offset)
        )
        result = await self._db.execute(stmt)
        return result.scalars().all()

    async def count_screened(self, query: ScreenerQuery) -> int:
        """위 조회의 전체 건수. `limit` 으로 잘리기 전 숫자다."""
        stmt = (
            select(func.count()).select_from(ListedCompany).where(*_screener_conditions(query))
        )
        return int((await self._db.execute(stmt)).scalar_one())

    async def upsert_many(self, records: Sequence[ListedCompanyRecord]) -> int:
        """심볼 기준 upsert. 중복 심볼은 첫 건만 반영한다."""
        existing_result = await self._db.execute(select(ListedCompany))
        existing_by_symbol = {row.symbol: row for row in existing_result.scalars().all()}

        seen: set[str] = set()
        written = 0

        for record in records:
            if record.symbol in seen:
                continue
            seen.add(record.symbol)

            search_symbol = normalize_search_text(record.symbol)
            search_name = normalize_search_text(record.name)
            initials = record.initial_consonants or get_initial_consonants(record.name)

            company = existing_by_symbol.get(record.symbol)
            if company is None:
                self._db.add(
                    ListedCompany(
                        symbol=record.symbol,
                        name=record.name,
                        market=record.market,
                        search_symbol=search_symbol,
                        search_name=search_name,
                        initial_consonants=initials,
                    )
                )
            else:
                company.name = record.name
                company.market = record.market
                company.search_symbol = search_symbol
                company.search_name = search_name
                company.initial_consonants = initials
            written += 1

        await self._db.commit()
        return written
