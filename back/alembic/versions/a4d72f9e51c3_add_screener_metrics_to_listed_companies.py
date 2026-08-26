"""listed_companies 에 per · pbr · roe_pct · dividend_yield_pct · fundamentals_updated_at 추가

스크리너(조건 검색)가 거르는 지표다. 값은 '오늘의 일정'과 **같은 배치**가 채운다 —
종목당 `get_info()` 를 부르는 배치를 둘로 두면 야후가 요청을 거부한다는 것을 16회차에
데이터로 확인했다(2,703종목 요청 → 0종목 응답). 그래서 컬럼만 늘고 호출은 늘지 않는다.

## 모델과 같은 커밋에 있어야 하는 이유 (f2c9b47ad831 과 동일)

모델에만 컬럼이 생기면 `listed_companies` **전체 SELECT** 가 `UndefinedColumn` 으로
실패하고, 그 표를 읽는 검색·홈·종목 탐색·종목 상세가 동시에 깨진다.

## 인덱스를 걸지 않는 이유 — 앞 마이그레이션과 판단이 다르다

f2c9b47ad831 은 날짜 컬럼 셋에 전부 인덱스를 걸었다. 그쪽은 용도가 "오늘부터 N일"
범위 조회 하나로 고정이고 `calendar_updated_at` 은 배치 큐의 정렬 키라 매번 쓰인다.

여기는 다르다. 이 표는 2,747행이라 seq scan 이 이미 한 페이지 수준이고, 스크리너의
조건은 조합이 매번 달라(PER 만 · PER+PBR · 배당만) 단일 컬럼 인덱스로 덮이지 않는다.
게다가 배치가 하루 한 번 **전 행**을 갱신하므로 인덱스는 쓰이지 않으면서 쓰기 비용만
낸다. 행 수가 수십만으로 커지면 그때 실제 조건 분포를 보고 복합 인덱스를 건다.

Revision ID: a4d72f9e51c3
Revises: f2c9b47ad831
Create Date: 2026-08-10

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "a4d72f9e51c3"
down_revision: Union[str, Sequence[str], None] = "f2c9b47ad831"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "listed_companies"
_METRICS = ("per", "pbr", "roe_pct", "dividend_yield_pct")


def upgrade() -> None:
    for column in _METRICS:
        op.add_column(_TABLE, sa.Column(column, sa.Float(), nullable=True))
    op.add_column(
        _TABLE, sa.Column("fundamentals_updated_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column(_TABLE, "fundamentals_updated_at")
    for column in reversed(_METRICS):
        op.drop_column(_TABLE, column)
