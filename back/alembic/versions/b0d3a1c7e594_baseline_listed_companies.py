"""baseline: listed_companies 생성

## 이 리비전이 없어서 신규 구축이 막혀 있었다

리비전 사슬의 뿌리(`61b513b1f58a`)가 `listed_companies` 에 **컬럼을 더하는 것으로
시작했다.** 그 테이블을 만드는 `create_table` 은 사슬 전체(리비전 9개)에 한 건도
없었다. 지금 테이블이 존재하는 유일한 이유는 `DB_CREATE_ALL_ON_STARTUP` 기본값이
True 라서 기동 때 `create_all()` 이 만들어 줬기 때문이다.

그래서 `back/README.md` 가 안내하는 대로 `DB_CREATE_ALL_ON_STARTUP=false` +
`alembic upgrade head` 로 새 Supabase 를 붙이면 **첫 리비전에서 `UndefinedTable` 로
멈췄다.** 신규 구축·복구·이관 경로가 전부 그 자리에서 막혀 있었다는 뜻이고,
테스트 하네스도 `create_all` 을 쓰므로 이 사슬을 한 번도 태우지 않아 초록이었다.

## 담는 것은 "`61b513b1f58a` 직전의 모양" 이다

지금 모델의 컬럼이 아니다. 뒤 리비전들이 더한 것을 여기 넣으면 그 리비전이 같은
컬럼을 다시 더하려다 실패한다. 그래서 여기에는 시가총액(`61b513b1f58a`) · 일정
3컬럼(`f2c9b47ad831`) · 지표 5컬럼(`a4d72f9e51c3`) 이 **없다.**

## 이미 적용된 DB 는 건드리지 않는다

`d5e8a1c60f47`(document_chunks)과 같은 자세다: 테이블이 이미 있으면 아무것도 하지
않고, 이 리비전은 "이 테이블은 이제 alembic 소관" 이라는 표시로만 남는다. 운영·개발
DB 는 이미 head 를 지나 있어 이 코드가 실행되지도 않지만, `stamp` 없이 되돌린 DB 나
`create_all` 로 만들어 둔 DB 에서도 안전해야 한다.

Revision ID: b0d3a1c7e594
Revises: (없음 — 새 뿌리)
Create Date: 2026-08-11

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "b0d3a1c7e594"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "listed_companies"


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if _TABLE in inspector.get_table_names():
        return

    op.create_table(
        _TABLE,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("symbol", sa.String(20), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("market", sa.String(40), nullable=True),
        # 정규화된 검색용 사본. 파이썬 기본값(`default=""`)이라 서버 기본값은 없다 —
        # 쓰는 쪽이 항상 값을 채운다(`upsert_many`).
        sa.Column("search_symbol", sa.String(20), nullable=False),
        sa.Column("search_name", sa.String(160), nullable=False),
        sa.Column("initial_consonants", sa.String(160), nullable=False),
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
        sa.PrimaryKeyConstraint("id"),
    )
    # `symbol` 은 unique 인덱스다. 별도 UniqueConstraint 가 아니라 인덱스인 것은
    # 모델이 `unique=True, index=True` 로 선언했기 때문이고, 그래야 `alembic check`
    # 가 drift 로 잡지 않는다.
    op.create_index(op.f("ix_listed_companies_symbol"), _TABLE, ["symbol"], unique=True)
    op.create_index(op.f("ix_listed_companies_search_symbol"), _TABLE, ["search_symbol"])
    op.create_index(op.f("ix_listed_companies_search_name"), _TABLE, ["search_name"])
    op.create_index(
        op.f("ix_listed_companies_initial_consonants"), _TABLE, ["initial_consonants"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_listed_companies_initial_consonants"), table_name=_TABLE)
    op.drop_index(op.f("ix_listed_companies_search_name"), table_name=_TABLE)
    op.drop_index(op.f("ix_listed_companies_search_symbol"), table_name=_TABLE)
    op.drop_index(op.f("ix_listed_companies_symbol"), table_name=_TABLE)
    op.drop_table(_TABLE)
