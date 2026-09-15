"""llm_usage_days 생성 — 관리자 화면의 AI 토큰 사용량

토큰 사용량을 **읽을 수 있는 곳**이 없었다. `integrations/llm.py` 가 Gemini 의
`usage_metadata` 를 이미 뽑고 있었지만 Amplitude 로만 나갔고, 그래서 "이번 달 얼마나
썼나" 를 이 제품 안에서는 답할 수 없었다. `batch_runs` 가 배치 신호에 대해 한 일을
이 표가 토큰에 대해 한다.

## 일별 · 모델별 한 행

화면이 묻는 것은 오늘·이번 달·누적 합계뿐이고, 호출 단위 상세는 Amplitude 가 갖는다.
AI 판단 한 건이 LLM 4회(분석가 3 + 결정 1)라 호출별 행은 금세 불어나는데 그 행들이
답해 줄 새 질문이 없다. (모델, 날짜) upsert 로 하루 몇 행에서 멈춘다 — `visit_days`
와 같은 판단이다.

모델을 키에 넣는 것은 단가가 모델마다 10배 넘게 차이 나기 때문이다. 합계만으로는
비용을 읽을 수 없고, 쪼개 두면 나중에 단가표를 곱하는 것으로 끝난다.

## `usage_date` 는 KST 날짜다

`visit_days.visit_date` 와 같은 규약이다. DB 는 UTC 지만 "오늘 얼마나 썼나" 는 한국
자정 기준이어야 하고, 환산은 쓰는 시점에 한 번 한다(`domain/visits.korean_date`).
조회마다 `at time zone` 을 붙이면 인덱스를 못 타고, 한 곳을 빠뜨리면 오류 없이 하루
밀린 숫자가 나온다.

## 과거는 채우지 않는다

집계는 이 마이그레이션 이후의 호출부터 쌓인다. 되돌아가 채울 원본이 없다 — 화면이
`first_seen_at` 의 최솟값을 "집계 시작" 으로 밝혀 그 사실을 감추지 않는다.

Revision ID: e7d4b1a9c250
Revises: b7c1a5f39e02
Create Date: 2026-09-14

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "e7d4b1a9c250"
down_revision: Union[str, Sequence[str], None] = "b7c1a5f39e02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "llm_usage_days",
        sa.Column("id", sa.Integer(), nullable=False),
        # KST 날짜. 위 주석의 이유로 timestamp 가 아니라 date 다.
        sa.Column("usage_date", sa.Date(), nullable=False),
        # `settings.gemini_model` 을 적힌 그대로 남긴다 — 별칭을 정규화하면
        # "그날 실제로 무엇을 불렀나" 를 잃는다.
        sa.Column("model", sa.String(length=80), nullable=False),
        # 성공한 호출 수. 실패는 사용량 메타 자체가 오지 않아 셀 것이 없다.
        sa.Column("calls", sa.Integer(), server_default="0", nullable=False),
        # BigInteger 는 여유다. 하루 한 모델이 int32 를 넘길 일은 없지만, 넘겼을 때
        # 나는 것이 조용한 오버플로라 값을 되돌릴 수 없다.
        sa.Column("input_tokens", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("output_tokens", sa.BigInteger(), server_default="0", nullable=False),
        # 사고(thinking) 토큰. Gemini 는 이것을 **출력으로 과금**하고, medium 에서는
        # 과금 출력의 절반을 넘는다(실측). 출력과 합쳐 두면 비용의 출처가 안 보인다.
        sa.Column("reasoning_tokens", sa.BigInteger(), server_default="0", nullable=False),
        # 캐시에서 읽은 입력. 입력의 부분집합이라 합계에 더하지 않는다.
        sa.Column("cache_read_tokens", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("total_tokens", sa.BigInteger(), server_default="0", nullable=False),
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
        sa.PrimaryKeyConstraint("id"),
        # **upsert 의 근거다.** 없으면 `ON CONFLICT` 를 걸 대상이 없어 호출마다 행이
        # 쌓이고, 그 순간 "일별 롤업" 이라는 정의가 깨진다.
        sa.UniqueConstraint("usage_date", "model", name="uq_llm_usage_date_model"),
    )
    # 오늘·이번 달 집계가 이 컬럼으로 시작한다.
    op.create_index("ix_llm_usage_days_usage_date", "llm_usage_days", ["usage_date"])


def downgrade() -> None:
    op.drop_index("ix_llm_usage_days_usage_date", table_name="llm_usage_days")
    op.drop_table("llm_usage_days")
