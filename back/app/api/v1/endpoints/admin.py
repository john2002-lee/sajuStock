"""관리자 엔드포인트 — 회원 관리와 운영 현황.

## 전 라우터가 잠겨 있다

`dependencies=[Depends(require_admin_key)]` 를 라우터에 건다. 엔드포인트마다 붙이는
방식(`AdviceKeyGuard`)과 다른 선택인데, 이유가 있다: **여기서는 잠금이 기본이어야
한다.** 새 엔드포인트를 추가하면서 가드를 빠뜨리면 그 하나만 공개되고, 그 사실은
아무 오류도 내지 않는다. AI 판단 쪽은 잠글 것이 둘뿐이라 시그니처에 보이는 편이
나았지만, 여기는 반대다.

## 이 키가 "관리자 인증" 은 아니다

누가 관리자인지는 프런트가 세션과 `users.role` 로 판단한다. 이 키는 그 판단을
우회해 백엔드를 직접 두드리는 것을 막는 2차 방어선이다 (`api/auth.require_admin_key`).
그래서 `actor` 를 헤더로 받는다 — **백엔드는 그것을 검증하지 않으며**, 검증된 것으로
취급해서도 안 된다. 감사 로그에 "프런트가 이렇게 주장했다" 를 적을 뿐이다.
"""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.api.auth import require_admin_key
from app.api.deps import BatchRunRepo, DbSession, ListedCompanyRepo
from app.repositories.admin import AdminRepository, AdminUserRow
from app.schemas.admin import (
    AdminUser,
    AdminUserPage,
    AuditEntry,
    AuditPage,
    BatchStatus,
    DeleteResult,
    OpsSnapshot,
    RoleUpdate,
)
from app.services import admin_service
from app.services.admin_service import Actor, AdminError, UsersUnavailable

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin_key)],
)


def get_admin_repository(db: DbSession) -> AdminRepository:
    return AdminRepository(db)


AdminRepo = Annotated[AdminRepository, Depends(get_admin_repository)]


async def get_actor(
    x_admin_actor: Annotated[
        str | None,
        Header(
            alias="X-Admin-Actor",
            description="행위자 사용자 ID. 프런트 BFF 가 세션에서 옮겨 붙인다.",
        ),
    ] = None,
    x_admin_actor_email: Annotated[
        str | None, Header(alias="X-Admin-Actor-Email", description="행위자 이메일.")
    ] = None,
) -> Actor:
    """행위자. **인증이 아니라 기록용이다.**

    백엔드는 이 값을 검증할 수 없다 — 세션은 프런트에 있다. 그래서 이 헤더는
    "누가 했는지" 를 감사 로그에 남기기 위한 것이고, 그 이상의 권한을 주지 않는다.
    `X-Owner-Key` 가 "인증이 아니라 식별" 인 것과 같은 자세다.

    **없으면 거절한다.** 익명으로 남는 관리자 행위는 감사 로그의 의미를 통째로
    없앤다 — 누가 했는지 모르는 기록은 기록이 아니다.
    """
    actor_id = (x_admin_actor or "").strip()
    if not actor_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "행위자(X-Admin-Actor)가 필요합니다. 감사 로그에 남길 수 없는 요청은 받지 않습니다.",
        )
    return Actor(user_id=actor_id[:64], email=(x_admin_actor_email or "").strip()[:320] or None)


ActorHeader = Annotated[Actor, Depends(get_actor)]


def _to_user(row: AdminUserRow) -> AdminUser:
    return AdminUser(
        id=row.id,
        email=row.email,
        name=row.name,
        image=row.image,
        role=row.role if row.role in admin_service.ROLES else "user",
        email_verified=row.email_verified,
        watchlist_count=row.watchlist_count,
        has_profile=row.has_profile,
        active_sessions=row.active_sessions,
    )


def _translate(error: AdminError) -> HTTPException:
    """서비스의 거절을 HTTP 로 옮긴다.

    `UsersUnavailable` 만 503 이다 — 그건 요청이 잘못된 것이 아니라 **서버가 판단할
    수 없는 상태**이고, 대개 백엔드와 프런트가 서로 다른 DB 를 보고 있다는 뜻이다.
    나머지 거절(마지막 관리자·자기 강등)은 요청이 규칙에 걸린 것이므로 409 다.
    """
    if isinstance(error, UsersUnavailable):
        return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error))
    return HTTPException(status.HTTP_409_CONFLICT, str(error))


