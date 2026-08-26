"""AI 판단 기록 스키마 (주식 화면 리뉴얼 기획 5.2).

## 왜 `AdviceStreamDecision` 을 그대로 받지 않는가

받으면 **`personal` 이 함께 들어온다.** 그 안에는 사용자의 투자 성향 6축과
적합도가 있고, 그것은 사주에서 유래한 값이다. 공유 카드에 새면 개인의 성향
프로파일이 공개된다.

"저장할 때 빼면 된다" 는 방식은 필드가 하나 늘 때마다 다시 판단해야 한다.
**받는 모양 자체를 좁혀 두면 샐 길이 없다** — 이 파일이 하는 일이 그것이다.

## 클라이언트가 보낸 값을 그대로 믿는다

스트림이 끝난 뒤 프런트가 POST 한다. 백엔드가 스스로 저장하지 않는 이유는
`services/advice_stream.py` 의 제약이다 — 그 제너레이터 안에서 DB 를 만지면
수십 초 동안 세션이 붙잡히고, 최종 판단이 나가는 출구가 셋(정상 4단계 · 예산
만료 착지 · 이미 낸 결론 유지)이라 세 곳을 모두 건드려야 한다. 그 파일은 취소
의미론에 대한 경고가 곳곳에 박힌 자리다.

**대가는 위조 가능성이다.** 이 경로로 아무 판단이나 넣을 수 있다. 다만 넣을 수
있는 곳은 **자기 목록**뿐이고(`owner_key` 는 서버가 세션에서 채운다), 공유는
링크를 아는 사람만 보는 비공개 기본값이다. 남의 기록을 바꾸거나 공개 목록을
오염시키는 경로는 없다.
"""

from pydantic import BaseModel, Field

from app.schemas.advice import AgentOpinion, DecisionSource


class AdviceVerdictCreate(BaseModel):
    """판단 하나를 기록한다. **`personal` 은 받지 않는다** (모듈 주석)."""

    code: str = Field(min_length=1, max_length=12)
    symbol: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=80)

    decision: str = Field(min_length=1, max_length=16, description="BUY · WATCH · AVOID")
    confidence: int = Field(ge=0, le=100)
    source: DecisionSource = "llm"
    answer: str = Field(min_length=1)

    #: 판단 시점의 가격. 없으면 "그 뒤 얼마" 를 계산할 수 없어 화면이 그 줄을 뺀다.
    price_at: float | None = None

    #: 에이전트 3인의 의견. 근거를 다시 그릴 때 쓴다.
    agent_opinions: list[AgentOpinion] = Field(default_factory=list)


class AdviceVerdictOut(BaseModel):
    """목록·상세 응답 한 건."""

    id: int
    code: str
    symbol: str
    name: str

    decision: str
    confidence: int
    source: DecisionSource
    answer: str
    price_at: float | None = None
    agent_opinions: list[AgentOpinion] = Field(default_factory=list)

    #: 지금 시세. 저장하지 않고 조회할 때 붙인다 (`advice_verdict_service`).
    price_now: float | None = None
    #: 판단 이후 수익률. **없으면 `None`** — 0 이 아니다. 화면은 없으면 그 줄을 뺀다.
    since_percent: float | None = None
    #: 공유가 켜져 있으면 그 id. `None` 이면 비공개다.
    share_id: str | None = None
    #: 이 판단을 언제 받았는가. 화면이 "8월 18일" 로 그린다.
    created_at: str


class AdviceVerdictList(BaseModel):
    items: list[AdviceVerdictOut] = Field(default_factory=list)


class AdviceVerdictShared(BaseModel):
    """공유 링크로 보는 한 건. **소유자를 밝히지 않는다.**

    누가 받은 판단인지는 공유의 내용이 아니다 — 링크를 받은 사람에게 필요한 것은
    종목과 판단이고, 그 이상은 링크를 넘겨받은 제3자에게까지 흘러간다.
    """

    code: str
    name: str
    decision: str
    confidence: int
    source: DecisionSource
    answer: str
    agent_opinions: list[AgentOpinion] = Field(default_factory=list)
    created_at: str
