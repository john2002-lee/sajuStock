"""문서 청크 저장·검색 (pgvector).

조회에 ORM 을 쓰지 않고 원시 SQL 을 쓰는 이유: 벡터 연산자(`<=>`)와 트라이그램
연산자(`<%`)는 SQLAlchemy 표현식으로 옮기면 오히려 읽기 어려워진다. 하이브리드
검색은 SQL 자체가 명세다.

**스키마는 별개다.** 테이블 정의는 `models/document_chunk.DocumentChunkRow` 에 있고
alembic(`d5e8a1c60f47`)이 관리한다. 예전에는 이 파일이 원시 SQL 로 직접 만들면서
`Base.metadata` 밖에 있었는데, 그러면 alembic 이 이 테이블의 차원·인덱스 변화를
전혀 검증하지 못한다. `ensure_schema()` 는 이제 그 모델을 적용하는 얇은 경로일
뿐이고, `VECTOR_DATABASE_URL` 로 벡터를 다른 인스턴스에 둘 때만 쓰인다.
"""

import logging
from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.schemas.rag import DocumentChunk

logger = logging.getLogger(__name__)


def _as_date(value: str | None) -> date | None:
    """`'2026-08-04'` → `date`. 비었거나 형식이 다르면 None.

    **문자열 그대로 넘기면 안 된다.** SQL 이 `cast(:published_at as date)` 라
    asyncpg 가 그 파라미터를 date 로 추론하고, 문자열을 받으면 바인딩 단계에서
    터진다 — `'str' object has no attribute 'toordinal'`. SQL 캐스트는 값이 서버에
    닿은 **뒤에** 일어나므로 바인딩을 구해 주지 못한다.

    이 경로는 예전에 로컬 SQLite 로 개발하던 시절 아무도 실행해 보지 못했고(벡터
    테이블 자체가 Postgres 전용), 그래서 5회차부터 색인이 한 번도 성공한 적 없이
    남아 있었다. 개발 DB 를 Postgres 로 통일한 이유가 정확히 이런 종류다.

    형식이 다르면 예외 대신 None 이다. 공급자가 준 이상한 날짜 하나가 색인 전체를
    죽이면, 나머지 정상 기사까지 검색에서 사라진다.
    """
    text_value = (value or "").strip()
    if not text_value:
        return None
    try:
        return date.fromisoformat(text_value[:10])
    except ValueError:
        logger.debug("published_at 을 날짜로 읽지 못했습니다: %r", value)
        return None


def _vector_literal(embedding: list[float]) -> str:
    """pgvector 입력 형식. `'[0.1,0.2]'::vector` 로 캐스팅해 넘긴다."""
    return "[" + ",".join(repr(float(value)) for value in embedding) + "]"


