"""디지털 부적의 주문과 원본 ORM 모델.

## 주문에는 개인정보가 없다

사주 주문(`saju_orders`)은 생년월일시를 들고 있어 7일 뒤 지운다. 부적 주문에는
**무엇을 언제 샀는지**만 있다 — 이름·연락처·생일 어느 것도 받지 않는다. 그래서
파기 배치에 넣지 않는다. 다운로드 조건(결제 후 7일 안에 한 번)은 행을 지워서가
아니라 **다운로드 경로가 강제한다**(`talisman_order_service.download`).

## 원본은 왜 DB 에 있나

이 저장소는 공개다. 원본을 `public/` 은 물론 저장소 어디에 두어도 결제 없이 받을 수
있게 된다. 그래서 원본 바이트는 `talisman_assets` 에 있고, 결제가 확인된 토큰으로만
나간다. 올리는 일은 `scripts.upload_talisman_assets` 가 한다.
"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class TalismanOrderRow(TimestampMixin, Base):
    __tablename__ = "talisman_orders"

    #: 애플리케이션이 만든다 — 접근 토큰이 id 에서 파생된다(`SajuOrderRow.id` 와 같다).
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    talisman_id: Mapped[str] = mapped_column(String(32))

    amount: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(8), default="KRW")

    #: pending → paid | needs_attention. `needs_attention` 은 자동 환불하지 않는다는
    #: 뜻이다 — 사람이 토스 대시보드에서 대조한다(`SajuOrderRow.status` 와 같은 규칙).
    status: Mapped[str] = mapped_column(String(24), default="pending", index=True)
    attention_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True)
    payment_key: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    #: 평문 토큰은 저장하지 않는다. 조회 색인으로만 쓰는 해시다.
    access_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    #: 다운로드 기간의 기준 시각. `updated_at` 으로 대신하지 않는다 — 사람이 상태를
    #: 손보면 그 값이 움직여 기간이 늘어난다.
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    #: 원본을 내려받은 시각. **일회 다운로드**라 이 값이 차면 다시 나가지 않는다.
    #: 다운로드 도중 끊겨 못 받은 고객은 사람이 확인한 뒤 이 칸을 비워 준다
    #: (환불정책 "결제는 됐으나 원본을 받지 못한 경우").
    downloaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<TalismanOrderRow {self.id} {self.talisman_id} {self.status}>"


class TalismanAssetRow(TimestampMixin, Base):
    """부적 원본 한 장. 부적마다 한 행이고, 다시 올리면 덮어쓴다."""

    __tablename__ = "talisman_assets"

    talisman_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    content: Mapped[bytes] = mapped_column(LargeBinary)
    media_type: Mapped[str] = mapped_column(String(64))
    #: 내려받을 때의 파일 이름. ASCII 만 — 헤더에 그대로 실린다.
    filename: Mapped[str] = mapped_column(String(128))
    #: 올린 파일이 맞는지 확인하는 값. 업로드 스크립트가 출력하고, E2E 가 대조한다.
    sha256: Mapped[str] = mapped_column(String(64))
