"""운영 DB 에만 있던 리비전을 이력에 편입한다 — 스키마는 건드리지 않는다

## 무슨 일이 있었나

2026-09-22 배포가 마이그레이션 단계에서 멈췄다.

    ERROR [alembic.util.messaging] Can't locate revision identified by 'f8b2e6d14a73'

운영 DB 의 `alembic_version` 이 **이 저장소에 없는 리비전**을 가리키고 있었다.
파일도, git 이력도, 개발 기계의 `__pycache__` 에도 흔적이 없다.

## 알아낸 것

Cloud Run 마이그레이션 잡 로그가 시간을 좁혀 준다.

| 실행 | 결과 |
|---|---|
| 2026-09-15 04:54 | exit 0, `Running upgrade` 없음 → 이미 head |
| 2026-09-21 01:59 | exit 0, `Running upgrade` 없음 → **이때까지 head 는 e7d4b1a9c250** |
| 2026-09-22 02:07 | 위 오류로 실패 |

즉 09-21 01:59 과 09-22 02:07 **사이에** 누군가 `e7d4b1a9c250` 위에 리비전
하나를 만들어 운영 DB 에 적용했고, 그 파일은 저장소에 들어오지 않았다. 누가
무엇을 적용했는지는 확인하지 못했다 — 운영 DB 읽기 권한이 없어 `alembic_version`
과 실제 스키마를 대조할 수 없었다.

## 그런데도 이 파일이 안전한 이유

**운영 서비스가 그 DB로 멀쩡히 돌고 있다.** 실패한 것은 마이그레이션 잡뿐이고
API 리비전(`sajustock-back-00006-r7j`)은 계속 요청을 처리한다. 이 코드의 모델이
요구하는 표와 열이 전부 제자리에 있다는 뜻이다 — 사라진 리비전이 무엇을 했든
**우리가 쓰는 스키마를 깨지는 않았다.**

그래서 스키마를 바꾸지 않는다. 이 파일이 하는 일은 하나, 끊어진 이력을 잇는 것이다.
`down_revision` 을 `e7d4b1a9c250` 으로 두면 alembic 이 현재 DB 위치를 찾을 수 있고,
`upgrade head` 는 할 일이 없어 조용히 끝난다.

## 왜 `alembic stamp` 로 되돌리지 않았나

운영 DB 에 직접 쓰는 대신 코드로 해결하는 쪽을 골랐다. stamp 는 "DB 는 사실
`e7d4b1a9c250` 에 있다" 고 **주장**하는 일인데, 사라진 리비전이 무언가를 더했다면
그 사실을 지워 버린다. 이 파일은 반대로 **모르는 지점이 있었다는 것을 기록으로
남긴다.** 다음 사람이 `alembic history` 를 읽을 때 이 공백을 보게 된다.

## 다시 일어나지 않게 하려면

운영 DB 에 `alembic upgrade` 를 손으로 돌리지 않는다. 마이그레이션은
`.github/workflows` 의 잡만 적용한다 — 그래야 DB 상태가 항상 `main` 에 적힌
것과 같다. 자동생성(`alembic revision --autogenerate`)을 운영 DB 에 연결한 채
돌리는 것도 위험하다. 빈 리비전이 만들어져 그대로 적용되면 정확히 이 상태가 된다.

무엇이 적용됐는지 나중에 밝혀지면, 이 파일을 그 내용으로 교체하면 된다.

Revision ID: f8b2e6d14a73
Revises: e7d4b1a9c250
Create Date: 2026-09-22

"""

from collections.abc import Sequence
from typing import Union

revision: str = "f8b2e6d14a73"
down_revision: Union[str, Sequence[str], None] = "e7d4b1a9c250"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """아무것도 하지 않는다 — 이 리비전은 이미 운영 DB 에 적용돼 있다.

    새 환경(로컬·CI·프리뷰)에서는 이 지점을 그냥 지나간다. 사라진 리비전이 무엇을
    했는지 모르므로 재현하지 않는다. 재현하려 들면 **알지 못하는 것을 지어내는**
    셈이고, 그것이 빈 채로 두는 것보다 위험하다.
    """


def downgrade() -> None:
    """되돌릴 것이 없다."""