class DocumentChunkRepository:
    """벡터 DB 접근 경계. 엔진을 받아 쓰므로 세션 의존성이 없다."""

    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    # --- 스키마 -------------------------------------------------------------

    async def ensure_schema(self) -> None:
        """확장·테이블·인덱스를 멱등으로 만든다.

        DDL 은 여기 적지 않는다. `models/document_chunk.DocumentChunkRow` 가 단일
        출처이고 이 메서드는 그 정의를 `checkfirst` 로 적용할 뿐이다 — 예전에는
        같은 스키마가 원시 SQL 로도 적혀 있어서, 한쪽만 고치면 어느 것이 진짜인지
        알 수 없었다.

        주 DB 는 alembic(`d5e8a1c60f47`)이 이미 만든다. 이 경로가 남아 있는 이유는
        `VECTOR_DATABASE_URL` 로 **벡터만 다른 인스턴스에 둘 수 있기** 때문이다.
        그 인스턴스는 주 DB 의 마이그레이션 이력 밖이라 스스로 스키마를 갖춰야 한다.
        """
        from app.models.document_chunk import DocumentChunkRow

        async with self._engine.begin() as conn:
            # 확장이 먼저다 — `vector` 없이는 `vector(N)` 컬럼 타입이 없고,
            # `pg_trgm` 없이는 gin_trgm_ops 인덱스를 만들 수 없다.
            for extension in ("vector", "pg_trgm"):
                await conn.execute(text(f"create extension if not exists {extension}"))
            await conn.run_sync(DocumentChunkRow.__table__.create, checkfirst=True)

    async def count(self, symbol: str | None = None) -> int:
        sql = "select count(*) from document_chunks"
        params: dict[str, object] = {}
        if symbol:
            sql += " where symbol = :symbol"
            params["symbol"] = symbol

        async with self._engine.connect() as conn:
            result = await conn.execute(text(sql), params)
            return int(result.scalar_one())

    # --- 적재 ---------------------------------------------------------------

    async def existing_doc_keys(self, doc_keys: list[str]) -> set[str]:
        """이미 색인된 원문 키. 재임베딩(=비용)을 건너뛰기 위한 조회다."""
        if not doc_keys:
            return set()

        async with self._engine.connect() as conn:
            result = await conn.execute(
                text("select distinct doc_key from document_chunks where doc_key = any(:keys)"),
                {"keys": doc_keys},
            )
            return {row[0] for row in result}

    async def upsert(self, chunks: list[DocumentChunk], embeddings: list[list[float]]) -> int:
        """청크를 저장한다. 같은 (doc_key, chunk_index)는 덮어쓴다.

        덮어쓰기로 두는 이유: 같은 기사가 나중에 본문이 채워진 채로 다시 수집될 수
        있다. 그때 새 내용으로 갱신되어야 검색 결과가 최신 원문을 가리킨다.
        """
        if not chunks:
            return 0
        if len(chunks) != len(embeddings):
            raise ValueError("청크 수와 임베딩 수가 다르다")

        rows = [
            {
                "symbol": chunk.symbol,
                "doc_type": chunk.doc_type,
                "doc_key": chunk.doc_key,
                "chunk_index": chunk.chunk_index,
                "title": chunk.title,
                "publisher": chunk.publisher,
                "url": chunk.url,
                # 날짜를 모르는 기사는 NULL 이다 — `_RECENCY` 는 NULL 을 통과시키므로
                # 최신성 필터에서 제외되는 것이 아니라 무조건 통과한다(의도된 동작).
                "published_at": _as_date(chunk.published_at),
                "content": chunk.content,
                "embedding": _vector_literal(embedding),
            }
            for chunk, embedding in zip(chunks, embeddings, strict=True)
        ]

        async with self._engine.begin() as conn:
            await conn.execute(
                text(
                    """
                    insert into document_chunks
                        (symbol, doc_type, doc_key, chunk_index, title, publisher, url,
                         published_at, content, embedding)
                    values
                        (:symbol, :doc_type, :doc_key, :chunk_index, :title, :publisher, :url,
                         cast(:published_at as date), :content, cast(:embedding as vector))
                    on conflict (doc_key, chunk_index) do update set
                        content = excluded.content,
                        embedding = excluded.embedding,
                        title = excluded.title,
                        publisher = excluded.publisher,
                        url = excluded.url,
                        published_at = excluded.published_at
                    """
                ),
                rows,
            )
        return len(rows)

    async def delete_symbol(self, symbol: str) -> int:
        async with self._engine.begin() as conn:
            result = await conn.execute(
                text("delete from document_chunks where symbol = :symbol"), {"symbol": symbol}
            )
            return int(result.rowcount or 0)

    # --- 검색 ---------------------------------------------------------------

    _SELECT = """
        select id, doc_type, title, publisher, url,
               coalesce(to_char(published_at, 'YYYY-MM-DD'), '') as published_at,
               content
    """
    _RECENCY = """
        and (published_at is null or published_at >= current_date - make_interval(days => :days))
    """

    async def search_vector(self, symbol: str, embedding: list[float], limit: int, days: int):
        """의미 유사도 상위 N. 코사인 거리(`<=>`)가 작을수록 가깝다."""
        sql = (
            self._SELECT
            + """
            from document_chunks
            where symbol = :symbol
            """
            + self._RECENCY
            + """
            order by embedding <=> cast(:embedding as vector)
            limit :limit
            """
        )
        async with self._engine.connect() as conn:
            result = await conn.execute(
                text(sql),
                {
                    "symbol": symbol,
                    "embedding": _vector_literal(embedding),
                    "limit": limit,
                    "days": days,
                },
            )
            return result.mappings().all()

    async def search_keyword(self, symbol: str, query: str, limit: int, days: int):
        """어휘 일치 상위 N.

        `word_similarity(질의, 본문)`을 쓴다. 일반 `similarity()`는 짧은 질의와 긴
        본문을 통째로 비교해 항상 낮게 나오는데, `word_similarity`는 질의가 본문
        **안의 어느 부분과** 닮았는지를 본다. 종목명·티커처럼 짧은 키워드가 긴 기사에
        묻히지 않게 하는 것이 목적이고, 한국어라 형태소 사전이 필요한 tsquery보다
        트라이그램이 안전하다.
        """
        sql = (
            self._SELECT
            + """
            from document_chunks
            where symbol = :symbol
              and :query <% content
            """
            + self._RECENCY
            + """
            order by word_similarity(:query, content) desc
            limit :limit
            """
        )
        async with self._engine.connect() as conn:
            result = await conn.execute(
                text(sql),
                {"symbol": symbol, "query": query, "limit": limit, "days": days},
            )
            return result.mappings().all()
