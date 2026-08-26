"""RAG 전용 Postgres(pgvector) 엔진.

주 DB 엔진(`core/database.py`)과 **분리한다.** 주소가 같은 Supabase 를 가리키더라도
그렇다. 이유는 둘이다.

1. RAG는 **없으면 없는 대로 돌아가야 한다.** 벡터 저장소가 비어 있거나 죽어 있어도
   종목 상세·AI 판단은 그대로 나와야 하므로, 실패를 이 경계 안에 가둔다
   (`get_engine()`이 None을 돌려주면 호출부는 문서 없이 진행한다). 주 엔진을 함께
   쓰면 벡터 쪽 장애가 앱 전체의 세션 풀로 번진다.
2. 벡터 테이블은 `Base.metadata` 밖에 있다. `vector(N)` 타입과 HNSW·트라이그램
   인덱스는 SQLAlchemy 모델로 표현할 수 없어 원시 SQL로 만들고
   (`repositories/document_chunk.ensure_schema`), 그래서 수명주기가 다르다.

Supabase가 주는 URI를 **그대로** 붙여넣을 수 있게 정규화를 여기서 흡수한다.
그 문자열은 `postgresql://...?sslmode=require` 형태인데 asyncpg는 `sslmode`를
모르고(TypeError), 6543 풀러는 프리페어드 스테이트먼트를 허용하지 않는다.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.db_url import normalize_url

logger = logging.getLogger(__name__)

_engine: AsyncEngine | None = None
_engine_failed = False


def get_engine() -> AsyncEngine | None:
    """벡터 DB 엔진. 미설정이거나 생성에 실패하면 None (= RAG 비활성).

    주소는 `settings.vector_database_dsn` 이 정한다 — `VECTOR_DATABASE_URL` 이 없으면
    **주 DB(Postgres)를 그대로 쓴다.** 엔진은 그래도 따로 만든다: 벡터 쿼리는 원시 SQL
    이고 실패를 이 경계 안에 가둬야 하는데, 주 엔진을 공유하면 여기서 난 오류가
    앱 세션까지 흔든다. NullPool 이라 커넥션을 붙들고 있지도 않는다.
    """
    global _engine, _engine_failed

    dsn = settings.vector_database_dsn
    if _engine is not None:
        return _engine
    if _engine_failed or not dsn:
        return None

    try:
        url, connect_args = normalize_url(dsn)
        _engine = create_async_engine(
            url,
            echo=settings.db_echo,
            # 풀러가 이미 커넥션을 관리한다. 여기서 또 풀을 잡으면 유휴 커넥션이
            # 이중으로 쌓이고, Supabase 무료 티어의 연결 상한에 먼저 닿는다.
            poolclass=NullPool,
            connect_args=connect_args,
        )
    except Exception as exc:  # noqa: BLE001 - 주소가 틀렸다고 서버가 못 뜨면 안 된다
        _engine_failed = True
        logger.warning("벡터 DB 엔진 생성 실패 (%s) → RAG 없이 동작합니다", exc)
        return None

    logger.info(
        "벡터 DB 엔진 준비 (model=%s, dim=%d)",
        settings.embedding_model,
        settings.embedding_dimensions,
    )
    return _engine


async def dispose_vector_engine() -> None:
    global _engine, _engine_failed
    if _engine is not None:
        await _engine.dispose()
        _engine = None
    _engine_failed = False
