"""관리자 영속성 계층 — 회원(`users`)과 감사 로그.

## `users` 를 원시 SQL 로 다루는 이유

이 테이블은 NextAuth 계약이고 스키마는 `b3f1c2d47a90` 이 만든다. ORM 모델을 만들면
`Base.metadata` 에 들어가고, 그 순간 `alembic/env.py` 의 `_FOREIGN_TABLES` 제외
규칙과 충돌한다 — autogenerate 가 이 테이블을 우리 것으로 보기 시작하면, 프런트
어댑터가 컬럼을 하나 늘렸을 때 그것을 **지우자고 제안**한다.

그래서 `orphan_service` 와 같은 자세를 취한다: 필요한 컬럼만 원시 SQL 로 읽고 쓰며,
스키마 소유권은 주장하지 않는다. 예외는 `role` 하나인데 그건 우리가 더한 컬럼이다.

## 감사 로그만 ORM 인 이유

`admin_audit_log` 는 온전히 우리 테이블이다. 남의 계약이 아니므로 모델로 두고
autogenerate 가 diff 를 잡게 한다.
"""

import logging
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_audit import AdminAuditLog
from app.utils.text import escape_like

logger = logging.getLogger(__name__)

#: 관심종목·투자 성향이 소유자를 적는 방식. `anon-cookie.ts` 의 USER_PREFIX 와 같다.
_USER_PREFIX = "user:"

#: 회원 한 명의 데이터가 흩어져 있는 곳. (테이블명, 소유자 컬럼)
#: `orphan_service._OWNED_TABLES` 와 같은 목록이다 — 한쪽만 늘리면 삭제가 반쪽이 된다.
_OWNED_TABLES: tuple[tuple[str, str], ...] = (
    ("watchlist_items", "owner_key"),
    ("investor_profiles", "owner_key"),
)


@dataclass
class AdminUserRow:
    """회원 목록 한 줄. `users` + 우리가 붙인 통계."""

    id: str
    email: str | None
    name: str | None
    image: str | None
    role: str
    email_verified: str | None
    #: 이 사람이 담은 관심종목 수. 삭제 확인 화면이 "몇 건이 함께 사라지는지" 를 말한다
    watchlist_count: int
    #: 투자 성향을 저장했는가
    has_profile: bool
    #: 살아 있는 세션 수. 0 이면 지금 로그인해 있지 않다는 뜻이다
    active_sessions: int


class AdminRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def users_are_readable(self) -> bool:
        """`users` 를 **이 모듈이 쓰는 모양으로** 읽을 수 있는가.

        `orphan_service._users_are_readable` 와 **같은 이유로 세이브포인트 안에서**
        물어본다. Postgres 는 실패한 문장 하나가 트랜잭션 전체를 중단 상태로 만들어,
        예외를 삼켜도 그 세션으로는 이후 아무것도 못 한다.

        **`select 1` 로는 부족했다.** 테이블만 있고 `role` 컬럼이 없는 DB(=NextAuth
        마이그레이션은 돌았지만 `c9b3e7d21a08` 은 안 돌린 상태)에서도 "읽을 수 있다" 로
        판정하고, 곧바로 `_select_users` 가 `u.role` 에서 `UndefinedColumn` 으로 터졌다.
        그러면 준비해 둔 진단 문장은 한 번도 쓰이지 않고 화면은 500 을 받아 "백엔드에
        닿지 못했습니다" 라는 **틀린 방향**을 안내한다 — 정작 필요한 말은 "마이그레이션을
        돌리세요" 다.

        그래서 프로브가 실제 의존 컬럼을 함께 본다. 프로브와 본 질의가 같은 것을 보지
        않으면 프로브는 통과 도장을 찍는 일밖에 하지 않는다.
        """
        try:
            async with self._db.begin_nested():
                await self._db.execute(
                    text('select role, "emailVerified" from users limit 1')
                )
            return True
        except Exception as exc:  # noqa: BLE001 - 방언·권한·부재를 구분하지 않는다
            logger.info("users 테이블을 읽을 수 없습니다 (%s)", exc)
            return False

    async def count_users(self, keyword: str = "") -> int:
        where, params = _search_clause(keyword)
        stmt = text(f"select count(*) from users u {where}")
        return int((await self._db.execute(stmt, params)).scalar_one())

    async def list_users(
        self, *, keyword: str = "", limit: int = 50, offset: int = 0
    ) -> list[AdminUserRow]:
        """회원 목록. 관리자를 먼저, 그다음 이메일 오름차순.

        **결정적 타이브레이크(`u.id`)가 반드시 있어야 한다.** 없으면 동점 구간이
        물리적 행 순서라 페이지를 넘길 때 같은 사람이 두 번 나오거나 사라진다
        (`listed_company.screen` 과 같은 함정).

        통계는 상관 서브쿼리로 한 번에 가져온다. 목록을 받은 뒤 사람마다 세면
        50명이면 왕복이 150번이다.
        """
        where, params = _search_clause(keyword)
        return await self._select_users(
            where, params | {"limit": limit, "offset": offset}, paged=True
        )

    async def find_user(self, user_id: str) -> AdminUserRow | None:
        """한 명. **목록과 같은 쿼리를 공유한다.**

        따로 짜면 통계 계산이 두 벌이 되고, 한쪽만 고쳤을 때 목록의 '관심종목 12건'
        과 상세의 '관심종목 9건' 이 어긋난다 — 그 상태로 삭제 확인 화면이 틀린 수를
        보여주면 사람이 잘못된 근거로 지우게 된다.
        """
        rows = await self._select_users(
            "where cast(u.id as text) = :uid", {"uid": user_id}, paged=False
        )
        return rows[0] if rows else None

    async def _select_users(
        self, where: str, params: dict[str, object], *, paged: bool
    ) -> list[AdminUserRow]:
        """목록·상세가 공유하는 한 벌의 쿼리.

        `user:<uuid>` 에서 uuid 만 떼어 맞춘다. `orphan_service` 와 같은 방향
        (문자열끼리 비교)인 것은, 반대로 캐스트하면 잘못된 형식의 키 하나가
        전체 쿼리를 세우기 때문이다.
        """
        params = params | {"prefix_len": len(_USER_PREFIX) + 1}
        window = "limit :limit offset :offset" if paged else ""

        stmt = text(
            f"""
            select
              cast(u.id as text)                         as id,
              u.email                                    as email,
              u.name                                     as name,
              u.image                                    as image,
              u.role                                     as role,
              cast(u."emailVerified" as text)            as email_verified,
              (select count(*) from watchlist_items w
                 where w.owner_key like 'user:%'
                   and substr(w.owner_key, :prefix_len) = cast(u.id as text))
                                                         as watchlist_count,
              (select count(*) from investor_profiles p
                 where p.owner_key like 'user:%'
                   and substr(p.owner_key, :prefix_len) = cast(u.id as text))
                                                         as profile_count,
              (select count(*) from sessions s
                 where s."userId" = u.id and s.expires > now()) as active_sessions
            from users u
            {where}
            order by (u.role = 'admin') desc, u.email asc, u.id asc
            {window}
            """
        )

        rows = (await self._db.execute(stmt, params)).mappings().all()
        return [
            AdminUserRow(
                id=row["id"],
                email=row["email"],
                name=row["name"],
                image=row["image"],
                role=row["role"] or "user",
                email_verified=row["email_verified"],
                watchlist_count=int(row["watchlist_count"]),
                has_profile=bool(row["profile_count"]),
                active_sessions=int(row["active_sessions"]),
            )
            for row in rows
        ]

    async def count_admins(self) -> int:
        """관리자 수. **마지막 한 명을 지키는 판단의 근거다.**"""
        stmt = text("select count(*) from users where role = 'admin'")
        return int((await self._db.execute(stmt)).scalar_one())

    async def set_role(self, user_id: str, role: str) -> bool:
        """권한을 바꾼다. 대상이 없으면 False.

        **커밋하지 않는다.** 호출부가 감사 로그와 같은 트랜잭션에 묶는다 — 권한만
        바뀌고 기록이 없는 순간이 존재하면 안 된다.
        """
        result = await self._db.execute(
            text("update users set role = :role where cast(id as text) = :id"),
            {"role": role, "id": user_id},
        )
        return bool(result.rowcount)

    async def delete_user(self, user_id: str) -> dict[str, int]:
        """회원과 그 사람의 데이터를 지운다. 테이블별 삭제 행 수를 돌려준다.

        ## 순서가 중요하다

        소유 데이터를 **먼저** 지우고 `users` 를 나중에 지운다. 반대로 하면 중간에
        실패했을 때 소유자 없는 행이 남고, 그건 `orphan_service` 가 나중에 치워야 할
        빚이 된다. 같은 트랜잭션이라 원자적이지만, 순서가 뜻을 갖는 편이 낫다.

        `accounts`·`sessions` 는 `users` 를 참조하는 외래키가 CASCADE 로 걸려 있어
        (`b3f1c2d47a90`) 함께 사라진다. 우리가 지우는 것은 외래키가 **없는** 쪽,
        즉 `owner_key` 문자열로만 연결된 행들이다 — 외래키를 안 건 대가를 여기서 갚는다.

        **커밋하지 않는다.** `set_role` 과 같은 이유다.
        """
        counts: dict[str, int] = {}
        params = {"owner": f"{_USER_PREFIX}{user_id}"}

        for table, column in _OWNED_TABLES:
            result = await self._db.execute(
                text(f"delete from {table} where {column} = :owner"), params
            )
            counts[table] = int(result.rowcount or 0)

        result = await self._db.execute(
            text("delete from users where cast(id as text) = :id"), {"id": user_id}
        )
        counts["users"] = int(result.rowcount or 0)
        return counts

    # --- 감사 로그 -----------------------------------------------------------

    async def record(
        self,
        *,
        actor_user_id: str,
        actor_email: str | None,
        action: str,
        target_user_id: str | None = None,
        target_email: str | None = None,
        detail: str | None = None,
        ok: bool = True,
    ) -> None:
        """감사 로그 한 줄. **커밋은 호출부가 한다.**

        행위와 기록이 한 트랜잭션이어야 "권한은 바뀌었는데 기록이 없다" 가 불가능해진다.
        """
        self._db.add(
            AdminAuditLog(
                actor_user_id=actor_user_id,
                actor_email=actor_email,
                action=action,
                target_user_id=target_user_id,
                target_email=target_email,
                detail=detail,
                ok=ok,
            )
        )

    async def recent_audit(self, limit: int = 50) -> Sequence[AdminAuditLog]:
        """최근 기록부터. `created_at` 은 NOT NULL 이라 NULLS 절이 뜻이 없다."""
        stmt = (
            select(AdminAuditLog)
            .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
            .limit(limit)
        )
        return (await self._db.execute(stmt)).scalars().all()

    async def count_audit(self) -> int:
        return int(
            (await self._db.execute(select(func.count()).select_from(AdminAuditLog))).scalar_one()
        )


def _search_clause(keyword: str) -> tuple[str, dict[str, object]]:
    r"""이메일·이름 부분 일치. 빈 키워드면 절을 만들지 않는다.

    `ilike` 로 대소문자를 무시한다 — 이메일을 대문자로 적어 두고 소문자로 찾는 일이
    흔하고, 그때 "그런 회원 없음" 은 사실이 아니다.

    **키워드를 이스케이프한다.** 검색창의 값이 패턴에 그대로 실리면 `%`·`_` 가
    와일드카드가 된다. 여기서는 남의 데이터를 보는 사고가 아니라(관리자는 어차피 전
    회원을 볼 수 있다) **틀린 결과**가 문제다: `a_c` 로 찾으면 `abc` 도 걸려서
    "그 이메일이 있다" 는 잘못된 확인을 준다. 삭제 화면이 이메일 대조를 요구하는
    흐름이라 그 오판의 값이 싸지 않다.
    """
    text_value = keyword.strip()
    if not text_value:
        return "", {}

    return (
        r"where u.email ilike :kw escape '\' or u.name ilike :kw escape '\'",
        {"kw": f"%{escape_like(text_value)}%"},
    )
