"""관리자 감사 로그 ORM 모델.

## 왜 이 테이블이 관리자 화면의 **전제 조건**인가

관리자 화면이 할 수 있는 일은 둘 다 되돌릴 수 없다: 권한 부여와 계정 삭제.
되돌릴 수 없는 일에는 "누가 언제 무엇을 했는가" 가 남아야 한다. 이건 감사 취향이
아니라 **사고가 났을 때 복구의 유일한 단서**다 — 어제까지 관리자였던 사람이 오늘
아닌데 아무 기록이 없으면, 누가 실수한 것인지 누가 침입한 것인지 구분할 방법이 없다.

## 삭제된 사용자의 기록이 남아야 한다

`actor_user_id` · `target_user_id` 에 외래키를 **걸지 않는다.** 계정을 지우는 것이
이 로그가 기록하는 행위 중 하나인데, 외래키가 있으면 그 행위의 기록이 대상과 함께
사라지거나(CASCADE) 삭제 자체가 막힌다(RESTRICT). 관심종목이 `owner_key` 를 문자열로
드는 것과 같은 이유이고 같은 대가다 — 정합성을 DB 가 아니라 우리가 진다.

같은 이유로 `target_email` 을 **복사해 둔다.** id 만 남기면 지워진 계정의 로그는
"누구인지 알 수 없는 uuid" 가 되어 읽을 수 없다.

## 실패도 기록한다

`ok=False` 행이 있어야 "권한 없는 사람이 계속 두드리고 있다" 를 볼 수 있다.
성공만 남기면 그 시도는 로그에서 존재하지 않은 일이 된다.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AdminAuditLog(Base):
    """관리자 행위 한 건."""

    __tablename__ = "admin_audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 조회는 언제나 "최근 것부터" 다. 이 컬럼 하나에만 인덱스를 건다 —
    # 다른 축으로 거르는 화면이 생기면 그때 실제 조건을 보고 더한다.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    #: 행위를 한 관리자. NextAuth `users.id`(uuid) 문자열이다.
    actor_user_id: Mapped[str] = mapped_column(String(64))
    #: 행위 시점의 관리자 이메일. 그 계정이 나중에 지워져도 읽을 수 있어야 한다.
    actor_email: Mapped[str | None] = mapped_column(String(320), nullable=True)

    #: `role.grant` · `role.revoke` · `user.delete` 처럼 점으로 나눈 동사.
    #: 열거로 고정하지 않는 것은 새 행위를 추가할 때 마이그레이션을 요구하지 않기
    #: 위해서다 — 대신 쓰는 쪽(`services/admin_service`)이 상수로 소유한다.
    action: Mapped[str] = mapped_column(String(40), index=True)

    #: 대상 사용자. 계정 삭제 로그에서는 **이미 존재하지 않는 id** 다.
    target_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    target_email: Mapped[str | None] = mapped_column(String(320), nullable=True)

    #: 사람이 읽을 요약 ("user → admin", "관심종목 12건 함께 삭제").
    #: 구조화 필드로 쪼개지 않는 이유: 이 값의 소비처는 화면 한 줄뿐이고,
    #: 행위마다 의미 있는 필드가 달라 공통 스키마를 만들면 대부분 NULL 이 된다.
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    #: 실패도 남긴다. 거절된 시도가 로그에서 사라지면 공격을 볼 수 없다.
    #: 서버 기본값을 함께 둔다 — 마이그레이션과 모델이 어긋나면 `alembic check` 가
    #: drift 로 잡고, 그 소음이 진짜 drift 를 가린다.
    ok: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<AdminAuditLog {self.action} {self.target_email or self.target_user_id}>"
