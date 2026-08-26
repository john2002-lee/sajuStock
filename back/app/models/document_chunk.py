"""문서 청크 ORM 모델 (pgvector).

## 왜 뒤늦게 모델이 됐나

이 테이블은 원래 `Base.metadata` **밖**에 있었다. `repositories/document_chunk.
ensure_schema()` 가 원시 SQL 로 만들고, alembic 은 `_FOREIGN_TABLES` 로 눈을 감았다.
`vector(N)` 타입과 HNSW·트라이그램 인덱스를 SQLAlchemy 로 표현할 방법이 없다고 봤기
때문인데, `pgvector.sqlalchemy.Vector` 와 `postgresql_using`/`postgresql_ops` 로 전부
표현된다.

밖에 두는 대가가 작지 않았다. 스키마의 출처가 둘(원시 SQL·alembic)이라 어느 쪽이
최신인지 알 수 없고, alembic 은 이 테이블에 대해 **아무것도 검증하지 못한다** —
차원이 바뀌거나 인덱스가 사라져도 마이그레이션은 조용하다.

지금은 여기가 단일 출처다. `ensure_schema()` 도 이 메타데이터를 쓴다.

## 차원이 설정을 따르는 이유

`vector(N)` 의 N 은 임베딩 모델이 정한다(`EMBEDDING_DIMENSIONS`). 하드코딩하면
모델을 바꿨을 때 코드와 DB 가 어긋난 사실이 **검색 실패로만** 드러난다. 설정을 따르게
두면 `alembic check` 가 그 차이를 마이그레이션 diff 로 먼저 보여 준다.
"""

from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.models.base import Base


class DocumentChunkRow(Base):
    """뉴스·리포트 한 조각과 그 임베딩.

    같은 원문은 `(doc_key, chunk_index)` 로 유일하다 — 나중에 본문이 채워진 채로 다시
    수집되면 덮어쓴다(`DocumentChunkRepository.upsert`).
    """

    __tablename__ = "document_chunks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    doc_type: Mapped[str] = mapped_column(Text, nullable=False)
    doc_key: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    publisher: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    url: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    # 날짜를 모르는 기사는 NULL 이고, 최신성 필터가 그대로 통과시킨다.
    published_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(
        Vector(settings.embedding_dimensions), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # 이름을 명시한다. Postgres 가 자동으로 붙이는 이름(`..._doc_key_chunk_index_key`)과
    # 같아야 이미 만들어진 테이블에 대해 alembic 이 "빠진 제약" 을 보고하지 않는다.
    __table_args__ = (
        UniqueConstraint(
            "doc_key", "chunk_index", name="document_chunks_doc_key_chunk_index_key"
        ),
    )


#: 종목별 최신순 조회용. `published_at desc` 라 표현식이 필요해 클래스 밖에 둔다.
Index(
    "document_chunks_symbol_idx",
    DocumentChunkRow.symbol,
    DocumentChunkRow.published_at.desc(),
)

#: 키워드 검색(`<%` · `word_similarity`)이 쓰는 트라이그램 인덱스.
#: 한국어라 형태소 사전이 필요한 tsvector 대신 트라이그램을 쓴다.
Index(
    "document_chunks_content_trgm_idx",
    DocumentChunkRow.content,
    postgresql_using="gin",
    postgresql_ops={"content": "gin_trgm_ops"},
)

#: 의미 검색(`<=>`)이 쓰는 HNSW 인덱스.
#:
#: 문서가 없어도 미리 만들어 둔다 — 적재 후에 만들면 그 시점에 테이블 전체를 훑어
#: 잠기는데, 색인 배치가 도는 중에 그 비용을 치를 이유가 없다.
Index(
    "document_chunks_embedding_idx",
    DocumentChunkRow.embedding,
    postgresql_using="hnsw",
    postgresql_ops={"embedding": "vector_cosine_ops"},
)
