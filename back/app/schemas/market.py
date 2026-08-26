"""시장 개요 스키마 (명세 6.1)."""

from typing import Literal

from pydantic import BaseModel, Field


class MarketRow(BaseModel):
    name: str
    symbol: str
    value: float
    change: float | None = None
    change_percent: float | None = None
    tone: Literal["up", "down"] = "up"
    highlight: bool = False
    chart_points: list[float] = Field(default_factory=list)
    chart_labels: list[str] = Field(default_factory=list)


class MarketOverview(BaseModel):
    category: str
    label: str
    rows: list[MarketRow] = Field(default_factory=list)
    chart_points: list[float] = Field(default_factory=list)
    chart_labels: list[str] = Field(default_factory=list)
    updated_at: str


class MoverRow(BaseModel):
    """등락률 랭킹 한 줄. 이름은 KRX 상호이고 시세는 공급자에서 온다."""

    name: str
    #: yfinance 심볼 (247540.KQ)
    symbol: str
    #: 라우팅용 6자리 코드 (247540)
    code: str
    #: KRX 시장 구분 원문 (유가 · 코스닥 · 코넥스)
    market: str | None = None
    price: float
    change: float | None = None
    change_percent: float
    #: 스파크라인 원본 종가
    spark: list[float] = Field(default_factory=list)


class MoversScan(BaseModel):
    """스캔 1회분. 등락률 내림차순 **전체**를 담는다.

    상위 N만 잘라 담지 않는 이유: 서비스가 이 스냅샷 하나를 캐시해 두고
    요청마다 `limit`을 다르게 잘라 쓴다 — limit이 바뀔 때마다 수 초짜리
    스캔을 다시 돌 이유가 없다.
    """

    #: 기준 봉 날짜 (YYYY-MM-DD). 스캔이 비면 None
    as_of: str | None = None
    #: 등락률을 얻어온 경로
    source: Literal["YFINANCE", "KRX"] = "YFINANCE"
    #: 화면에 그대로 노출하는 모집단 설명 ("시가총액 상위 200종목")
    universe_label: str = ""
    #: 모집단으로 넘긴 종목 수 (스캔 실패분 포함)
    universe_size: int = 0
    rows: list[MoverRow] = Field(default_factory=list)


class MarketMovers(BaseModel):
    """상승률·하락률 상위 응답. 서비스가 `MoversScan`을 잘라 만든다."""

    as_of: str | None = None
    source: Literal["YFINANCE", "KRX"] = "YFINANCE"
    universe_label: str = ""
    universe_size: int = 0
    #: 등락률을 실제로 산출한 종목 수 (모집단보다 작을 수 있다)
    scanned: int = 0
    gainers: list[MoverRow] = Field(default_factory=list)
    losers: list[MoverRow] = Field(default_factory=list)
    updated_at: str


CalendarKind = Literal["earnings", "ex_dividend"]


class CalendarEvent(BaseModel):
    """'오늘의 일정' 한 줄. 실적발표 또는 배당락 **하나**를 가리킨다.

    한 종목이 같은 기간에 둘 다 있으면 **줄이 둘 나온다.** 한 줄에 두 날짜를 합치면
    화면이 날짜순으로 정렬할 수 없다 — 이 목록의 축은 종목이 아니라 날짜다.
    """

    name: str
    #: yfinance 심볼 (005930.KS)
    symbol: str
    #: 라우팅용 6자리 코드 (005930)
    code: str
    board: Literal["KOSPI", "KOSDAQ"] | None = None
    kind: CalendarKind
    #: YYYY-MM-DD
    date: str
    #: 오늘까지 남은 일수. 0 이면 오늘, 음수는 나오지 않는다(지난 일정은 제외한다)
    d_day: int
    #: 원. 화면이 큰 종목을 먼저 보여줄 근거다. 배치가 아직 안 채웠으면 None
    market_cap: int | None = None


class MarketCalendar(BaseModel):
    """`GET /markets/calendar` 응답.

    `updated_at` 은 응답을 만든 시각이고, `as_of` 는 **일정 배치가 마지막으로 돈 날**이다.
    둘을 나눈 이유: 값이 며칠 스테일해도 응답은 매번 새로 만들어지므로, `updated_at`
    하나만 보면 데이터가 최신이라고 오해한다.
    """

    #: 일정 배치가 마지막으로 돈 날 (YYYY-MM-DD). 한 번도 안 돌았으면 None
    as_of: str | None = None
    #: 조회 창 (오늘부터 며칠)
    days: int = 7
    #: 창 안의 전체 건수. `events` 는 `limit` 으로 잘린다
    total: int = 0
    events: list[CalendarEvent] = Field(default_factory=list)
    #: 일정이 채워진 종목 수 / 전체 종목 수. 배치가 얼마나 진행됐는지 화면이 알린다
    covered: int = 0
    universe_size: int = 0
    updated_at: str


RankingSort = Literal["market_cap", "change"]
RankingBoard = Literal["ALL", "KOSPI", "KOSDAQ"]


class RankingRow(MoverRow):
    """탐색 화면(`/stocks`)의 한 줄. `MoverRow` + 순위·시총·시장 구분."""

    #: 심볼 접미사에서 유도한 값. 위 `market`(유가·코스닥 원문)과 달리 프런트 계약이다.
    board: Literal["KOSPI", "KOSDAQ"]
    #: 원. 시가총액 배치가 아직 안 채운 종목은 None (전 종목의 30%가량)
    market_cap: int | None = None
    #: 1부터. offset을 반영한 절대 순위라 페이지를 넘겨도 이어진다
    rank: int


