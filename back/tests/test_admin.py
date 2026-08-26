"""관리자 API — 회원 관리 · 감사 로그 · 운영 현황.

이 파일이 지키는 것은 화면이 아니라 **되돌릴 수 없는 일의 안전장치**다. 관리자가
할 수 있는 일(권한 변경 · 계정 삭제)은 둘 다 취소가 없고, 잘못되면 서비스가 잠기거나
남의 데이터가 사라진다. 그래서 규칙 하나하나에 테스트를 붙인다.

1. **자물쇠** — 키가 없으면 열리는 게 아니라 **닫힌다** (advice 와 반대다).
2. **잠김 방지** — 마지막 관리자와 자기 자신은 강등·삭제되지 않는다.
3. **감사** — 성공도 거절도 남는다. 그리고 행위와 기록이 **한 트랜잭션**이다.
4. **고아 없음** — 회원을 지우면 그 사람의 관심종목·성향도 함께 사라진다.
5. **관측이 대상을 바꾸지 않는다** — 운영 현황 조회가 배치를 돌리면 안 된다.

## `users` 는 테스트 DB 에 없다

하네스는 `Base.metadata` 로 스키마를 만드는데 NextAuth 테이블은 거기 없다
(`conftest` 주석). 그래서 필요한 테스트만 아래 `nextauth_tables` 픽스처로 최소
형태를 만든다 — `db_session` 의 트랜잭션 안이라 테스트가 끝나면 함께 사라진다.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.repositories.admin import AdminRepository
from app.repositories.batch_run import BatchRunRepository
from app.services import admin_service
from app.services.admin_service import Actor, AdminError, UsersUnavailable

_KEY = "test-admin-key-0123456789"

_ADMIN_ID = "11111111-1111-1111-1111-111111111111"
_OTHER_ADMIN_ID = "22222222-2222-2222-2222-222222222222"
_MEMBER_ID = "33333333-3333-3333-3333-333333333333"

_ACTOR = Actor(user_id=_ADMIN_ID, email="admin@example.com")


async def _add_watch(db_session, owner: str, symbol: str) -> None:
    """관심종목 한 건을 **모델로** 넣는다.

    원시 SQL 로 컬럼을 나열하지 않는 이유: `alert_enabled` 처럼 파이썬 기본값만 가진
    NOT NULL 컬럼이 있어서, 컬럼 하나가 늘 때마다 이 테스트가 깨진다. 여기서 검사하는
    것은 관심종목 스키마가 아니라 **삭제가 그 행을 함께 가져가는가**다.
    """
    from app.models.watchlist import WatchlistItem

    db_session.add(WatchlistItem(owner_key=owner, symbol=symbol))
    await db_session.flush()


@pytest.fixture
def locked(monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    """관리자 키를 켠다. 헤더 한 벌을 함께 돌려준다."""
    monkeypatch.setattr(settings, "admin_api_key", _KEY)
    return {
        "X-Admin-Key": _KEY,
        "X-Admin-Actor": _ADMIN_ID,
        "X-Admin-Actor-Email": "admin@example.com",
    }


@pytest.fixture
async def nextauth_tables(db_session):
    """`users` · `sessions` 를 테스트 트랜잭션 안에 만든다.

    운영 스키마(`b3f1c2d47a90`)에서 이 코드가 **실제로 읽는 컬럼만** 옮겨 온다.
    따옴표 붙은 camelCase(`"emailVerified"` · `"userId"`)까지 같아야 한다 — 그것을
    소문자로 만들면 쿼리가 여기서만 통과하고 운영에서 깨진다.
    """
    await db_session.execute(
        text(
            """
            create table users (
              id uuid primary key,
              name text,
              email text,
              "emailVerified" timestamptz,
              image text,
              role varchar(20) not null default 'user'
            )
            """
        )
    )
    await db_session.execute(
        text(
            """
            create table sessions (
              id uuid primary key default gen_random_uuid(),
              "userId" uuid not null,
              expires timestamptz not null,
              "sessionToken" text not null
            )
            """
        )
    )
    return db_session


async def _seed_users(db_session, *, admins: int = 2) -> None:
    rows = [
        (_ADMIN_ID, "admin@example.com", "관리자", "admin"),
        (_OTHER_ADMIN_ID, "second@example.com", "부관리자", "admin" if admins > 1 else "user"),
        (_MEMBER_ID, "member@example.com", "회원", "user"),
    ]
    for user_id, email, name, role in rows:
        await db_session.execute(
            text(
                "insert into users (id, email, name, role) "
                "values (cast(:id as uuid), :email, :name, :role)"
            ),
            {"id": user_id, "email": email, "name": name, "role": role},
        )


@pytest.fixture
async def repo(nextauth_tables, db_session) -> AdminRepository:
    await _seed_users(db_session)
    return AdminRepository(db_session)


# ── 자물쇠 ────────────────────────────────────────────────────────────────


async def test_admin_is_closed_when_the_key_is_missing(client: AsyncClient) -> None:
    """**키가 없으면 열리는 게 아니라 닫힌다** — AI 판단 자물쇠와 정반대다.

    그쪽은 미설정이면 통과시킨다(로컬 개발이 키 없이 돌아야 하고, 잃는 것이 토큰뿐이다).
    여기서 같은 선택을 하면 설정을 빠뜨린 서버가 **권한 부여 API 를 공개**하게 된다.
    """
    response = await client.get("/api/v1/admin/ops")

    assert response.status_code == 503


async def test_wrong_key_is_rejected(client: AsyncClient, locked) -> None:
    response = await client.get("/api/v1/admin/ops", headers={"X-Admin-Key": "nope"})

    assert response.status_code == 401


async def test_every_admin_route_is_locked(client: AsyncClient, locked) -> None:
    """**라우터 전체가 잠겨 있는가.**

    엔드포인트마다 가드를 붙이는 방식이면 새 엔드포인트에서 빠뜨릴 수 있고, 그
    실수는 아무 오류도 내지 않는다. 그래서 라우터에 걸었고, 여기서 그 사실을 고정한다.
    새 관리자 엔드포인트를 추가하면 이 목록에도 넣는다.
    """
    paths = [
        ("get", "/api/v1/admin/ops"),
        ("get", "/api/v1/admin/users"),
        ("get", f"/api/v1/admin/users/{_MEMBER_ID}"),
        ("patch", f"/api/v1/admin/users/{_MEMBER_ID}/role"),
        ("delete", f"/api/v1/admin/users/{_MEMBER_ID}"),
        ("get", "/api/v1/admin/audit"),
    ]

    for method, path in paths:
        response = await client.request(method, path, json={"role": "user"})
        assert response.status_code == 401, f"{method.upper()} {path} 가 키 없이 열렸다"


async def test_actor_header_is_required_for_mutations(client: AsyncClient, locked) -> None:
    """**익명 관리자 행위는 받지 않는다.**

    누가 했는지 모르는 기록은 기록이 아니다. 키만으로 권한을 바꿀 수 있으면 감사
    로그가 통째로 무의미해진다.
    """
    response = await client.patch(
        f"/api/v1/admin/users/{_MEMBER_ID}/role",
        headers={"X-Admin-Key": _KEY},
        json={"role": "admin"},
    )

    assert response.status_code == 400
    assert "X-Admin-Actor" in response.json()["detail"]


# ── 잠김 방지 ──────────────────────────────────────────────────────────────


async def test_the_last_admin_cannot_be_demoted(db_session, nextauth_tables) -> None:
    """**마지막 관리자를 강등하면 아무도 못 들어온다.**

    복구 경로가 DB 직접 수정뿐인 상태를 화면 조작으로 만들 수 있으면 안 된다.
    """
    await _seed_users(db_session, admins=1)
    repo = AdminRepository(db_session)
    actor = Actor(user_id=_MEMBER_ID, email="member@example.com")

    with pytest.raises(AdminError, match="마지막 관리자"):
        await admin_service.set_role(
            db_session, repo, actor=actor, user_id=_ADMIN_ID, role="user"
        )

    assert (await repo.find_user(_ADMIN_ID)).role == "admin"


async def test_admins_cannot_demote_themselves(db_session, repo) -> None:
    """**자기 강등은 거의 항상 실수다** — 되돌리려면 방금 잃은 권한이 필요하다.

    관리자가 둘 이상이어도 막는다. 마지막 관리자 규칙만 있으면, 관리자 둘이 서로
    모르고 각자 자기를 강등해 결국 0명이 되는 경로가 열린다.
    """
    with pytest.raises(AdminError, match="자기 자신"):
        await admin_service.set_role(
            db_session, repo, actor=_ACTOR, user_id=_ADMIN_ID, role="user"
        )

    assert (await repo.find_user(_ADMIN_ID)).role == "admin"


async def test_granting_admin_is_never_blocked(db_session, repo) -> None:
    """반대 방향은 막지 않는다 — 관리자가 늘어나서 잠기는 일은 없다."""
    updated = await admin_service.set_role(
        db_session, repo, actor=_ACTOR, user_id=_MEMBER_ID, role="admin"
    )

    assert updated.role == "admin"
    assert await repo.count_admins() == 3


async def test_self_delete_is_refused(db_session, repo) -> None:
    with pytest.raises(AdminError, match="자기 계정"):
        await admin_service.delete_user(db_session, repo, actor=_ACTOR, user_id=_ADMIN_ID)

    assert await repo.find_user(_ADMIN_ID) is not None


async def test_deleting_the_last_admin_is_refused(db_session, nextauth_tables) -> None:
    """마지막 관리자는 **강등뿐 아니라 삭제로도** 사라지면 안 된다.

    강등만 막으면 우회로가 남는다 — 지우면 되기 때문이다.
    """
    await _seed_users(db_session, admins=1)
    repo = AdminRepository(db_session)
    actor = Actor(user_id=_MEMBER_ID, email="member@example.com")

    with pytest.raises(AdminError, match="마지막 관리자"):
        await admin_service.delete_user(db_session, repo, actor=actor, user_id=_ADMIN_ID)

    assert await repo.find_user(_ADMIN_ID) is not None


# ── 감사 로그 ──────────────────────────────────────────────────────────────


async def test_role_change_is_recorded(db_session, repo) -> None:
    await admin_service.set_role(
        db_session, repo, actor=_ACTOR, user_id=_MEMBER_ID, role="admin"
    )

    entries = await repo.recent_audit(10)
    assert len(entries) == 1
    entry = entries[0]
    assert entry.action == "role.grant"
    assert entry.actor_email == "admin@example.com"
    assert entry.target_email == "member@example.com"
    assert entry.detail == "user → admin"
    assert entry.ok is True


async def test_refusals_are_recorded_too(db_session, repo) -> None:
    """**거절이 로그에서 사라지면 공격을 볼 수 없다.**

    누가 마지막 관리자를 계속 강등하려 하는지는 봐야 할 신호다. 성공만 남기면
    그 시도는 존재하지 않은 일이 된다.
    """
    with pytest.raises(AdminError):
        await admin_service.set_role(
            db_session, repo, actor=_ACTOR, user_id=_ADMIN_ID, role="user"
        )

    entries = await repo.recent_audit(10)
    assert len(entries) == 1
    assert entries[0].ok is False
    assert entries[0].detail.startswith("거절:")


async def test_no_op_role_change_leaves_no_trace(db_session, repo) -> None:
    """같은 값을 다시 넣으면 기록하지 않는다.

    안 그러면 새로고침·더블클릭이 로그를 부풀려 진짜 변경이 그 사이에 묻힌다.
    """
    await admin_service.set_role(
        db_session, repo, actor=_ACTOR, user_id=_MEMBER_ID, role="user"
    )

    assert await repo.count_audit() == 0


async def test_target_email_survives_deletion(db_session, repo) -> None:
    """**지워진 계정의 기록이 읽을 수 있어야 한다.**

    id 만 남기면 삭제 로그가 "누구인지 알 수 없는 uuid" 가 된다. 그래서 이메일을
    복사해 두고, 외래키를 걸지 않는다 — 걸면 이 기록이 대상과 함께 사라진다.
    """
    await admin_service.delete_user(db_session, repo, actor=_ACTOR, user_id=_MEMBER_ID)

    entry = (await repo.recent_audit(1))[0]
    assert entry.action == "user.delete"
    assert entry.target_email == "member@example.com"
    assert await repo.find_user(_MEMBER_ID) is None


# ── 고아 없음 ──────────────────────────────────────────────────────────────


async def test_deleting_a_user_takes_their_rows(db_session, repo) -> None:
    """**회원을 지우면 그 사람의 데이터도 함께 사라진다.**

    관심종목·투자 성향은 외래키가 아니라 `owner_key` 문자열로 연결돼 있어 CASCADE 가
    처리하지 못한다. `users` 행만 지우면 고아가 남고, 그건 cleanup_orphans 가 나중에
    치워야 할 빚이 된다 — 그 스크립트 주석이 정확히 이 자리를 예고해 두었다.
    """
    owner = f"user:{_MEMBER_ID}"
    for symbol in ("005930.KS", "000660.KS"):
        await _add_watch(db_session, owner, symbol)

    report = await admin_service.delete_user(
        db_session, repo, actor=_ACTOR, user_id=_MEMBER_ID
    )

    assert report.deleted["watchlist_items"] == 2
    assert report.owned_rows == 2

    left = (
        await db_session.execute(
            text("select count(*) from watchlist_items where owner_key = :owner"),
            {"owner": owner},
        )
    ).scalar_one()
    assert left == 0, "지운 회원의 관심종목이 고아로 남았다"


async def test_other_owners_are_untouched(db_session, repo) -> None:
    """이웃한 소유자의 행을 건드리지 않는가. 접두사 매칭의 고전적 사고다."""
    await _add_watch(db_session, f"user:{_OTHER_ADMIN_ID}", "005930.KS")

    await admin_service.delete_user(db_session, repo, actor=_ACTOR, user_id=_MEMBER_ID)

    left = (
        await db_session.execute(text("select count(*) from watchlist_items"))
    ).scalar_one()
    assert left == 1


async def test_watchlist_count_is_reported_before_deletion(db_session, repo) -> None:
    """삭제 확인 화면이 **무엇이 함께 사라지는지** 말할 수 있어야 한다."""
    await _add_watch(db_session, f"user:{_MEMBER_ID}", "005930.KS")

    row = await repo.find_user(_MEMBER_ID)

    assert row.watchlist_count == 1


# ── users 를 못 읽을 때 ─────────────────────────────────────────────────────


async def test_missing_users_table_is_not_an_empty_list(db_session) -> None:
    """**"사용자가 하나도 없다" 와 "판단할 수 없다" 는 다르다.**

    백엔드와 프런트가 서로 다른 Supabase 를 보던 시기가 실제로 있었다(15회차).
    그때 이 구분이 없으면 관리자 화면이 "회원 0명" 을 정상처럼 보여준다.
    """
    repo = AdminRepository(db_session)

    with pytest.raises(UsersUnavailable):
        await admin_service.list_users(repo)


async def test_endpoint_translates_unavailable_to_503(
    client: AsyncClient, locked
) -> None:
    """요청이 잘못된 것이 아니라 서버가 판단할 수 없는 상태다 — 4xx 가 아니다."""
    response = await client.get("/api/v1/admin/users", headers=locked)

    assert response.status_code == 503


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("get", "/api/v1/admin/users", None),
        ("get", "/api/v1/admin/users/whoever", None),
        ("patch", "/api/v1/admin/users/whoever/role", {"role": "admin"}),
        ("delete", "/api/v1/admin/users/whoever", None),
    ],
)
async def test_every_user_path_gives_503_not_500(
    client: AsyncClient, locked, method: str, path: str, body: dict | None
) -> None:
    """**네 경로가 같은 답을 해야 한다.**

    예전에는 목록만 프로브를 지났다. 상세·권한변경·삭제는 프로브를 건너뛰고 곧바로
    500 을 냈고, 그러면 같은 원인에 화면이 두 가지로 답한다 — 사용자가 보는 쪽은
    대개 "백엔드에 닿지 못했습니다" 라는 **틀린 방향**이었다.
    """
    headers = {**locked, "X-Admin-Actor": "tester"}
    response = await client.request(method, path, headers=headers, json=body)

    assert response.status_code == 503, response.text


async def test_probe_sees_the_columns_the_queries_use(db_session) -> None:
    """테이블만 있고 `role` 이 없는 DB — 마이그레이션이 반쪽만 적용된 상태다.

    `select 1 from users` 만 보던 프로브는 여기서 "읽을 수 있다" 로 판정하고, 곧바로
    `u.role` 이 `UndefinedColumn` 으로 터졌다. **프로브와 본 질의가 같은 것을 보지
    않으면 프로브는 통과 도장을 찍는 일밖에 하지 않는다.**
    """
    await db_session.execute(text('create table users (id uuid primary key, email text)'))

    repo = AdminRepository(db_session)

    assert await repo.users_are_readable() is False
    with pytest.raises(UsersUnavailable):
        await admin_service.list_users(repo)


# ── 운영 현황 ──────────────────────────────────────────────────────────────


async def test_ops_never_triggers_a_batch(client: AsyncClient, locked, monkeypatch) -> None:
    """**관측이 대상을 바꾸면 안 된다.**

    다른 화면(`/markets/calendar`·`/markets/screener`)은 열릴 때 배경 배치를 예약한다.
    관리자 화면이 같은 일을 하면, 현황을 보려고 새로고침할 때마다 야후를 친다 —
    그 상한이 1회 500종목이라는 것을 17회차에 실측으로 배웠다.
    """
    from app.services import snapshot_service

    scheduled: list[bool] = []
    monkeypatch.setattr(
        snapshot_service, "schedule_snapshot_refresh", lambda: scheduled.append(True)
    )

    response = await client.get("/api/v1/admin/ops", headers=locked)

    assert response.status_code == 200
    assert scheduled == [], "운영 현황 조회가 배치를 예약했다"


async def test_ops_reports_coverage_and_locks(client: AsyncClient, locked) -> None:
    response = await client.get("/api/v1/admin/ops", headers=locked)
    body = response.json()

    assert response.status_code == 200
    # 진행률 셋이 같은 분모를 공유한다 — 나란히 읽히려면 그래야 한다.
    for key in ("calendar_covered", "fundamentals_covered", "market_cap_covered"):
        assert body[key] <= body["universe_size"]
    # 자물쇠가 꺼져 있다는 사실도 값으로 나간다. 화면이 그것을 경고로 그린다.
    assert body["advice_locked"] is False
    assert body["advice_capacity"] == settings.advice_cache_size


async def test_ops_reports_last_run_and_last_failure_separately(
    client: AsyncClient, locked, db_session: AsyncSession
) -> None:
    """**둘을 함께 줘야 세 상태가 구분된다.**

    마지막 실행만 주면 "계속 성공" 과 "어제 실패했고 오늘 성공" 이 같아 보이고,
    마지막 실패만 주면 "실패가 없다" 와 "배치가 아예 돌지 않았다" 가 같아 보인다.
    후자가 더 나쁜 상태인데 로그에는 똑같이 아무것도 없다 — 그래서 이 표가 있다.
    """
    runs = BatchRunRepository(db_session)
    await runs.record("snapshot", ok=False, attempted=30, answered=1, detail="응답률 3%")
    await runs.record("snapshot", ok=True, attempted=30, answered=30, applied=12, detail="정상")

    body = (await client.get("/api/v1/admin/ops", headers=locked)).json()
    batch = next(item for item in body["batches"] if item["name"] == "snapshot")

    # 마지막 실행은 성공이다.
    assert batch["last_run_ok"] is True
    assert batch["applied"] == 12
    # 그런데 과거 실패는 그대로 남아 있다 — 되풀이되는 실패를 볼 수 있어야 한다.
    assert batch["last_failure_detail"] == "응답률 3%"
    assert batch["last_failure_at"] is not None


async def test_ops_says_nothing_ran_when_there_is_no_record(
    client: AsyncClient, locked
) -> None:
    """기록이 없으면 `last_run_at` 이 None 이다 — 화면이 "한 번도 돌지 않았다" 를 말한다."""
    body = (await client.get("/api/v1/admin/ops", headers=locked)).json()
    batch = next(item for item in body["batches"] if item["name"] == "snapshot")

    assert batch["last_run_at"] is None
    assert batch["last_run_ok"] is None
