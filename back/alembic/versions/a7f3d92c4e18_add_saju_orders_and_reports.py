"""add saju orders and reports

사주 유료 리포트의 주문·결과 테이블. 무료 경로(`/saju/chart`)는 여전히 아무것도
저장하지 않는다 — 이 두 테이블은 **결제한 주문에만** 쓰인다
(`app/models/saju_order.py` 모듈 주석).

Revision ID: a7f3d92c4e18
Revises: d41c9f0b8e75
Create Date: 2026-08-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a7f3d92c4e18"
down_revision: Union[str, Sequence[str], None] = "d41c9f0b8e75"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "saju_orders",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("birth", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("teaser", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="KRW"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column("attention_reason", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=64), nullable=False),
        sa.Column("payment_key", sa.String(length=200), nullable=True),
        sa.Column("access_token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
        sa.UniqueConstraint("payment_key"),
        sa.UniqueConstraint("access_token_hash"),
    )
    op.create_index("ix_saju_orders_status", "saju_orders", ["status"])
    op.create_index("ix_saju_orders_access_token_hash", "saju_orders", ["access_token_hash"])
    # 보관 기간(30일) 정리 작업이 이 순서로 훑는다.
    op.create_index("ix_saju_orders_created_at", "saju_orders", ["created_at"])

    op.create_table(
        "saju_reports",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.String(length=40), nullable=False),
        sa.Column("markdown", sa.Text(), nullable=False),
        sa.Column("chart", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False, server_default="llm"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["order_id"], ["saju_orders.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("order_id"),
    )
    op.create_index("ix_saju_reports_order_id", "saju_reports", ["order_id"])


def downgrade() -> None:
    op.drop_index("ix_saju_reports_order_id", table_name="saju_reports")
    op.drop_table("saju_reports")
    op.drop_index("ix_saju_orders_created_at", table_name="saju_orders")
    op.drop_index("ix_saju_orders_access_token_hash", table_name="saju_orders")
    op.drop_index("ix_saju_orders_status", table_name="saju_orders")
    op.drop_table("saju_orders")
