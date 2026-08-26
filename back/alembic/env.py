import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# 앱 설정과 모델을 그대로 재사용한다 — alembic.ini 에 DB 주소를 이중으로 적으면
# .env 와 어긋날 때 조용히 다른 DB 를 마이그레이션하게 된다.
from app.core.config import settings
from app.core.db_url import normalize_url

# 메타데이터 등록 — **모델을 추가하면 여기에도 반드시 넣는다.**
# 빠뜨리면 `--autogenerate` 가 DB 에는 있고 메타데이터에는 없는 테이블로 보고
# `drop_table` 을 제안한다. 그대로 실행하면 데이터가 통째로 사라진다.
#
# 여기 빠져 있던 것들: `admin_audit`·`batch_run` 은 StockProject 에서도 빠져 있었고
# (원본 확인), `saju_*` 는 사주 결제를 붙일 때 빠뜨린 것이다. 셋 다 실제로 존재하는
# 테이블이라 `--autogenerate` 를 돌리면 전부 `drop_table` 후보가 됐다.
from app.models.admin_audit import AdminAuditLog  # noqa: F401
from app.models.advice_verdict import AdviceVerdictRow  # noqa: F401
from app.models.base import Base
from app.models.batch_run import BatchRun  # noqa: F401
from app.models.document_chunk import DocumentChunkRow  # noqa: F401
from app.models.investor_profile import InvestorProfileRow  # noqa: F401
from app.models.listed_company import ListedCompany  # noqa: F401
from app.models.saju_order import (  # noqa: F401
    SajuFollowUpRow,
    SajuOrderRow,
    SajuReportRow,
)
from app.models.watchlist import WatchlistItem  # noqa: F401

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
target_metadata = Base.metadata

# .env 의 DATABASE_URL 을 단일 출처로 삼는다.
#
# **앱과 같은 정규화를 거친다.** Supabase 풀러 URI 를 그대로 넘기면 `sslmode` 에서
# TypeError 가 나 마이그레이션이 아예 시작되지 않는다 — 앱은 붙는데 alembic 만 안
# 붙는 상태가 되고, 그러면 스키마가 코드보다 뒤처진 채로 오래 간다.
_ALEMBIC_URL, _ALEMBIC_CONNECT_ARGS = normalize_url(settings.database_url)
config.set_main_option("sqlalchemy.url", _ALEMBIC_URL)

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # batch 모드(테이블 재생성)는 SQLite 의 좁은 ALTER TABLE 를 우회하기 위한
        # 장치였다. Postgres 는 ALTER 를 그대로 지원하므로 쓰지 않는다.
        include_object=_include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


#: alembic 이 **건드리면 안 되는** 테이블 — ORM 메타데이터에 없지만 살아 있어야 하는 것들.
#:
#: 이 목록이 없으면 `--autogenerate` 가 "메타데이터에 없다" 며 **drop_table 을 제안한다.**
#: 그대로 실행하면 데이터가 통째로 사라진다. 실제로 탐침을 돌려 확인한 위험이다.
#:
#: 남은 것은 NextAuth(Auth.js) 계약뿐이다 — 프런트의 `@auth/pg-adapter` 가 읽고 쓰고,
#: 스키마는 `b3f1c2d47a90` 마이그레이션이 만든다.
#:
#: `document_chunks` 는 여기 있었지만 빠졌다. pgvector 의 `vector(N)` 과 HNSW·트라이그램
#: 인덱스를 SQLAlchemy 로 표현할 수 없다고 봤기 때문인데 `pgvector.sqlalchemy.Vector` 와
#: `postgresql_using`/`postgresql_ops` 로 전부 표현된다 (`models/document_chunk.py`).
#: 이제 alembic 이 그 테이블의 차원·인덱스 변화까지 diff 로 잡는다.
_FOREIGN_TABLES = {
    "users",
    "accounts",
    "sessions",
    "verification_token",
}


def _include_object(obj, name, type_, reflected, compare_to) -> bool:
    """자동 생성 대상에서 남의 테이블을 뺀다."""
    if type_ == "table" and name in _FOREIGN_TABLES:
        return False
    # 그 테이블에 달린 인덱스·제약도 함께 뺀다.
    parent = getattr(obj, "table", None)
    return not (parent is not None and parent.name in _FOREIGN_TABLES)


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=_include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """In this scenario we need to create an Engine
    and associate a connection with the context.

    """

    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        # TLS 컨텍스트·프리페어드 캐시 설정은 URL 에 담을 수 없어 따로 넘긴다.
        connect_args=_ALEMBIC_CONNECT_ARGS,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""

    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
