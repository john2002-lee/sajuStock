"""소유자가 사라진 행 정리.

## 왜 필요한가

관심종목·투자 성향은 소유자를 `owner_key` **문자열**로 들고 있다. 외래키가 아니다 —
익명(`anon:`)이 로그인(`user:`)보다 먼저 존재할 수 있어야 하기 때문이고, 그 선택
덕분에 온보딩이 가입보다 앞설 수 있다(모델 주석).

대가가 하나 있다. **사용자를 지워도 그 사람의 행이 남는다.** 외래키였다면
`ON DELETE CASCADE` 가 처리했을 일을 아무도 안 한다.

## 왜 이렇게 조심스러운가

이 코드는 **데이터를 지운다.** 판단 근거가 틀리면 남의 관심종목이 사라진다. 그래서
세 겹으로 막는다.

1. `users` 테이블을 **읽을 수 없으면 아무것도 하지 않는다.** 그 테이블이 없거나 권한이
   없는 환경에서 "사용자가 하나도 없다 → 전부 고아다" 로 읽으면 재앙이다. 실제로
   백엔드와 프런트가 서로 다른 Supabase 프로젝트를 보던 시기가 있었고, 그때 이 검사가
   없었다면 로그인 사용자의 관심종목이 통째로 지워졌다.
2. `user:` 접두사가 붙은 행만 본다. 익명 행은 대응하는 사용자가 **원래** 없다.
3. 기본이 **모의 실행**이다. 실제 삭제는 호출부가 명시적으로 켠다.

`users` 는 NextAuth 소유라 우리가 쓰지 않는다 — 여기서는 존재 확인만 하는 읽기다.
"""

import logging
from dataclasses import dataclass, field

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

#: 로그인 소유자 접두사. `lib/watchlist/anon-cookie.ts` 의 USER_PREFIX 와 같은 값이다.
_USER_PREFIX = "user:"

#: 고아를 찾을 테이블. (테이블명, 소유자 컬럼)
_OWNED_TABLES: tuple[tuple[str, str], ...] = (
    ("watchlist_items", "owner_key"),
    ("investor_profiles", "owner_key"),
)


class UsersTableUnavailable(RuntimeError):
    """`users` 를 읽을 수 없다 — 판단 근거가 없으므로 아무것도 지우지 않는다."""


@dataclass
class OrphanReport:
    """무엇을 지웠는지(또는 지울 것인지). 테이블명 → 행 수."""

    applied: bool
    counts: dict[str, int] = field(default_factory=dict)

    @property
    def total(self) -> int:
        return sum(self.counts.values())


async def _users_are_readable(session: AsyncSession) -> bool:
    """`users` 를 읽을 수 있는가.

    행이 0개인 것과 테이블이 없는 것은 **완전히 다르다.** 전자는 "아직 아무도 가입하지
    않았다"(그러면 모든 `user:` 행이 진짜 고아다), 후자는 "여기서는 판단할 수 없다" 다.

    **세이브포인트 안에서 물어본다.** Postgres 는 실패한 문장 하나가 트랜잭션 전체를
    중단 상태로 만든다 — 예외를 삼키고 False 를 돌려줘도 그 세션으로는 이후 아무것도
    못 한다(`InFailedSQLTransactionError`). 그러면 "읽을 수 없으면 False 를 주고 호출부가
    판단한다" 는 이 함수의 계약이 성립하지 않는다.

    SQLite 는 실패한 문장이 트랜잭션을 죽이지 않아 이 차이가 보이지 않았고, 테스트가
    인메모리 SQLite 로 도는 동안 264개가 초록인 채로 남아 있었다.
    """
    try:
        # 실패는 세이브포인트까지만 되돌린다. 바깥 트랜잭션은 그대로 살아 있다.
        async with session.begin_nested():
            await session.execute(text("select 1 from users limit 1"))
        return True
    except Exception as exc:  # noqa: BLE001 - 방언·권한·부재를 구분하지 않는다
        logger.info("users 테이블을 읽을 수 없어 고아 정리를 건너뜁니다 (%s)", exc)
        return False


async def sweep_orphans(session: AsyncSession, *, apply: bool = False) -> OrphanReport:
    """소유자가 없는 행을 찾는다. `apply=True` 일 때만 지운다.

    기본이 모의 실행인 것은 이 함수가 **되돌릴 수 없는 일**을 하기 때문이다. 먼저
    숫자를 보고, 그 숫자가 납득되면 그때 지운다.
    """
    if not await _users_are_readable(session):
        raise UsersTableUnavailable(
            "users 테이블을 읽을 수 없습니다. Postgres(Supabase)에 연결됐는지, "
            "NextAuth 마이그레이션(b3f1c2d47a90)이 적용됐는지 확인하세요."
        )

    report = OrphanReport(applied=apply)

    for table, column in _OWNED_TABLES:
        # `user:<uuid>` 에서 uuid 만 떼어 users.id 와 맞춘다.
        #
        # 텍스트로 비교하는 것은 `users.id` 가 uuid 타입이기 때문이다. 반대 방향
        # (문자열을 uuid 로 캐스트)은 잘못된 형식의 키 하나가 전체 쿼리를 세운다.
        #
        # `id::text` 가 아니라 `cast(id as text)` 인 것은 이제 취향이 아니라 관성이다 —
        # SQLite 하네스에서 `::` 가 `unrecognized token` 으로 깨져서 이렇게 적었고,
        # 그 하네스는 사라졌다. 표준 문법이라 굳이 되돌릴 이유도 없어 그대로 둔다.
        predicate = (
            f"{column} like :prefix "
            f"and substr({column}, :cut) not in (select cast(id as text) from users)"
        )
        params = {"prefix": f"{_USER_PREFIX}%", "cut": len(_USER_PREFIX) + 1}

        found = (
            await session.execute(
                text(f"select count(*) from {table} where {predicate}"), params
            )
        ).scalar_one()

        report.counts[table] = int(found)
        if found and apply:
            await session.execute(
                text(f"delete from {table} where {predicate}"), params
            )

    if apply and report.total:
        await session.commit()
        logger.warning("고아 행 %d건을 삭제했습니다: %s", report.total, report.counts)
    elif report.total:
        logger.info("고아 행 %d건을 찾았습니다(모의 실행): %s", report.total, report.counts)

    return report
