"""users 에 비밀번호 해시 컬럼을 더한다

이메일/비밀번호 로그인을 붙이면서 필요해졌다. NextAuth 표준 스키마에는 이 컬럼이
없다 — Auth.js 의 Credentials 프로바이더는 "사용자를 DB 에 저장하지 않는다"는 전제라
비밀번호 보관 방식을 정해 주지 않는다. 그래서 우리가 정한다.

## nullable 이다

구글·매직링크로 만들어진 계정은 비밀번호가 **없다.** NOT NULL 로 두면 그 계정들을
마이그레이션할 방법이 없고, 빈 문자열 같은 자리표시를 넣으면 "해시가 있는데 아무
비밀번호와도 안 맞는 값"이 되어 검증 코드가 그것을 특수 취급해야 한다. 없으면
없다고 두고, 비밀번호 로그인은 값이 있는 계정만 시도한다.

## 값의 형식은 애플리케이션이 정한다

`front/src/lib/auth/password.ts` 가 `scrypt$N=...,r=...,p=...$salt$hash` 로 적는다.
파라미터를 값 안에 넣는 이유는 나중에 비용을 올려도 **옛 해시가 그대로 검증되게**
하기 위해서다. DB 는 그 문자열의 뜻을 모르고 알 필요도 없다.

## 이 테이블의 주인은 프런트다

`users`·`accounts`·`sessions`·`verification_token` 넷은 NextAuth 어댑터가 읽고 쓴다
(`front/src/lib/auth/pool.ts`). 백엔드는 **스키마만** 소유한다 — 그 규칙이
`b3f1c2d47a90` 에서 정해졌고 여기서도 같다.

Revision ID: d41c9f0b8e75
Revises: e1f4c8b95d27
Create Date: 2026-08-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d41c9f0b8e75"
down_revision: Union[str, Sequence[str], None] = "e1f4c8b95d27"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        # 카멜케이스를 쓰지 않는다. 어댑터가 따옴표로 감싸 보내는 컬럼
        # (`emailVerified`)은 NextAuth 가 이름을 정한 것이고, 이건 우리 것이다.
        sa.Column("password_hash", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "password_hash")