class MarketRanking(BaseModel):
    """`GET /markets/ranking` 응답.

    `MarketMovers`와 달리 부호로 가르지 않는다 — 필터가 적용된 **한 목록** + `total`이다.
    같은 `MoversScan` 스냅샷에서 나오므로 랭킹 때문에 스캔이 추가로 돌지는 않는다.
    """

    as_of: str | None = None
    source: Literal["YFINANCE", "KRX"] = "YFINANCE"
    universe_label: str = ""
    sort: RankingSort = "market_cap"
    board: RankingBoard = "ALL"
    #: 필터 적용 **후** 전체 건수. 페이지네이션의 근거다
    total: int = 0
    rows: list[RankingRow] = Field(default_factory=list)
    updated_at: str


# ── 스크리너 (조건 검색) ──────────────────────────────────────────────────

#: 정렬 축. 방향은 **축이 정한다** (`SCREENER_ORDER`) — 사용자가 뒤집을 축이 아니다.
#: "PER 높은 순" 은 조건 검색에서 아무도 찾지 않는 목록이고, 방향을 파라미터로 열면
#: 화면·URL·백엔드 셋에 뜻 없는 조합이 생긴다.
ScreenerSort = Literal["market_cap", "per", "pbr", "dividend_yield", "roe"]

#: 축별 정렬 방향. `desc` 는 큰 값이 좋은 축, `asc` 는 작은 값이 좋은 축이다.
SCREENER_ORDER: dict[ScreenerSort, Literal["asc", "desc"]] = {
    "market_cap": "desc",
    "per": "asc",
    "pbr": "asc",
    "dividend_yield": "desc",
    "roe": "desc",
}


class ScreenerQuery(BaseModel):
    """조건 검색 한 벌. 엔드포인트의 쿼리 파라미터와 1:1 이다.

    ## 조건에 걸린 컬럼이 NULL 이면 그 종목은 **빠진다**

    SQL 이 그렇게 동작하고(`NULL <= 15` 는 참이 아니다) 그게 맞는 동작이다 — "PER 15
    이하" 를 물었는데 PER 을 모르는 종목이 섞여 나오면 그 목록은 조건을 만족하지 않는다.
    배치가 아직 안 채운 종목이 조용히 사라지는 것처럼 보일 수 있어, 응답이 `covered`
    로 진행률을 함께 낸다.

    ## `per_min` 을 왜 두나 — 적자 기업이 '저PER' 로 올라온다

    PER 은 음수가 될 수 있다(순손실). `per_max=15` 만 걸면 PER −3 인 적자 회사가
    가장 싼 종목으로 목록 맨 앞에 온다. 화면의 프리셋은 그래서 하한을 항상 함께 건다.
    """

    board: RankingBoard = "ALL"
    #: 원. 화면은 '1조 이상' 같은 프리셋으로 보내고 단위 변환은 프런트가 한다.
    market_cap_min: int | None = None
    market_cap_max: int | None = None
    per_min: float | None = None
    per_max: float | None = None
    pbr_min: float | None = None
    pbr_max: float | None = None
    #: % 이상. 상한을 두지 않는 이유는 "배당수익률 N% 이하" 를 찾는 사람이 없어서다.
    dividend_min: float | None = None
    #: % 이상. 위와 같다.
    roe_min: float | None = None
    sort: ScreenerSort = "market_cap"


class ScreenerRow(BaseModel):
    """조건 검색 결과 한 줄.

    `RankingRow` 와 달리 **가격·등락률·스파크라인이 없다.** 그쪽은 등락률 스냅샷
    (시가총액 상위 200종목)에서 오는데 조건 검색의 모집단은 상장 전 종목(2,700+)이라,
    대부분의 행에 시세가 없다. 빈 칸을 절반쯤 채운 표를 보여주느니 이 화면은 지표만
    말하고 시세는 종목 상세로 넘긴다.
    """

    name: str
    #: yfinance 심볼 (005930.KS)
    symbol: str
    #: 라우팅용 6자리 코드 (005930)
    code: str
    board: Literal["KOSPI", "KOSDAQ"]
    #: 원. 지표 배치가 아직 안 채운 종목은 None
    market_cap: int | None = None
    per: float | None = None
    pbr: float | None = None
    roe_pct: float | None = None
    dividend_yield_pct: float | None = None
    #: 1부터. offset 을 반영한 절대 순위라 페이지를 넘겨도 이어진다
    rank: int


class ScreenerResult(BaseModel):
    """`GET /markets/screener` 응답."""

    #: 지표 배치가 마지막으로 돈 날 (YYYY-MM-DD). 한 번도 안 돌았으면 None.
    #: `MarketCalendar.as_of` 와 같은 이유로 `updated_at` 과 나눈다 — 응답은 매번 새로
    #: 만들어지므로 그것만 보면 값이 최신이라고 오해한다
    as_of: str | None = None
    sort: ScreenerSort = "market_cap"
    order: Literal["asc", "desc"] = "desc"
    board: RankingBoard = "ALL"
    #: 조건 적용 **후** 전체 건수. 페이지네이션의 근거다
    total: int = 0
    rows: list[ScreenerRow] = Field(default_factory=list)
    #: 지표가 채워진 종목 수 / 배치 모집단. 조건에 걸린 종목이 적을 때 "없다" 인지
    #: "아직 안 채웠다" 인지 화면이 구분할 근거다 (`MarketCalendar` 와 같은 장치)
    covered: int = 0
    universe_size: int = 0
    updated_at: str
