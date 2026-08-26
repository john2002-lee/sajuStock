"""AI 판단 기록 ORM 모델 (주식 화면 리뉴얼 기획 5.2).

## 왜 저장하는가

지금까지 AI 판단은 **어디에도 남지 않았다.** 클라이언트 React Query 캐시(10분)와
서버 인메모리 캐시(TTL 600초) 둘뿐이라, 그 시간이 지나면 사라진다. 종목당 LLM 4회를
태워 만든 결과이자 이 제품에서 **돈이 나가는 유일한 경로**의 산출물인데 기록이 없다.

기록이 생기면 화면 하나가 따라온다 — 홈의 "내 판단 기록" 이다. *"지난주 삼성전자에
HOLD 를 받았습니다 — 그 뒤 +4.2%"* 는 **다시 올 이유**가 된다. 판단이 맞았는지
확인하러 오게 만드는 것이 이 테이블의 목적이다.

## 소유자당 종목당 한 행

`(owner_key, code)` 에 유니크를 건다. 같은 종목을 다시 분석하면 **덮어쓴다.**

이유는 화면이다. 일괄 분석(`MAX_BULK_SYMBOLS = 10`)은 버튼 한 번에 10건을
만들므로, 이력을 그대로 쌓으면 두 번만 돌려도 홈 목록이 같은 종목들로 도배된다.
"어떻게 바뀌었나" 를 보고 싶어지는 날 이 유니크를 풀고 조회에 `DISTINCT ON` 을
넣으면 되지만, 그 화면이 없는 지금 행을 쌓아 두는 것은 테이블만 키운다.

## 시세를 하나만, 그것도 **그때 값으로** 저장한다

`price_at` 은 판단 시점의 가격이다. 관심종목 테이블이 시세를 저장하지 않는 것과
반대로 보이지만 뜻이 다르다 — 저쪽은 "지금 얼마인가" 라 항상 최신이어야 하고,
이쪽은 **"판단할 때 얼마였나"** 라 그 순간에 고정돼야 한다. 나중에 히스토리에서
역산할 수도 있지만, 그러려면 판단 시각을 거래일로 환산하고 그날 종가를 다시
조회해야 한다 — 한 칸이면 끝날 일이다.

## 공유는 명시적으로 켤 때만

`share_id` 는 공유 버튼을 눌렀을 때만 발급한다. 기본값 `None` 이 곧 비공개다.
그리고 **`personal`(2축 판단)은 이 테이블에 없다** — 그 안에는 사용자의 투자 성향
6축이 들어 있고 그것은 사주에서 유래한 값이다. 공유 카드에 새면 개인의 성향
프로파일이 공개된다. 저장하지 않으면 샐 수 없다.
"""

from sqlalchemy import Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AdviceVerdictRow(TimestampMixin, Base):
    """한 소유자가 한 종목에 대해 받은 최신 AI 판단."""

    __tablename__ = "advice_verdicts"
    __table_args__ = (
        UniqueConstraint("owner_key", "code", name="uq_advice_verdict_owner_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    # `anon:<uuid>` 또는 `user:<uuid>`. 관심종목·프로파일과 같은 규약이다.
    # 다만 AI 판단은 이미 **계정을 요구**하므로(`front/src/app/_data/advice.ts`)
    # 실제로 들어오는 값은 `user:` 뿐이다 — 규약을 맞춰 두는 것은 나중에 그
    # 게이트가 바뀌어도 이 테이블이 따라 바뀌지 않게 하기 위함이다.
    owner_key: Mapped[str] = mapped_column(String(80), index=True)

    # 6자리 종목 코드. 화면 링크(`/stocks/<code>`)가 이 값을 쓴다.
    code: Mapped[str] = mapped_column(String(12), index=True)
    # yfinance 심볼(`005930.KS`). 재분석·시세 조회는 이쪽이 필요하다
    # (`watchlist_items.symbol` 주석의 접미사 함정과 같은 이유).
    symbol: Mapped[str] = mapped_column(String(20))
    # 표시용. 코드만 남기면 목록이 "005930" 여섯 줄이 된다.
    name: Mapped[str] = mapped_column(String(80))

    # BUY · WATCH · AVOID
    decision: Mapped[str] = mapped_column(String(16))
    confidence: Mapped[int] = mapped_column(Integer)
    # llm · fallback · timeout. 규칙 기반으로 착지한 판단을 목록에서 구분한다.
    source: Mapped[str] = mapped_column(String(16))
    # 판단 본문 한 문단.
    answer: Mapped[str] = mapped_column(Text)

    # 판단 시점의 가격. 위 모듈 주석 참고 — 지금 값이 아니라 **그때 값**이다.
    price_at: Mapped[float | None] = mapped_column(Float, nullable=True)

    # 에이전트 3인의 의견 원본. 공유 카드와 상세 보기가 근거를 다시 그린다.
    # 정규화하지 않는 이유: 읽을 때 항상 통째로 읽고, 쓰기는 판단당 한 번이며,
    # 이 안을 조건으로 검색할 일이 없다.
    agent_opinions: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # 공유 버튼을 눌렀을 때만 발급한다. `None` 이 비공개다.
    share_id: Mapped[str | None] = mapped_column(
        String(32), unique=True, index=True, nullable=True
    )
