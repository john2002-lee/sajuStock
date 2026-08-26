"""watchlist_items 신설 — 사용자가 소유하는 첫 테이블

지금까지의 테이블(`listed_companies` · `document_chunks`)은 전부 우리가 외부에서
수집해 온 것이라 "누구 것인가"라는 질문이 없었다. 이 테이블부터 소유자가 생긴다.

소유자는 외래키가 아니라 **불투명한 문자열**(`owner_key`)이다. 로그인이 아직 없어
`users` 테이블 자체가 없고, 외래키를 걸었다면 이 테이블을 만들 수조차 없었다.
로그인이 붙는 날에는 `anon:…` 을 `user:…` 로 바꾸는 UPDATE 한 번이면 익명으로
모아 둔 관심종목이 그대로 승계된다.

**이 파일은 autogenerate 결과가 아니라 손으로 썼다.** 자동 생성은 빈 upgrade()를
냈는데, 개발 DB에 `create_all`(`db_create_all_on_startup=True`)이 이미 같은 테이블을
만들어 둬서 모델과 DB 사이에 차이가 없었기 때문이다. 그대로 뒀다면 마이그레이션만
따라가는 배포 환경에서 테이블이 아예 생기지 않는다 — 로컬에서는 멀쩡하고 배포에서만
깨지는 종류다.

Revision ID: 82a8617b8f1f
Revises: 61b513b1f58a
Create Date: 2026-08-05 14:32:06.329877

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "82a8617b8f1f"
down_revision: Union[str, Sequence[str], None] = "61b513b1f58a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "watchlist_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_key", sa.String(length=80), nullable=False),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("group_name", sa.String(length=40), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.Column("avg_price", sa.Float(), nullable=True),
        sa.Column("alert_enabled", sa.Boolean(), nullable=False),
        sa.Column("alert_condition", sa.String(length=120), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        # 같은 사람이 같은 종목을 두 번 담을 수 없다. 애플리케이션에서만 막으면
        # 더블클릭·재시도로 중복 행이 생기고, 그 뒤 순서·그룹 변경이 어느 행에
        # 적용됐는지 알 수 없게 된다.
        sa.UniqueConstraint("owner_key", "symbol", name="uq_watchlist_owner_symbol"),
    )
    # 모든 조회가 owner_key 로 시작한다 — 소유자별 목록이 이 화면의 전부다.
    op.create_index(
        op.f("ix_watchlist_items_owner_key"), "watchlist_items", ["owner_key"]
    )
    op.create_index(op.f("ix_watchlist_items_symbol"), "watchlist_items", ["symbol"])
    op.create_index(op.f("ix_watchlist_items_position"), "watchlist_items", ["position"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_watchlist_items_position"), table_name="watchlist_items")
    op.drop_index(op.f("ix_watchlist_items_symbol"), table_name="watchlist_items")
    op.drop_index(op.f("ix_watchlist_items_owner_key"), table_name="watchlist_items")
    op.drop_table("watchlist_items")
