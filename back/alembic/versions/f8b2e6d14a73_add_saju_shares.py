"""사주 결과 공유 링크 — 여덟 글자만, 7일만

Revision ID: f8b2e6d14a73
Revises: e7d4b1a9c250
Create Date: 2026-09-21

## 왜 이 표가 생겼나

결과를 친구에게 보내는 기능이 그동안 **사이트 주소 하나**만 보냈다. 링크를 받은
사람은 자기 사주를 새로 볼 뿐, 보낸 사람이 무엇을 봤는지는 알 수 없었다. 결과를
링크로 보내려면 링크가 가리킬 것이 서버에 있어야 한다.

## 이 표는 무료 경로의 약속을 의도적으로 깬다

`endpoints/saju.py` 의 "무료 경로는 아무것도 저장하지 않는다" 를 깨는 첫 표다.
깨는 범위를 셋으로 좁혔다 — 공유 버튼을 눌렀을 때만 생기고, 여덟 글자와 요약만
담고, 7일이면 사라진다. 자세한 근거와 **담지 않는 칸의 목록**은
`app/models/saju_share.py` 모듈 주석에 있다.

개인정보처리방침의 무료 경로 문구가 이 표와 같은 말을 해야 한다.

## 7일인 이유

유료 주문도 지금 7일이다(`saju_order_retention_days`). 값이 같은 것은 **우연이고,
묶여 있지 않다** — 그쪽은 돈을 받고 한 약속이라 판매가 시작되면 구매 시점의 약관에
붙들리고, 이쪽은 공유 버튼을 누른 사람의 여덟 글자를 잠깐 들고 있는 것이다. 설정을
둘로 나눠 둔 이유가 그것이다: 한쪽이 움직일 때 다른 쪽이 따라가면 안 된다.

24시간으로 하지 않은 것은, 금요일 밤에 보낸 링크가 월요일에 404 가 되면 받은 쪽이
이유를 알 방법이 없기 때문이다.

## 만료는 조회 쿼리가 강제한다 — 삭제에 기대지 않는다

`services/saju_purge_service` 가 만료된 유료 주문을 실제로 지운다. 다만 그것은
크론이 아니라 **요청 경로에 얹혀 도는 기회주의적 정리**다(`/saju/payment/config` 가
불릴 때 하루 한 번). 트래픽이 없으면 돌지 않는다.

공유 링크에서 그 차이는 치명적이다 — "만료됐지만 아무도 결제 설정을 부르지 않아서
아직 열리는 링크" 는 7일이라는 말을 거짓으로 만든다. 그래서 `SajuShareRepository.get`
이 `created_at` 을 조건에 넣는다. **아무도 지우지 않아도 7일이 지난 링크는 열리지
않는다.** 삭제(쓰기 경로의 상한 붙은 정리 · `scripts/prune_saju_shares.py`)는 그
뒤의 청소일 뿐이다.

## 색인

소유자 컬럼이 없어 정리를 소유자별로 좁힐 수 없다. `created_at` 색인이 없으면
정리가 매번 전체 스캔이 된다.

## 이 리비전은 파일보다 먼저 운영 DB 에 도착했다 — 그리고 배포를 세웠다

2026-09-21, 이 파일이 아직 커밋되지 않은 상태에서 `alembic upgrade head` 가 운영
DB 에 손으로 돌았다. 다음 배포(09-22)가 마이그레이션 단계에서 멈췄다.

    ERROR [alembic.util.messaging] Can't locate revision identified by 'f8b2e6d14a73'

`alembic_version` 은 `f8b2e6d14a73` 을 가리키는데 저장소에 그 파일이 없었으니
alembic 이 현재 위치를 찾을 수 없었다. 이력을 잇기 위해 같은 id 의 **빈**
리비전(`f8b2e6d14a73_reconcile_unrecorded_revision.py`)이 임시로 들어왔고, 그 파일은
"무엇이 적용됐는지 나중에 밝혀지면 이 파일을 그 내용으로 교체하면 된다" 고 적어
두었다. **이 파일이 그 교체다** — 사라졌던 리비전이 곧 이 표이고, 운영 DB 의
스탬프는 이제 사실을 가리킨다.

그래서 이 파일의 id 를 새로 따지 않았다. 새 id 를 주면 운영 DB 가 이 리비전을
"아직 적용 안 됨" 으로 보고 `CREATE TABLE saju_shares` 를 이미 있는 표에 다시
돌린다.

**교훈: 운영 DB 에 `alembic upgrade` 를 손으로 돌리지 않는다.** 마이그레이션은
`.github/workflows` 의 잡만 적용한다 — 그래야 DB 상태가 항상 `main` 에 적힌 것과
같다. 리비전 파일을 **먼저 커밋**하는 것이 그 규칙의 절반이다.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f8b2e6d14a73"
down_revision: str | None = "e7d4b1a9c250"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "saju_shares",
        # 주소가 곧 열쇠다. 128비트 난수이므로 대리키를 따로 둘 이유가 없다.
        sa.Column("share_id", sa.String(length=32), nullable=False),
        sa.Column("pillars_hangul", postgresql.JSONB(), nullable=False),
        sa.Column("day_master_hangul", sa.String(length=4), nullable=False),
        sa.Column("visible_wuxing", postgresql.JSONB(), nullable=False),
        sa.Column("strength_verdict", sa.String(length=8), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("share_id"),
    )
    op.create_index("ix_saju_shares_created_at", "saju_shares", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_saju_shares_created_at", table_name="saju_shares")
    op.drop_table("saju_shares")
