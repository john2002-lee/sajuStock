"""batch_runs 생성 — 배치 실행 기록

조용히 틀리는 경로마다 로그를 심어 왔지만(0건 경보 · 응답률 가드 · 레이트리밋 분류 ·
30분 백오프) **그 신호가 도착하는 곳이 `logger.error` 하나뿐이었다.** 수집기도 알림도
없어서, 백오프와 상한을 조정해도 효과를 확인할 방법이 서버 콘솔을 사람이 보는 것밖에
없었다. 이 표가 그 도착지다 — 관리자 화면이 "마지막 실패가 언제, 왜였는지" 를 읽는다.

## 인덱스를 거는 판단

16회차는 걸고 17회차는 안 걸었다. 그 기준("조회 형태가 하나로 고정인가")으로 보면
여기는 **거는 쪽**이다. 조회가 정확히 두 가지로 고정돼 있고(이 배치의 최근 것 / 이
배치의 최근 실패) 둘 다 `name` 으로 좁힌 뒤 `finished_at` 으로 정렬한다. 그래서 단일
컬럼 둘이 아니라 복합 하나로 둔다.

행 수도 근거다. 배치는 하루 몇 번이라 이 표는 1년에 수천 행 규모다 — 쓰기 비용이
사실상 없고, 대신 `/admin/ops` 가 매번 두 번 질의한다.

Revision ID: e1f4c8b95d27
Revises: c9b3e7d21a08
Create Date: 2026-08-11

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "e1f4c8b95d27"
down_revision: Union[str, Sequence[str], None] = "c9b3e7d21a08"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "batch_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column(
            "finished_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        # 응답률 가드로 버려진 실행은 예외가 없어도 ok=False 다 — 아무것도 쓰지
        # 못했으면 성공이 아니다 (`models/batch_run.py` 주석).
        sa.Column("ok", sa.Boolean(), nullable=False),
        sa.Column("attempted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("answered", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("applied", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_batch_runs_name_finished_at", "batch_runs", ["name", "finished_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_batch_runs_name_finished_at", table_name="batch_runs")
    op.drop_table("batch_runs")
