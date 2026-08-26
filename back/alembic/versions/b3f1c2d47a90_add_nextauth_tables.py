"""NextAuth(Auth.js) 인증 테이블 — users · accounts · sessions · verification_token

## 왜 우리 마이그레이션에 남의 스키마가 있나

이 네 테이블은 **우리 모델이 아니다.** NextAuth 의 계약이고 프런트의
`@auth/pg-adapter` 가 읽고 쓴다. 그래도 여기서 만드는 이유는 **DB 가 하나**이기
때문이다 — 같은 Supabase 를 두 도구가 각자 만들면 "누가 무엇을 만들었는지" 를
아무도 모르게 되고, 스키마를 되돌릴 방법도 사라진다.

대신 `alembic/env.py` 의 `_include_object` 가 이 테이블들을 **자동 생성 대상에서
뺀다.** 그러지 않으면 다음 `--autogenerate` 가 "메타데이터에 없는 테이블" 이라며
`drop_table` 을 제안하고, 그대로 실행하면 사용자·세션이 통째로 사라진다.

## 스키마 출처

`@auth/pg-adapter` 가 실제로 실행하는 쿼리에서 뽑았다 (index.js 의 SQL 문자열).
따옴표 붙은 컬럼(`"emailVerified"` · `"sessionToken"` · `"userId"` ·
`"providerAccountId"`)은 **대소문자를 보존해야 한다** — Postgres 는 따옴표 없는
식별자를 소문자로 접기 때문에, 어댑터가 보내는 카멜케이스와 어긋나면 조회가 조용히
빈손이 된다.

`users.id` 가 uuid 인 것도 어댑터 규약이다. `watchlist_items.owner_key` 는 이 값을
`user:<uuid>` 형태로 담는다 (9회차 설계).

Revision ID: b3f1c2d47a90
Revises: 82a8617b8f1f
Create Date: 2026-08-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b3f1c2d47a90"
down_revision: Union[str, Sequence[str], None] = "82a8617b8f1f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # pgcrypto 는 Supabase 에 이미 있다(10회차 실측). gen_random_uuid() 가 여기서 온다.
    op.execute("create extension if not exists pgcrypto")

    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("email", sa.Text(), nullable=True),
        # 카멜케이스 유지 — 어댑터가 따옴표로 감싸 보낸다.
        sa.Column("emailVerified", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("image", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        # 같은 이메일로 구글과 매직링크를 둘 다 쓰면 **한 계정**이어야 한다.
        # 없으면 로그인 방법마다 다른 사용자가 생겨 관심종목이 갈라진다.
        sa.UniqueConstraint("email", name="users_email_key"),
    )

    op.create_table(
        "accounts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("userId", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("providerAccountId", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.BigInteger(), nullable=True),
        sa.Column("id_token", sa.Text(), nullable=True),
        sa.Column("scope", sa.Text(), nullable=True),
        sa.Column("session_state", sa.Text(), nullable=True),
        sa.Column("token_type", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        # 사용자를 지우면 연결된 OAuth 계정도 함께 사라져야 한다.
        sa.ForeignKeyConstraint(["userId"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "provider", "providerAccountId", name="accounts_provider_account_key"
        ),
    )
    op.create_index("accounts_user_id_idx", "accounts", ["userId"])

    op.create_table(
        "sessions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("userId", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expires", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("sessionToken", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["userId"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("sessionToken", name="sessions_session_token_key"),
    )
    op.create_index("sessions_user_id_idx", "sessions", ["userId"])

    op.create_table(
        "verification_token",
        # 매직링크가 쓰는 테이블. 토큰 자체가 열쇠라 유니크여야 하고, 어댑터가
        # 사용 즉시 삭제한다(1회용). 만료는 `expires` 로 검사한다.
        sa.Column("identifier", sa.Text(), nullable=False),
        sa.Column("expires", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("token", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("identifier", "token"),
        sa.UniqueConstraint("token", name="verification_token_token_key"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("verification_token")
    op.drop_index("sessions_user_id_idx", table_name="sessions")
    op.drop_table("sessions")
    op.drop_index("accounts_user_id_idx", table_name="accounts")
    op.drop_table("accounts")
    op.drop_table("users")
