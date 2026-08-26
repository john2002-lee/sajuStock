"""관심종목 스키마 (신규).

프런트 `features/watchlist/model/types.ts` 와 필드 의미를 맞춘다. 다만 **저장하는 것과
보여주는 것을 구분**한다 — 이름·시세·스파크는 컬럼이 아니라 조회 시점에 붙는 값이다.
"""

from pydantic import BaseModel, Field, field_validator

DEFAULT_GROUP = "관찰"


class WatchlistHolding(BaseModel):
    """보유 정보. 둘 다 있거나 둘 다 없다 — 수량만 알면 평가손익을 낼 수 없다."""

    quantity: int = Field(ge=0)
    avg_price: float = Field(gt=0)


class WatchlistAlert(BaseModel):
    enabled: bool = False
    #: "75,000원 도달 시" — 발송 경로가 없는 지금은 자유 텍스트다
    condition: str = Field(default="", max_length=120)


class WatchlistRow(BaseModel):
    """화면 한 줄 — 저장된 것 + 시세를 합친 형태."""

    name: str
    #: yfinance 심볼 (005930.KS)
    symbol: str
    #: 라우팅·식별용 6자리 코드 (005930)
    code: str
    #: KRX 시장 구분 원문 (유가 · 코스닥 · 코넥스)
    market: str | None = None
    group: str = DEFAULT_GROUP
    #: 사용자가 끈 순서. 값이 아니라 대소 관계만 의미가 있다
    position: int = 0

    #: 아래 셋은 저장하지 않는다. 조회 시점의 시세다 — 상류가 막히면 0 으로 온다
    price: float = 0.0
    change_percent: float = 0.0
    spark: list[float] = Field(default_factory=list)

    holding: WatchlistHolding | None = None
    alert: WatchlistAlert = Field(default_factory=WatchlistAlert)


class WatchlistGroup(BaseModel):
    name: str
    count: int


class Watchlist(BaseModel):
    """`GET /watchlist` 응답."""

    items: list[WatchlistRow] = Field(default_factory=list)
    groups: list[WatchlistGroup] = Field(default_factory=list)
    #: 헤더 캡션용 집계. 화면이 items.length 로 유도하지 않도록 서버가 따로 준다
    total_count: int = 0
    group_count: int = 0
    active_alerts: int = 0
    #: 보유 종목 전체의 평가손익률(%). 보유가 없으면 0
    total_return_percent: float = 0.0
    #: 시세를 언제 붙였는지. 저장 데이터의 수정 시각이 아니다
    updated_at: str = ""


class WatchlistAddRequest(BaseModel):
    """6자리 코드도 `005930.KS` 도 받는다 — 서버가 KRX 목록으로 확정한다."""

    symbol: str = Field(min_length=1, max_length=40)
    group: str | None = Field(default=None, max_length=40)


class WatchlistOrderRequest(BaseModel):
    """새 순서 전체를 코드 배열로 받는다.

    "이 종목을 3번으로" 같은 부분 갱신이 아니라 전체를 받는 이유: 드래그 한 번이
    여러 행의 상대 순서를 바꾸고, 부분 갱신으로 표현하면 클라이언트와 서버가 서로
    다른 순서를 갖게 되는 중간 상태가 생긴다.
    """

    codes: list[str] = Field(min_length=1, max_length=500)


class WatchlistClaimRequest(BaseModel):
    """익명으로 모은 목록을 로그인 계정으로 승계한다.

    받는 쪽(`to`)은 헤더의 `X-Owner-Key` 다 — 본문으로 받으면 아무 계정으로나 옮길 수
    있게 된다. 본문에는 **내놓는 쪽만** 담는다.
    """

    #: 익명 소유자 키(`anon:<uuid>`). 프런트 BFF 가 httpOnly 쿠키에서 읽어 넣는다.
    from_key: str = Field(min_length=1, max_length=80)

    @field_validator("from_key")
    @classmethod
    def _must_be_anonymous_key(cls, value: str) -> str:
        """`user:<uuid>` 를 받으면 로그인한 아무나 남의 계정 데이터를 승계해 갈 수
        있다 — 승계 방향은 항상 "익명 → 로그인 계정" 이어야 하므로 여기서 막는다.
        """
        if not value.startswith("anon:"):
            raise ValueError("from_key는 익명 소유자 키(anon:<uuid>)여야 합니다")
        return value


class WatchlistItemPatch(BaseModel):
    """그룹·알림·보유 부분 수정.

    **보내지 않은 필드는 건드리지 않는다.** `holding: null` 을 명시적으로 보내면
    보유 해제다 — 그 둘을 구분하려고 `model_fields_set` 을 쓴다(서비스 계층).
    """

    group: str | None = Field(default=None, max_length=40)
    alert: WatchlistAlert | None = None
    holding: WatchlistHolding | None = None