@router.get("/ops", response_model=OpsSnapshot, summary="운영 현황")
async def get_ops(listings: ListedCompanyRepo, runs: BatchRunRepo) -> OpsSnapshot:
    """배치 진행률 · **배치 실행 기록** · AI 캐시 · 자물쇠 상태.

    **배치를 돌리지 않는다.** 다른 화면(`/markets/calendar`·`/markets/screener`)은
    열릴 때 배경 배치를 예약하지만, 관리자 화면은 관측이 목적이라 관측 행위가
    대상을 바꾸면 안 된다. 야후 상한(1회 ~500종목)도 그 판단을 뒷받침한다.

    진행률(`*_covered`)과 실행 기록(`batches`)은 다른 질문에 답한다 — 앞은 "지금까지
    얼마나 채웠나", 뒤는 "그 채우는 일이 **돌고 있나**" 다. 커버리지가 며칠째 같은
    숫자일 때 그것이 정상인지 배치가 죽은 것인지는 뒤쪽만 답할 수 있다.
    """
    snapshot = await admin_service.get_ops_snapshot(listings, runs)
    return OpsSnapshot(
        calendar_covered=snapshot.calendar_covered,
        fundamentals_covered=snapshot.fundamentals_covered,
        market_cap_covered=snapshot.market_cap_covered,
        universe_size=snapshot.calendar_universe,
        last_calendar_batch=snapshot.last_calendar_batch,
        last_fundamentals_batch=snapshot.last_fundamentals_batch,
        advice_cached=snapshot.advice_cached,
        advice_capacity=snapshot.advice_capacity,
        advice_in_flight=snapshot.advice_in_flight,
        advice_max_concurrent=snapshot.advice_max_concurrent,
        advice_locked=snapshot.advice_locked,
        rag_enabled=snapshot.rag_enabled,
        batches=[
            BatchStatus(
                name=batch.name,
                last_run_at=batch.last_run_at,
                last_run_ok=batch.last_run_ok,
                attempted=batch.attempted,
                answered=batch.answered,
                applied=batch.applied,
                detail=batch.detail,
                last_failure_at=batch.last_failure_at,
                last_failure_detail=batch.last_failure_detail,
            )
            for batch in snapshot.batches
        ],
        generated_at=snapshot.generated_at,
    )


@router.get("/users", response_model=AdminUserPage, summary="회원 목록")
async def list_users(
    repo: AdminRepo,
    q: Annotated[str, Query(max_length=200, description="이메일·이름 부분 일치")] = "",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=100000)] = 0,
) -> AdminUserPage:
    """회원 한 페이지. 관리자를 먼저, 그다음 이메일순."""
    try:
        page = await admin_service.list_users(repo, keyword=q, limit=limit, offset=offset)
    except AdminError as error:
        raise _translate(error) from error

    return AdminUserPage(
        rows=[_to_user(row) for row in page.rows],
        total=page.total,
        admin_count=page.admin_count,
        updated_at=datetime.now(UTC).isoformat(timespec="seconds"),
    )


@router.get("/users/{user_id}", response_model=AdminUser, summary="회원 상세")
async def get_user(repo: AdminRepo, user_id: str) -> AdminUser:
    """한 명. 스키마가 없으면 404 가 아니라 **503** 이다.

    둘을 구분하는 이유: 404 는 "그런 회원이 없다", 503 은 "우리가 판단할 수 없다" 다.
    후자를 404 로 내면 화면이 "없는 회원" 이라고 단정하는데, 실제로는 마이그레이션이
    안 돌았을 뿐이라 그 안내가 사람을 엉뚱한 곳으로 보낸다.
    """
    try:
        row = await admin_service.get_user(repo, user_id)
    except AdminError as error:
        raise _translate(error) from error

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "그 회원을 찾을 수 없습니다.")
    return _to_user(row)


@router.patch("/users/{user_id}/role", response_model=AdminUser, summary="권한 변경")
async def set_role(
    db: DbSession, repo: AdminRepo, actor: ActorHeader, user_id: str, body: RoleUpdate
) -> AdminUser:
    """권한을 바꾼다.

    거절 사유는 **본문 메시지로 그대로 나간다** — "마지막 관리자입니다" 같은 문장은
    화면이 다시 쓸 필요 없이 사용자에게 보여줄 수 있는 말이다. 거절도 감사 로그에
    남는다 (`services/admin_service` 주석).
    """
    try:
        row = await admin_service.set_role(
            db, repo, actor=actor, user_id=user_id, role=body.role
        )
    except AdminError as error:
        raise _translate(error) from error
    return _to_user(row)


@router.delete("/users/{user_id}", response_model=DeleteResult, summary="회원 삭제")
async def delete_user(
    db: DbSession, repo: AdminRepo, actor: ActorHeader, user_id: str
) -> DeleteResult:
    """회원과 그 사람의 데이터를 함께 지운다.

    관심종목·투자 성향은 외래키가 아니라 `owner_key` 문자열로 연결돼 있어 CASCADE 가
    처리하지 못한다. 여기서 같은 트랜잭션으로 지우지 않으면 고아가 남는다
    (`services/admin_service.delete_user` 주석).
    """
    try:
        report = await admin_service.delete_user(db, repo, actor=actor, user_id=user_id)
    except AdminError as error:
        raise _translate(error) from error

    return DeleteResult(
        deleted_watchlist=report.deleted.get("watchlist_items", 0),
        deleted_profiles=report.deleted.get("investor_profiles", 0),
    )


@router.get("/audit", response_model=AuditPage, summary="감사 로그")
async def get_audit(
    repo: AdminRepo,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> AuditPage:
    """최근 관리자 행위. 거절된 시도도 함께 나온다."""
    rows = await repo.recent_audit(limit)
    return AuditPage(
        rows=[
            AuditEntry(
                id=row.id,
                created_at=row.created_at.isoformat(),
                actor_email=row.actor_email,
                actor_user_id=row.actor_user_id,
                action=row.action,
                target_email=row.target_email,
                target_user_id=row.target_user_id,
                detail=row.detail,
                ok=row.ok,
            )
            for row in rows
        ],
        total=await repo.count_audit(),
    )
