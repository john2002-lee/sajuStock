"""users.role 추가 + admin_audit_log 생성

관리자 화면(회원 관리 · 운영 현황)의 스키마다. 성격이 다른 둘을 한 마이그레이션에
둔 것은 **떨어지면 위험해서**다. `role` 만 있고 감사 로그가 없으면 권한이 바뀌어도
기록이 남지 않는 창이 생기고, 그 창에서 일어난 변경은 영원히 추적할 수 없다.

## `users` 는 남의 테이블인데 왜 컬럼을 더하나

`users` 는 `alembic/env.py` 의 `_FOREIGN_TABLES` 에 있다 — 자동 생성이 그 테이블을
drop 하자고 제안하는 것을 막기 위해서다. **그 목록은 "손대지 마라" 가 아니라
"autogenerate 가 판단하지 마라" 는 뜻이다.** 스키마를 만든 것도 우리(b3f1c2d47a90)이고,
`role` 은 NextAuth 계약에 없는 **우리 컬럼**이다.

부작용도 없다. `@auth/pg-adapter` 는 `select * from users` 로 읽으므로(실측) 새 컬럼이
그대로 세션에 실려 오고, 어댑터가 쓰는 INSERT/UPDATE 는 컬럼을 명시하므로 기본값이
적용된다. 이 컬럼이 autogenerate diff 에 안 잡히는 것도 그대로다.

## 기본값을 서버 기본값으로 두는 이유

`server_default="user"` 가 없으면 어댑터가 새 사용자를 만들 때 `role` 을 명시하지
않아 NOT NULL 위반으로 **회원가입이 통째로 막힌다.** 애플리케이션 기본값은 여기에
닿지 않는다 — 그 INSERT 를 우리 코드가 하지 않기 때문이다.

## 왜 열거 타입이 아닌가

`role` 을 Postgres ENUM 으로 두면 값을 하나 더할 때마다 마이그레이션이 필요하고,
그때 `ALTER TYPE ... ADD VALUE` 는 트랜잭션 안에서 못 돈다. 지금 필요한 값은 둘이고
검증은 애플리케이션(`services/admin_service.ROLES`)이 한다.

Revision ID: c9b3e7d21a08
Revises: a4d72f9e51c3
Create Date: 2026-08-10

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "c9b3e7d21a08"
down_revision: Union[str, Sequence[str], None] = "a4d72f9e51c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("role", sa.String(20), nullable=False, server_default="user"),
    )

    op.create_table(
        "admin_audit_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("actor_user_id", sa.String(64), nullable=False),
        sa.Column("actor_email", sa.String(320), nullable=True),
        sa.Column("action", sa.String(40), nullable=False),
        # 외래키를 걸지 않는다. 계정 삭제가 이 로그가 기록하는 행위 중 하나라,
        # 외래키가 있으면 그 기록이 대상과 함께 사라지거나 삭제가 막힌다
        # (`models/admin_audit.py` 주석).
        sa.Column("target_user_id", sa.String(64), nullable=True),
        sa.Column("target_email", sa.String(320), nullable=True),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("ok", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_admin_audit_log_created_at"), "admin_audit_log", ["created_at"]
    )
    op.create_index(op.f("ix_admin_audit_log_action"), "admin_audit_log", ["action"])


def downgrade() -> None:
    op.drop_index(op.f("ix_admin_audit_log_action"), table_name="admin_audit_log")
    op.drop_index(op.f("ix_admin_audit_log_created_at"), table_name="admin_audit_log")
    op.drop_table("admin_audit_log")
    op.drop_column("users", "role")
