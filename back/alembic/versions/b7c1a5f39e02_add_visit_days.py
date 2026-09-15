"""visit_days 생성 — 관리자 접속 통계의 데이터

관리자 화면에 총·일일 접속자수와 회원별 접속수·최근 접속일시가 없었다. 지금 있는
`active_sessions` 는 NextAuth `sessions` 의 미만료 세션 수라 "지금 로그인 중" 에
가깝고, 누적·추이·마지막 방문을 알 방법이 없었다.

## 하루·방문자당 한 행

승인된 접속 정의가 **하루 1회**다. 스키마가 그 정의를 그대로 담으면 집계가 세지
않고 세어지고(일일 = `where visit_date = ?` 의 행 수), 용량이 `방문자 × 방문일` 로
예측된다. 모델 주석에 근거가 더 있다 (`app/models/visit_day.py`).

## `users` 에 외래키를 걸지 않는다

`admin_audit_log` 와 같은 판단이다. 사주 서비스는 회원가입을 받지 않으므로 `anon:`
키가 다수이고 대응하는 `users` 행이 아예 없다. 그리고 계정을 지웠다고 어제까지의
총접속자수가 줄어들면 그 숫자는 집계가 아니다.

## `visit_date` 는 KST 날짜다

DB 는 UTC 지만 "오늘 몇 명" 은 한국 자정 기준이어야 한다. 환산은 쓰는 시점에 한 번
한다(`domain/visits.korean_date`) — 조회 때마다 `at time zone` 을 붙이면 인덱스를
못 타고, 한 곳을 빠뜨리면 오류 없이 하루 밀린 숫자가 나온다.

Revision ID: b7c1a5f39e02
Revises: a1e6f38b72d4
Create Date: 2026-09-07

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "b7c1a5f39e02"
down_revision: Union[str, Sequence[str], None] = "a1e6f38b72d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "visit_days",
        sa.Column("id", sa.Integer(), nullable=False),
        # `watchlist_items.owner_key` 와 같은 길이·같은 규약 (anon: · user:).
        sa.Column("owner_key", sa.String(length=80), nullable=False),
        # KST 날짜. 위 주석의 이유로 timestamp 가 아니라 date 다.
        sa.Column("visit_date", sa.Date(), nullable=False),
        sa.Column(
            "first_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        # 서버 기본값을 함께 둔다 — 모델과 어긋나면 `alembic check` 가 drift 로
        # 잡고 그 소음이 진짜 drift 를 가린다 (`admin_audit_log.ok` 와 같은 이유).
        sa.Column("hits", sa.Integer(), server_default="1", nullable=False),
        sa.PrimaryKeyConstraint("id"),
        # **upsert 의 근거다.** 없으면 `ON CONFLICT` 를 걸 대상이 없어 비콘 중복이
        # 그대로 중복 행이 되고 "하루 1회" 정의가 깨진다.
        sa.UniqueConstraint("owner_key", "visit_date", name="uq_visit_owner_date"),
    )
    # 일일 접속자수와 30일 추이가 이 컬럼으로 시작한다.
    op.create_index("ix_visit_days_visit_date", "visit_days", ["visit_date"])
    # 회원별 집계는 소유자로 모은다. 유니크 제약의 선행 컬럼으로도 되지만 제약의
    # 컬럼 순서는 바뀔 수 있는 것이라 조회가 의존하는 인덱스는 따로 명시한다.
    op.create_index("ix_visit_days_owner_key", "visit_days", ["owner_key"])


def downgrade() -> None:
    op.drop_index("ix_visit_days_owner_key", table_name="visit_days")
    op.drop_index("ix_visit_days_visit_date", table_name="visit_days")
    op.drop_table("visit_days")
