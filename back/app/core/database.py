"""비동기 SQLAlchemy 엔진 · 세션 · FastAPI 의존성."""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.db_url import is_pooler, normalize_url


def _create_engine():
    """주 DB 엔진. Postgres 전용이다.

    접속 문자열은 항상 정규화를 거친다 (`core/db_url.py`). 정규화 없이 Supabase 풀러
    URI 를 그대로 넘기면 `sslmode` 에서 TypeError 가 나거나 프리페어드 스테이트먼트
    충돌로 깨진다 — 붙여넣기만으로 돌아가야 하는 값이라 그 처리를 여기서 흡수한다.

    방언 분기는 없다. 주소가 Postgres 인지는 설정이 이미 검증했고
    (`config.Settings._must_be_postgres`), 여기서 다시 갈래를 만들면 개발과 운영이
    다른 경로로 도는 구조가 되살아난다.
    """
    url, connect_args = normalize_url(settings.database_url)
    return create_async_engine(
        url,
        echo=settings.db_echo,
        # 풀러가 이미 커넥션을 관리한다. 여기서 또 풀을 잡으면 유휴 커넥션이 이중으로
        # 쌓여 Supabase 무료 티어의 연결 상한에 먼저 닿는다.
        poolclass=NullPool if is_pooler(settings.database_url) else None,
        pool_pre_ping=True,
        connect_args=connect_args,
    )


engine = _create_engine()

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncIterator[AsyncSession]:
    """요청 스코프 세션. 예외 시 롤백하고 종료 시 항상 닫는다."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def create_all() -> None:
    """개발 편의용 스키마 생성. 운영에서는 alembic 을 쓴다.

    **alembic 이 이미 관리하는 DB 에서는 기동을 거부한다.** 둘이 같은 DB 에 손을 대는
    것이 실제 사고의 조건이었다 — create_all 이 테이블을 선점하면 이후 `upgrade head`
    가 `relation already exists` 로 멈추거나, autogenerate 가 "차이 없음" 을 보고 빈
    마이그레이션을 낸다. 그 상태는 되돌리기 어렵고, 무엇보다 **조용하다.**

    거부를 예외로 만드는 것이 핵심이다. 경고만 남기고 계속 뜨면 아무도 안 읽는다 —
    그리고 이 조합에서 다음에 깨지는 것은 기동이 아니라 며칠 뒤의 마이그레이션이다.

    `alembic_version` 이 없는 DB(=한 번도 마이그레이션을 돌리지 않은 순수 개발 DB)
    에서는 그대로 만들어 준다. 그것이 이 기능의 유일한 정당한 용도다.
    """
    from sqlalchemy import inspect

    from app.models.base import Base

    async with engine.begin() as conn:
        tables = await conn.run_sync(lambda sync: inspect(sync).get_table_names())
        if "alembic_version" in tables:
            raise RuntimeError(
                "이 DB 는 alembic 이 관리합니다(alembic_version 존재). "
                "DB_CREATE_ALL_ON_STARTUP 을 끄고 `alembic upgrade head` 를 쓰세요 — "
                "둘을 함께 쓰면 스키마의 출처가 둘이 되고, 다음 마이그레이션이 "
                "'relation already exists' 로 멈춥니다."
            )

        await conn.run_sync(Base.metadata.create_all)


async def dispose_engine() -> None:
    await engine.dispose()
