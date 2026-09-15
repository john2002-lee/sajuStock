"""접속 이력 영속성 — 기록(upsert)과 집계.

## 기록과 조회가 한 파일에 있는 이유

둘이 같은 정의를 공유한다. "하루 1회" 를 upsert 가 실현하고 집계가 그것을 전제로
센다 — 한쪽만 고치면 숫자의 뜻이 조용히 바뀐다. 예컨대 upsert 를 없애 하루에 여러
행을 쌓으면 `일일 접속자수` 는 그대로 행을 세다가 사람 수가 아닌 값을 내놓는다.

## `visit_days` 는 ORM, `users` 는 원시 SQL

`repositories/admin.py` 와 같은 규칙이다. `visit_days` 는 온전히 우리 테이블이라
모델로 두고 autogenerate 가 diff 를 잡게 하고, `users` 는 NextAuth 계약이라 필요한
컬럼만 읽으며 스키마 소유권을 주장하지 않는다.

회원별 집계에서 둘을 조인하는 방식은 `admin._select_users` 와 **같은 형태**다 —
`owner_key` 는 `user:<uuid>` 문자열이므로 접두사를 떼어 `cast(u.id as text)` 와
비교한다. 반대로 캐스트하면(문자열을 uuid 로) 형식이 어긋난 키 하나가 쿼리 전체를
세운다.
"""

import logging
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import case, func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.visits import korean_date
from app.models.visit_day import VisitDay

logger = logging.getLogger(__name__)

#: `anon-cookie.ts` 의 USER_PREFIX 와 같다. `admin.py` 도 같은 값을 든다 —
#: 상수를 공유하지 않는 것은 두 모듈이 서로를 import 하지 않기 위해서다.
_USER_PREFIX = "user:"
_ANON_PREFIX = "anon:"


def _distinct_with_prefix(prefix: str):
    """접두사가 맞는 소유자만 세는 조건 집계.

    `count(distinct case when owner_key like 'anon:%' then owner_key end)` 로
    렌더된다. `case` 의 else 가 NULL 이고 `count` 는 NULL 을 세지 않으므로,
    같은 한 번의 스캔에서 전체·익명·회원을 함께 얻는다.

    `startswith(autoescape=True)` 를 쓰는 이유는 `listed_company.find_candidates`
    와 같다 — 접두사는 우리가 정한 리터럴이라 지금은 안전하지만, LIKE 패턴을
    f-string 으로 만드는 습관이 이 저장소에서 실제로 사고를 냈다.
    """
    return func.count(
        func.distinct(
            case(
                (VisitDay.owner_key.startswith(prefix, autoescape=True), VisitDay.owner_key),
                else_=None,
            )
        )
    )


@dataclass(frozen=True)
class VisitTotals:
    """전체 규모. 익명과 회원을 나눠 든다.

    승인된 정의가 "익명 포함" 이므로 총접속자수에는 둘이 섞여 있다. 그 구성을
    함께 주지 않으면 화면이 3,000 이라는 숫자만 보여주고, 보는 사람은 그것이
    회원 3,000명인지 브라우저 3,000개인지 알 수 없다.
    """

    #: 서로 다른 방문자 수 (익명 + 회원)
    visitors: int
    #: 방문일의 합. `visitors` 보다 크면 재방문이 있었다는 뜻이다
    visit_days: int
    anon_visitors: int
    member_visitors: int


@dataclass(frozen=True)
class DailyVisits:
    """하루치. 추이 그래프의 한 칸."""

    day: date
    visitors: int


@dataclass(frozen=True)
class MemberVisits:
    """회원 한 명의 접속 요약."""

    user_id: str
    email: str | None
    name: str | None
    #: 방문한 **날 수**. 승인된 정의(하루 1회)에서 이것이 곧 접속수다
    visit_count: int
    #: 그 사람의 방문 중 가장 늦은 시각
    last_seen_at: datetime | None
    first_seen_at: datetime | None


class VisitRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ------------------------------------------------------------------ 기록

    async def touch(self, owner_key: str, *, moment: datetime | None = None) -> None:
        """이 방문자의 오늘 행을 만들거나 갱신한다. **멱등이다.**

        같은 날 두 번째 호출부터는 행을 늘리지 않고 `last_seen_at` 을 밀고 `hits` 를
        하나 올린다. 그래서 비콘이 중복돼도 숫자가 틀어지지 않는다 — 클라이언트 쪽
        중복 방지(`VisitBeacon` 의 탭당 1회)는 요청을 아끼기 위한 것이고 정확성의
        근거가 아니다.

        `first_seen_at` 은 **갱신하지 않는다.** 그날 처음 온 시각이라 덮으면 뜻이
        사라진다.

        `ON CONFLICT` 대상은 `uq_visit_owner_date` 다. 애플리케이션에서 select 후
        insert 로 하면 같은 방문자의 동시 요청 둘이 경쟁해 유니크 위반이 난다 —
        DB 한 문장으로 끝내면 그 경쟁이 없다.
        """
        day = korean_date(moment)
        now = moment or func.now()

        stmt = insert(VisitDay).values(
            owner_key=owner_key,
            visit_date=day,
            first_seen_at=now,
            last_seen_at=now,
            hits=1,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_visit_owner_date",
            set_={
                "last_seen_at": stmt.excluded.last_seen_at,
                "hits": VisitDay.hits + 1,
            },
        )

        await self._db.execute(stmt)
        await self._db.commit()

    # ------------------------------------------------------------------ 집계

    async def totals(self) -> VisitTotals:
        """전체 규모. 한 번의 왕복으로 넷을 센다.

        네 숫자를 각각 조회하면 왕복이 넷이고, 그 사이에 새 방문이 들어오면
        **합이 맞지 않는 화면**이 된다 (익명 + 회원 ≠ 전체).
        """
        stmt = select(
            func.count(func.distinct(VisitDay.owner_key)).label("visitors"),
            func.count().label("visit_days"),
            _distinct_with_prefix(_ANON_PREFIX).label("anon_visitors"),
            _distinct_with_prefix(_USER_PREFIX).label("member_visitors"),
        )

        row = (await self._db.execute(stmt)).one()
        return VisitTotals(
            visitors=int(row.visitors),
            visit_days=int(row.visit_days),
            anon_visitors=int(row.anon_visitors),
            member_visitors=int(row.member_visitors),
        )

    async def visitors_on(self, day: date) -> int:
        """그날 접속자수. 하루당 한 행이라 **행을 세면 곧 사람 수다.**"""
        stmt = select(func.count()).where(VisitDay.visit_date == day)
        return int((await self._db.execute(stmt)).scalar_one())

    async def daily(self, days: list[date]) -> dict[date, int]:
        """여러 날의 접속자수. 행이 있는 날만 돌려준다.

        **빈 날을 여기서 채우지 않는다.** 축은 호출부가
        `domain/visits.recent_dates` 로 세우고 이 값을 얹는다 — 그래야 "조회가
        안 됐다" 와 "아무도 안 왔다" 가 화면에서 구분된다.
        """
        if not days:
            return {}

        stmt = (
            select(VisitDay.visit_date, func.count().label("visitors"))
            .where(VisitDay.visit_date.in_(days))
            .group_by(VisitDay.visit_date)
        )
        rows = (await self._db.execute(stmt)).all()
        return {row.visit_date: int(row.visitors) for row in rows}

    async def members(self, limit: int, offset: int) -> tuple[list[MemberVisits], int]:
        """회원별 접속수와 최근 접속일시. `(목록, 전체 수)`.

        `user:` 접두사만 집어 `users` 에 조인한다 — 익명 키는 대응하는 행이 없다.
        조인 방식은 `admin._select_users` 와 같다 (접두사를 떼어 문자열끼리 비교).

        **결정적 타이브레이크(`u.id`)가 반드시 있어야 한다.** 최근 접속일시만으로
        정렬하면 동시에 접속한 사람들의 순서가 물리적 행 순서라, 페이지를 넘길 때
        같은 사람이 두 번 나오거나 사라진다 (`_select_users:101` 과 같은 함정).

        접속 기록이 없는 회원은 나오지 않는다 — inner join 이다. "한 번도 안 온
        회원" 은 회원 관리 화면이 답하는 질문이고, 여기는 접속 통계다.
        """
        params = {
            "prefix_len": len(_USER_PREFIX) + 1,
            "limit": limit,
            "offset": offset,
        }

        rows = (
            await self._db.execute(
                text(
                    """
                    select
                      cast(u.id as text)   as user_id,
                      u.email              as email,
                      u.name               as name,
                      count(*)             as visit_count,
                      max(v.last_seen_at)  as last_seen_at,
                      min(v.first_seen_at) as first_seen_at
                    from visit_days v
                    join users u
                      on substr(v.owner_key, :prefix_len) = cast(u.id as text)
                    where v.owner_key like 'user:%'
                    group by u.id, u.email, u.name
                    order by max(v.last_seen_at) desc, u.id asc
                    limit :limit offset :offset
                    """
                ),
                params,
            )
        ).mappings().all()

        total = int(
            (
                await self._db.execute(
                    text(
                        """
                        select count(distinct u.id)
                        from visit_days v
                        join users u
                          on substr(v.owner_key, :prefix_len) = cast(u.id as text)
                        where v.owner_key like 'user:%'
                        """
                    ),
                    {"prefix_len": len(_USER_PREFIX) + 1},
                )
            ).scalar_one()
        )

        return [
            MemberVisits(
                user_id=row["user_id"],
                email=row["email"],
                name=row["name"],
                visit_count=int(row["visit_count"]),
                last_seen_at=row["last_seen_at"],
                first_seen_at=row["first_seen_at"],
            )
            for row in rows
        ], total
