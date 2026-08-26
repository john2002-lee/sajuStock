"""사주 추가 질문 저장 — 결제한 주문의 질문 3개를 서버가 지킨다

Revision ID: c5e81a37f2b9
Revises: a7f3d92c4e18
Create Date: 2026-08-25

## 왜 이 표가 생겼나

추가 질문의 남은 개수를 클라이언트가 세고 있었다. 근거는 "이 저장소에는 주문도
결제도 없다" 였는데 결제가 붙으면서 그 근거가 사라졌다. 지금 상태의 문제는 둘:

  · 새로고침하면 대화가 사라진다 — 돈을 낸 사람이 방금 받은 답을 잃는다.
  · 카운터가 브라우저에 있으니 새로고침만으로 질문 3개가 다시 생긴다.

## 상태값이 슬롯 소모를 가른다

  pending  — 예약됨. 이 행이 자리를 잡고 있어 동시 요청이 같은 슬롯을 못 가져간다.
  answered — 답했다. 소모한다.
  refused  — 모델이 이 질문을 거절했다. **소모한다** (그러지 않으면 거절되는 질문
             하나로 생성을 무한히 돌릴 수 있다).
  failed   — 우리 쪽 인프라 실패. **소모하지 않는다** (고객 잘못이 아니다).

## `ON DELETE CASCADE`

보관 기간이 지나 주문을 지울 때 질문 텍스트만 남으면 "지웠다" 는 약속이 깨진다.
질문은 이 제품이 저장하는 **유일한 자유 입력 텍스트**라 특히 그렇다.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c5e81a37f2b9"
down_revision: str | None = "a7f3d92c4e18"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "saju_follow_ups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.String(length=40), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("source", sa.String(length=16), nullable=False, server_default="llm"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["order_id"], ["saju_orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # 슬롯을 셀 때 쓰는 색인. 질문마다 "이 주문이 몇 개 썼나" 를 묻게 되므로
    # 주문별 조회가 이 표의 지배적인 접근 패턴이다.
    op.create_index("ix_saju_follow_ups_order_id", "saju_follow_ups", ["order_id"])
    op.create_index("ix_saju_follow_ups_status", "saju_follow_ups", ["status"])


def downgrade() -> None:
    op.drop_index("ix_saju_follow_ups_status", table_name="saju_follow_ups")
    op.drop_index("ix_saju_follow_ups_order_id", table_name="saju_follow_ups")
    op.drop_table("saju_follow_ups")
