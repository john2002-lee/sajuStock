"""관심종목 ORM 모델.

이 프로젝트에서 **처음으로 사용자가 소유하는 데이터**다. 지금까지의 테이블
(`listed_companies` · `document_chunks`)은 전부 우리가 외부에서 수집해 온 것이라
"누구 것인가"라는 질문이 없었다.

## 소유자를 `owner_key` 문자열 하나로 둔 이유

로그인이 아직 없다(`front/src/auth.ts` 는 `providers: []`). 그렇다고 저장소를
로그인 뒤로 미루면 화면이 계속 목 데이터로 남는다. 그래서 **소유자를 불투명한
문자열 하나로 추상화**하고, 지금은 브라우저마다 발급한 익명 ID를 넣는다.

    지금:   owner_key = "anon:9f3c…"   (httpOnly 쿠키)
    로그인: owner_key = "user:42"      (세션의 사용자 ID)

로그인이 붙는 날 할 일은 **행의 `owner_key` 를 갈아끼우는 UPDATE 한 번**이다 —
익명으로 모아 둔 관심종목이 그대로 계정에 승계된다. 외래키로 `users.id` 를 걸었다면
사용자 테이블이 생기기 전까지 이 테이블을 만들 수조차 없었다.

## 시세를 저장하지 않는다

`price` · `change_percent` · `spark` · `name` 은 컬럼에 없다. 전부 yfinance/KRX 가
주는 값이라 저장하면 그 순간부터 낡기 시작하고, 화면은 항상 최신을 원한다.
저장하는 것은 **사용자가 직접 정한 것**뿐이다: 무엇을 담았는지, 어느 그룹인지,
어떤 순서인지, 얼마에 몇 주 샀는지, 어떤 알림을 걸었는지.
"""

from sqlalchemy import Boolean, Float, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class WatchlistItem(TimestampMixin, Base):
    """한 소유자가 담은 종목 한 건."""

    __tablename__ = "watchlist_items"
    __table_args__ = (
        # 같은 사람이 같은 종목을 두 번 담을 수 없다. 애플리케이션에서만 막으면
        # 더블클릭·재시도로 중복 행이 생기고, 그 뒤 순서·그룹 변경이 어느 행에
        # 적용됐는지 알 수 없게 된다.
        UniqueConstraint("owner_key", "symbol", name="uq_watchlist_owner_symbol"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    # 익명 브라우저 ID 또는 로그인 사용자 ID. 형식은 접두사로 구분한다 (anon: · user:).
    owner_key: Mapped[str] = mapped_column(String(80), index=True)

    # yfinance 심볼 (`005930.KS`). 6자리 코드가 아니라 이쪽을 저장하는 이유는
    # 코드만으로는 접미사를 알 수 없어 시세 조회가 `.KS`/`.KQ` 를 둘 다 시도하게
    # 되고, 야후가 틀린 접미사에도 **다른 종목의 시세**를 주기 때문이다.
    symbol: Mapped[str] = mapped_column(String(20), index=True)

    group_name: Mapped[str] = mapped_column(String(40), default="관찰")

    # 사용자가 직접 끌어 정한 순서. 값 자체에는 의미가 없고 대소 관계만 쓴다 —
    # 중간 삽입 때 뒤를 전부 밀지 않으려고 간격을 띄워 발급한다 (repository 주석).
    position: Mapped[int] = mapped_column(Integer, default=0, index=True)

    # 보유 정보. 둘 다 있거나 둘 다 없다 — 수량만 알고 평단을 모르면 평가손익을
    # 낼 수 없어 화면에 쓸 데가 없다.
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_price: Mapped[float | None] = mapped_column(Float, nullable=True)

    alert_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # "75,000원 도달 시" — 지금은 자유 텍스트다. 조건을 구조화(연산자·임계값)하는 것은
    # 알림을 **실제로 발송**할 때 필요하고, 발송 경로가 없는 지금은 이르다.
    alert_condition: Mapped[str] = mapped_column(String(120), default="")

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<WatchlistItem {self.owner_key} {self.symbol}>"
