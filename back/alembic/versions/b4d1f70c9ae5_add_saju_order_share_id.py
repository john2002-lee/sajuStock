"""유료 리포트도 결과 링크를 보낼 수 있게 — 주문이 공유 id 를 기억한다

Revision ID: b4d1f70c9ae5
Revises: f8b2e6d14a73
Create Date: 2026-09-22

## 왜 이 칸이 생겼나

`f8b2e6d14a73` 이 만든 `saju_shares` 로 **무료** 경로는 결과 링크를 보내게 됐다.
유료 리포트 화면은 그러지 못했다 — 발급이 생년월일시를 요구하는데
(`SajuShareRequest`) 그 화면에는 접근 토큰밖에 없었기 때문이다. 그래서 돈을 낸
사람의 "친구에게 알려주기" 는 사이트 주소 하나만 보냈다.

`/saju/reports/{token}` 그 주소를 그대로 공유하게 하는 길은 **닫혀 있다.** 토큰은
로그인을 대신하는 자격 증명이라, 링크를 받은 사람이 리포트 전문과 양력 생년월일을
보고 **구매자의 남은 추가 질문까지 써 버릴 수 있다.** 그래서 유료도 무료와 같은
`/saju/s/{shareId}` 를 보낸다 — 여덟 글자와 무료 요약만 담긴 주소다.

## 왜 주문이 기억해야 하나

두 번 눌러도 같은 링크가 나가야 한다. 누를 때마다 발급하면 먼저 보낸 링크가 살아
있는 채로 표에 쓰레기가 쌓인다.

무료 경로는 그 기억을 브라우저에 둔다(`StoredReading.shareId`). 유료는 그럴 수
없다 — 이 리포트가 파는 것 중 하나가 **"다른 기기에서도 같은 주소로 다시 열린다"**
이고, 기기마다 기억하면 열 때마다 새 공유 행이 생긴다.

## 외래키를 걸지 않는다

공유 행은 7일이면 사라지고 주문은 그보다 오래 산다. 두 보관 기간은 의도적으로
묶여 있지 않으므로(`app/models/saju_share.py`), FK 를 걸면 공유 정리가 주문을
붙들거나 이 칸을 되돌려야 한다. 가리키는 행이 이미 사라진 상태는 **정상이고**,
그때 서비스가 다시 발급한다.

같은 이유로 색인도 없다. 이 칸으로 조회하는 경로가 없다 — 토큰으로 주문을 찾은
뒤 읽기만 한다.

## 기존 행

전부 `NULL` 이다. 아무도 아직 공유하지 않았다는 뜻이고, 그게 사실이다.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b4d1f70c9ae5"
down_revision: str | None = "f8b2e6d14a73"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "saju_orders",
        sa.Column("share_id", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("saju_orders", "share_id")
