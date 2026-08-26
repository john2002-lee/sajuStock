"""AI 판단 기록 — 종목당 최신 하나를 보관하고, 켤 때만 공유한다

Revision ID: a1e6f38b72d4
Revises: c5e81a37f2b9
Create Date: 2026-08-25

## 왜 이 표가 생겼나

AI 판단이 **어디에도 남지 않았다.** 클라이언트 React Query 캐시(10분)와 서버
인메모리 캐시(TTL 600초)뿐이라 그 시간이 지나면 사라진다. 종목당 LLM 4회를 태워
만든 결과이자 이 제품에서 돈이 나가는 유일한 경로의 산출물인데 기록이 없었다.

기록이 생기면 화면 하나가 따라온다 — 홈의 "내 판단 기록". *"지난주 삼성전자에
HOLD 를 받았습니다 — 그 뒤 +4.2%"* 가 **다시 올 이유**가 된다.

## 소유자당 종목당 한 행

`(owner_key, code)` 유니크. 같은 종목을 다시 분석하면 덮어쓴다.

일괄 분석이 버튼 한 번에 10건을 만들어서(`MAX_BULK_SYMBOLS`), 이력을 그대로 쌓으면
두 번만 돌려도 홈 목록이 같은 종목들로 도배된다. "판단이 어떻게 바뀌었나" 화면이
필요해지는 날 이 유니크를 풀면 되지만, 그 화면이 없는 지금은 테이블만 커진다.

## `share_id` 는 nullable + unique

기본값 `NULL` 이 곧 비공개다. 유니크를 걸어 두면 발급 충돌이 애플리케이션이 아니라
DB 에서 잡힌다 — 128비트 난수라 부딪힐 일이 없지만, 부딪히는 날 조용히 남의
판단을 덮는 것보다는 에러가 낫다.

Postgres 의 UNIQUE 는 NULL 을 서로 다른 값으로 보므로 비공개 행이 여럿이어도 된다.

## `personal`(2축 판단)을 저장하지 않는다

그 안에는 사용자의 투자 성향 6축과 적합도가 있고 사주에서 유래한 값이다. 공유
카드에 새면 개인의 성향 프로파일이 공개된다 — **저장하지 않으면 샐 수 없다.**
컬럼이 없다는 사실이 그 결정을 강제한다.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a1e6f38b72d4"
down_revision: str | None = "c5e81a37f2b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "advice_verdicts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_key", sa.String(length=80), nullable=False),
        sa.Column("code", sa.String(length=12), nullable=False),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("decision", sa.String(length=16), nullable=False),
        sa.Column("confidence", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        # 판단 **시점**의 가격. 지금 값이 아니다 — "그 뒤 +4.2%" 의 기준선이다.
        sa.Column("price_at", sa.Float(), nullable=True),
        sa.Column("agent_opinions", postgresql.JSONB(), nullable=True),
        sa.Column("share_id", sa.String(length=32), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_key", "code", name="uq_advice_verdict_owner_code"),
    )
    op.create_index("ix_advice_verdicts_owner_key", "advice_verdicts", ["owner_key"])
    op.create_index("ix_advice_verdicts_code", "advice_verdicts", ["code"])
    # 공유 조회는 **소유자를 묻지 않는 유일한 경로**라 이 인덱스가 그 조회의 전부다.
    op.create_index(
        "ix_advice_verdicts_share_id", "advice_verdicts", ["share_id"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_advice_verdicts_share_id", table_name="advice_verdicts")
    op.drop_index("ix_advice_verdicts_code", table_name="advice_verdicts")
    op.drop_index("ix_advice_verdicts_owner_key", table_name="advice_verdicts")
    op.drop_table("advice_verdicts")
