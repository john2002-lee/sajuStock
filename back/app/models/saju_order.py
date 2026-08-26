"""사주 유료 리포트의 주문과 결과 ORM 모델.

## 왜 저장하는가 — 이 저장소의 다른 사주 경로는 저장하지 않는다

`POST /saju/chart` 는 아무것도 쓰지 않는다. 계산이 순수 함수라 다시 부르면 그만이고,
저장하지 않는 편이 생년월일시를 다루는 가장 안전한 방식이기 때문이다.

**돈을 받는 순간 그 논리가 뒤집힌다.** 결제한 사람은 나중에 다시 볼 수 있어야 하고,
"결제됐는가" 는 우리 서버가 기억해야 하는 사실이다. 브라우저 저장소에 두면
새로고침 한 번에 산 것이 사라진다.

그래서 **결제 경로만** 저장한다. 무료 경로는 그대로 아무것도 남기지 않는다.

## 보관 기간

`created_at` 으로부터 30일. 지우는 일은 별도 정리 작업이 하며, 이 모듈은 언제
지워도 되는지를 판단할 수 있게 시각만 남긴다. 원본 SajuService 의 보관 정책과 같다.
"""

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class SajuOrderRow(TimestampMixin, Base):
    """유료 리포트 주문 한 건.

    이름 끝의 `Row` 는 이 저장소의 규약이다(`InvestorProfileRow` 주석) — 같은
    개념의 Pydantic 스키마와 이름이 겹치면 ORM 객체가 순수 함수로 새어 든다.
    """

    __tablename__ = "saju_orders"

    #: 애플리케이션이 만든다(DB 기본값이 아니라). 접근 토큰이 id 에서 파생되므로
    #: **행을 쓰기 전에** id 를 알아야 하고, 같은 INSERT 안에 그 해시를 넣어야 한다.
    id: Mapped[str] = mapped_column(String(40), primary_key=True)

    #: 생년월일시 원본. 리포트를 다시 만들려면 필요하다.
    #: **결제 경로에만 존재한다** — 무료 경로는 이 값을 어디에도 남기지 않는다.
    birth: Mapped[dict] = mapped_column(JSONB)
    #: 결제 전에 보여 준 무료 요약. 결제 화면으로 돌아왔을 때 다시 계산하지 않으려고 둔다.
    teaser: Mapped[dict] = mapped_column(JSONB)

    amount: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(8), default="KRW")

    #: pending → paid | needs_attention
    #:
    #: `needs_attention` 은 **자동 환불하지 않는다는 뜻**이다. 결제의 실제 상태를
    #: 알 수 없을 때(네트워크 오류·타임아웃·5xx·이미 처리됨) 여기로 보내고 사람이
    #: 토스 대시보드에서 대조한다. 모르는 것을 실패로 단정하면, 실제로는 결제된
    #: 고객이 아무것도 못 받는다.
    status: Mapped[str] = mapped_column(String(24), default="pending", index=True)
    attention_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    #: 토스 confirm 재시도를 안전하게 만드는 키. 주문에서 파생돼 재시도해도 같다.
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True)
    payment_key: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)

    #: **평문 토큰은 저장하지 않는다.** 조회 색인으로만 쓰는 해시다.
    #: 평문은 언제든 `derive_access_token(order_id)` 로 다시 만들 수 있으므로
    #: 해시만 두어도 잃는 것이 없다.
    access_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    report: Mapped["SajuReportRow | None"] = relationship(
        back_populates="order", uselist=False, cascade="all, delete-orphan"
    )
    #: 추가 질문들. `cascade` 로 주문과 함께 지워진다 — 보관 기간이 지나 주문을
    #: 지울 때 질문 텍스트만 남으면 "지웠다" 는 약속이 깨진다.
    follow_ups: Mapped[list["SajuFollowUpRow"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="SajuFollowUpRow.id"
    )

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<SajuOrderRow {self.id} {self.status}>"


class SajuFollowUpRow(TimestampMixin, Base):
    """추가 질문 한 건. **결제한 주문에만 달린다.**

    ## 왜 저장하나 — 원본이 맞았다

    합칠 때 추가 질문의 남은 개수를 클라이언트가 세게 두었다. 그 판단의 근거는
    "이 저장소에는 주문도 결제도 없으므로 지킬 권리가 없다" 였는데, **결제가 붙은
    지금 그 근거가 사라졌다.** 돈을 낸 사람의 질문 3개는 권리이고, 권리는 서버가
    지켜야 한다:

      · 새로고침하면 대화가 사라졌다. 돈을 낸 사람이 방금 받은 답을 잃는다.
      · 카운터가 브라우저에 있으니 새로고침만으로 3개가 다시 생겼다.

    ## 무엇이 슬롯을 소모하는가 — 이 구분이 이 표의 핵심이다

    ``status`` 가 그 답이다.

      · ``answered`` — 모델이 답했다. **소모한다.**
      · ``refused``  — 모델이 이 질문에 답하기를 거절했다(정책·내용). 역시
        **소모한다.** 그러지 않으면 거절되는 질문 하나로 무한히 생성을 돌릴 수 있다.
      · ``failed``   — **우리 쪽** 인프라가 실패했다(타임아웃·5xx·연결). 고객의 잘못이
        아니므로 **소모하지 않는다.**

    이 셋을 뭉개면 어느 쪽으로든 틀린다. 전부 소모로 치면 우리 장애로 고객이 산 것을
    잃고, 전부 환불로 치면 거절 질문으로 비용을 무한히 태울 수 있다.

    ``pending`` 은 예약만 된 상태다 — 답이 오는 동안 이 행이 자리를 잡고 있어서,
    동시에 들어온 요청이 같은 슬롯을 가져가지 못한다.

    ## 왜 리포트처럼 JSONB 한 덩어리가 아닌가

    대화는 순서가 있고 하나씩 늘어난다. 한 컬럼에 배열로 넣으면 매번 전체를 읽고
    다시 써야 하고, 두 요청이 동시에 오면 **하나가 조용히 사라진다**(마지막 쓰기가
    이긴다). 행으로 두면 그 경합이 애초에 없다.
    """

    __tablename__ = "saju_follow_ups"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[str] = mapped_column(
        ForeignKey("saju_orders.id", ondelete="CASCADE"), index=True
    )

    #: 실제로 모델에 전달된 질문. 프리셋이면 **서버가 가진 문장**이다 —
    #: 클라이언트가 보낸 것을 그대로 믿지 않는다(`domain/saju/followup.py`).
    question: Mapped[str] = mapped_column(Text)
    #: 답. `pending` 인 동안, 그리고 `failed` 로 끝나면 비어 있다.
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)

    #: pending → answered | refused | failed (위 "무엇이 슬롯을 소모하는가")
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    #: llm | fallback. 화면이 '간이 답변' 표시를 켜는 근거다.
    source: Mapped[str] = mapped_column(String(16), default="llm")

    order: Mapped[SajuOrderRow] = relationship(back_populates="follow_ups")

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<SajuFollowUpRow order={self.order_id} {self.status}>"


class SajuReportRow(TimestampMixin, Base):
    """생성된 리포트 본문. 주문당 하나."""

    __tablename__ = "saju_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[str] = mapped_column(
        ForeignKey("saju_orders.id", ondelete="CASCADE"), unique=True, index=True
    )

    markdown: Mapped[str] = mapped_column(Text)
    #: 화면이 계산 패널(4기둥·오행·대운)을 그리는 데 쓰는 값. 리포트를 열 때마다
    #: 엔진을 다시 돌리지 않으려고 함께 저장한다.
    chart: Mapped[dict] = mapped_column(JSONB)
    #: llm | fallback. 화면이 '간이 리포트' 안내를 켜는 근거다.
    source: Mapped[str] = mapped_column(String(16), default="llm")

    order: Mapped[SajuOrderRow] = relationship(back_populates="report")

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<SajuReportRow order={self.order_id} {self.source}>"
