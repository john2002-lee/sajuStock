"""investor_profiles 신설 — 2축 판단의 사람 쪽 입력

## 소유자를 또 `owner_key` 로 둔다

`users` 테이블이 이제 있는데도(`b3f1c2d47a90`) 외래키를 걸지 않았다. 온보딩이
로그인보다 앞설 수 있어야 하기 때문이다 — 생년월일시를 넣어 프로파일 카드를 본
다음에 가입하는 흐름이 자연스럽고, 외래키를 걸면 그 순서가 불가능해진다.
익명으로 만든 프로파일은 `/profile/claim` 이 계정으로 옮긴다.

## `owner_key` 유니크

한 사람의 투자 성향은 하나다. 여러 행을 허용하면 "어느 것이 지금 성향인가"를
조회하는 곳마다 정해야 하고 그 규칙이 서로 어긋난다. PUT 은 이 제약 위에서
upsert 로 동작한다 — 재시도가 중복 행을 만들지 않는다.

## 손으로 썼다

`82a8617b8f1f` 과 같은 이유다. 개발 DB 는 `db_create_all_on_startup=True` 로
`create_all` 이 이미 테이블을 만들어 두기 때문에 autogenerate 가 빈 upgrade() 를
낸다. 그대로 두면 마이그레이션만 따라가는 배포 환경에서 테이블이 생기지 않는다.

Revision ID: c7a4e19d3b62
Revises: b3f1c2d47a90
Create Date: 2026-08-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c7a4e19d3b62"
down_revision: Union[str, Sequence[str], None] = "b3f1c2d47a90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "investor_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_key", sa.String(length=80), nullable=False),
        # 6개 축 — 전부 0~100 정규화. 범위 검증은 Pydantic 계층이 한다.
        sa.Column("risk_appetite", sa.Integer(), nullable=False),
        sa.Column("patience", sa.Integer(), nullable=False),
        sa.Column("decisiveness", sa.Integer(), nullable=False),
        sa.Column("loss_aversion", sa.Integer(), nullable=False),
        sa.Column("herd_tendency", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        # 프로파일 화면 표시 전용. 판단 컨텍스트에 들어가지 않는다 (계획 5.7).
        sa.Column("saju_summary", sa.Text(), nullable=True),
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
    )
    op.create_index(
        op.f("ix_investor_profiles_owner_key"),
        "investor_profiles",
        ["owner_key"],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_investor_profiles_owner_key"), table_name="investor_profiles")
    op.drop_table("investor_profiles")
