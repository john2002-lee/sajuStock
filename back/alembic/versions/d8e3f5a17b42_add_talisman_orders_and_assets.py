"""add talisman orders and assets

디지털 부적 판매의 주문과 원본 테이블. 주문에는 개인정보가 없고, 원본은 이 저장소가
공개라서 DB 에 둔다(`app/models/talisman.py` 모듈 주석).

Revision ID: d8e3f5a17b42
Revises: c6a2e58b13df
Create Date: 2026-10-19

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d8e3f5a17b42"
down_revision: Union[str, Sequence[str], None] = "c6a2e58b13df"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "talisman_orders",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("talisman_id", sa.String(length=32), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="KRW"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column("attention_reason", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=64), nullable=False),
        sa.Column("payment_key", sa.String(length=200), nullable=True),
        sa.Column("access_token_hash", sa.String(length=64), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("downloaded_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
        sa.UniqueConstraint("payment_key"),
        sa.UniqueConstraint("access_token_hash"),
    )
    op.create_index("ix_talisman_orders_status", "talisman_orders", ["status"])
    op.create_index(
        "ix_talisman_orders_access_token_hash", "talisman_orders", ["access_token_hash"]
    )

    op.create_table(
        "talisman_assets",
        sa.Column("talisman_id", sa.String(length=32), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("media_type", sa.String(length=64), nullable=False),
        sa.Column("filename", sa.String(length=128), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("talisman_id"),
    )


def downgrade() -> None:
    op.drop_table("talisman_assets")
    op.drop_index("ix_talisman_orders_access_token_hash", table_name="talisman_orders")
    op.drop_index("ix_talisman_orders_status", table_name="talisman_orders")
    op.drop_table("talisman_orders")
