"""listed_companies 에 next_earnings_date · ex_dividend_date · calendar_updated_at 추가

'오늘의 일정'(실적발표·배당락)이 쓰는 컬럼이다. 값은 하루 1회 배치가 채우고, 아직
안 채웠거나 공급자에 없는 종목은 NULL 로 남는다.

## 이 마이그레이션이 반드시 모델과 같은 커밋에 있어야 하는 이유

모델에만 컬럼이 생기면 `listed_companies` **전체 SELECT** 가 `UndefinedColumn` 으로
실패한다. 그 테이블은 검색·홈·종목 탐색·종목 상세가 전부 읽으므로 화면 넷이 동시에
깨진다. 3회차가 이 작업을 범위에서 뺀 이유가 그것이었다.

## 인덱스를 셋 다 거는 이유

`next_earnings_date`·`ex_dividend_date` 는 "오늘부터 N일" 범위 조회가 유일한 용도다.
`calendar_updated_at` 은 배치가 "가장 오래 안 물어본 종목부터" 고를 때 정렬 키로 쓴다 —
전 종목(2,700+)을 매번 정렬시킬 이유가 없다.

Revision ID: f2c9b47ad831
Revises: d5e8a1c60f47
Create Date: 2026-08-07

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "f2c9b47ad831"
down_revision: Union[str, Sequence[str], None] = "d5e8a1c60f47"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "listed_companies"


def upgrade() -> None:
    op.add_column(_TABLE, sa.Column("next_earnings_date", sa.Date(), nullable=True))
    op.add_column(_TABLE, sa.Column("ex_dividend_date", sa.Date(), nullable=True))
    op.add_column(
        _TABLE, sa.Column("calendar_updated_at", sa.DateTime(timezone=True), nullable=True)
    )

    op.create_index(
        op.f("ix_listed_companies_next_earnings_date"), _TABLE, ["next_earnings_date"]
    )
    op.create_index(op.f("ix_listed_companies_ex_dividend_date"), _TABLE, ["ex_dividend_date"])
    op.create_index(
        op.f("ix_listed_companies_calendar_updated_at"), _TABLE, ["calendar_updated_at"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_listed_companies_calendar_updated_at"), table_name=_TABLE)
    op.drop_index(op.f("ix_listed_companies_ex_dividend_date"), table_name=_TABLE)
    op.drop_index(op.f("ix_listed_companies_next_earnings_date"), table_name=_TABLE)
    op.drop_column(_TABLE, "calendar_updated_at")
    op.drop_column(_TABLE, "ex_dividend_date")
    op.drop_column(_TABLE, "next_earnings_date")
