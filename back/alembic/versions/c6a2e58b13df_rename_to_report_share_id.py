"""공유되는 것이 여덟 글자가 아니라 리포트다 — share_id → report_share_id

Revision ID: c6a2e58b13df
Revises: b4d1f70c9ae5
Create Date: 2026-09-22

## 왜 바로 앞 리비전을 뒤집나

`b4d1f70c9ae5` 는 유료 구매자도 **여덟 글자 공유 링크**(`/saju/s/{shareId}`)를
보낼 수 있게 했다. 그런데 정작 사람들이 보내고 싶어 한 것은 **자기가 산 리포트**
였다 — 여덟 글자만 담긴 링크는 받는 쪽에서 볼 것이 거의 없다.

그래서 이 칸이 가리키는 것을 바꾼다. 이제 `saju_shares` 의 행이 아니라, **이
주문의 리포트를 읽기 전용으로 여는 두 번째 열쇠**다.

## 이름을 바꾸는 것이 왜 중요한가

`share_id` 라는 이름이 `saju_shares.share_id` 와 같아서, 남아 있으면 그 표의
외래키로 읽힌다. 실제로는 그 표에 없는 값이다. **이름이 거짓이 되는 것을
그대로 두면 다음 사람이 조인을 쓴다.**

## 왜 새 컬럼이 아니라 rename 인가

`b4d1f70c9ae5` 는 어제 붙었고 값이 전부 `NULL` 이다 — 옮길 데이터가 없다.
컬럼을 새로 만들고 옛것을 남기면 아무도 쓰지 않는 칸이 하나 남는다.

## 토큰을 공유 주소로 쓰지 않는 이유는 그대로다

`/saju/reports/{token}` 은 로그인을 대신하는 자격 증명이다. 받은 사람이 리포트
전문과 양력 생년월일을 보고 구매자의 남은 추가 질문까지 쓸 수 있다. 화면에서
입력창을 숨겨도 주소를 고치면 그만이므로, **두 번째 난수**가 있어야 한다.
이 칸이 그것이고, 그 id 로 여는 응답은 `SajuSharedReport` 로 좁혀진다.

## 보관 기간

별도 칸을 두지 않는다. 이 링크는 **주문과 함께 죽는다**
(`saju_order_retention_days`) — 구매자 자신의 접근이 끝나는 바로 그 순간이고,
링크가 그보다 오래 사는 경로가 없다. 조회 쿼리가 `created_at` 으로 그것을
강제하므로 정리 작업이 돌지 않아도 기한은 지켜진다.

## 이 파일을 먼저 커밋한다

`f8b2e6d14a73` 의 교훈이다 — 리비전 파일이 저장소에 없는 채로 DB 에만 도착하면
다음 배포가 `Can't locate revision` 으로 멈춘다.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "c6a2e58b13df"
down_revision: str | None = "b4d1f70c9ae5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("saju_orders", "share_id", new_column_name="report_share_id")


def downgrade() -> None:
    op.alter_column("saju_orders", "report_share_id", new_column_name="share_id")
