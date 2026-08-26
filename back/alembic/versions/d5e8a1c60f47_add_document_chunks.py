"""document_chunks (pgvector) 를 alembic 관리로 편입

## 왜 조건부인가

이 테이블은 마이그레이션보다 **먼저 존재했다.** `repositories/document_chunk.
ensure_schema()` 가 원시 SQL 로 만들어 왔고, 운영 DB 에는 이미 문서가 적재돼 있다.
그대로 `create_table` 을 부르면 그 DB 에서 `DuplicateTable` 로 멈춘다.

그렇다고 `ensure_schema()` 에만 계속 맡기면 스키마 출처가 둘로 남아, alembic 은 이
테이블의 차원·인덱스 변화를 **영원히 검증하지 못한다.**

그래서 이 리비전은 "있으면 인정하고 넘어가고, 없으면 만든다". 실행 뒤에는 어느
쪽이든 alembic 이 아는 상태가 되고, 이후 변경은 정상적인 마이그레이션으로 간다.

확장(`vector`·`pg_trgm`)은 조건 밖에서 항상 보장한다 — 테이블이 있어도 확장이 빠진
복제본이 있을 수 있고, `create extension if not exists` 는 그 자체로 멱등이다.

Revision ID: d5e8a1c60f47
Revises: c7a4e19d3b62
Create Date: 2026-08-07

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

from alembic import op
from app.core.config import settings

revision: str = "d5e8a1c60f47"
down_revision: Union[str, Sequence[str], None] = "c7a4e19d3b62"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "document_chunks"


def upgrade() -> None:
    # pgvector 가 없으면 `vector(N)` 타입 자체가 만들어지지 않는다. pg_trgm 은
    # 키워드 검색의 `<%` 연산자와 gin_trgm_ops 인덱스가 쓴다.
    op.execute("create extension if not exists vector")
    op.execute("create extension if not exists pg_trgm")

    inspector = sa.inspect(op.get_bind())
    if _TABLE in inspector.get_table_names():
        # 이미 `ensure_schema()` 가 만들어 둔 DB. 여기서 끝내면 이 리비전은
        # "이 테이블은 이제 alembic 소관" 이라는 표시로만 남는다.
        return

    op.create_table(
        _TABLE,
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("symbol", sa.Text(), nullable=False),
        sa.Column("doc_type", sa.Text(), nullable=False),
        sa.Column("doc_key", sa.Text(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("title", sa.Text(), server_default="", nullable=False),
        sa.Column("publisher", sa.Text(), server_default="", nullable=False),
        sa.Column("url", sa.Text(), server_default="", nullable=False),
        sa.Column("published_at", sa.Date(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        # 차원은 EMBEDDING_DIMENSIONS 를 따른다. 적재 뒤에 바꾸면 색인을 다시
        # 만들어야 하므로, 이후 변경은 별도 리비전으로 남는 편이 낫다.
        sa.Column("embedding", Vector(settings.embedding_dimensions), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "doc_key", "chunk_index", name="document_chunks_doc_key_chunk_index_key"
        ),
    )
    op.create_index(
        "document_chunks_symbol_idx", _TABLE, ["symbol", sa.text("published_at DESC")]
    )
    op.create_index(
        "document_chunks_content_trgm_idx",
        _TABLE,
        ["content"],
        postgresql_using="gin",
        postgresql_ops={"content": "gin_trgm_ops"},
    )
    # 문서가 없어도 미리 만든다 — 적재 후에 만들면 테이블 전체를 훑어 잠긴다.
    op.create_index(
        "document_chunks_embedding_idx",
        _TABLE,
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def downgrade() -> None:
    # 확장은 지우지 않는다. 다른 테이블이 쓰고 있을 수 있고, 되돌리기가 남의 기능을
    # 깨뜨리면 안 된다.
    op.drop_table(_TABLE)
