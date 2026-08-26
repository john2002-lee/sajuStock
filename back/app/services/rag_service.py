"""검색 증강(RAG) — 색인과 검색.

에이전트에게 넘길 문서를 고르는 계층이다. 이전에는 `build_context`가 "가장 최근
뉴스 3건"을 그대로 잘라 넣었다. 최신순은 관련성과 무관해서, 지수 편입 안내나 배당
기준일 공지가 실적 악화 기사보다 앞자리를 차지하는 일이 생긴다.

여기서는 두 방식으로 후보를 뽑아 융합한다.

    벡터 검색   의미가 닮은 문서 — "실적 부진"과 "어닝 쇼크"를 같이 잡는다
    키워드 검색 어휘가 겹치는 문서 — 종목명·티커·숫자처럼 임베딩이 약한 것을 잡는다

한쪽만 쓰면 각자의 맹점이 그대로 남는다. 두 순위를 RRF로 합치면 어느 한 검색기가
1위로 올린 문서가 상위에 남되, 양쪽 모두에서 상위권인 문서가 가장 앞에 온다.

**실패는 전부 흡수한다.** Supabase가 죽어 있거나 미설정이면 빈 목록을 돌려주고,
호출부는 문서 없이 예전 경로 그대로 진행한다 — RAG는 판단을 좋게 만들 뿐이지
판단이 나오는 조건은 아니다.
"""

import asyncio
import hashlib
import logging

from app.core.config import settings
from app.core.vector_database import get_engine
from app.domain.chunking import split_text
from app.repositories.document_chunk import DocumentChunkRepository
from app.schemas.rag import DocumentChunk, IngestResult, RagStatus, RetrievedDoc
from app.schemas.stock import StockContent
from app.utils.text import clean_text, format_date_text

logger = logging.getLogger(__name__)

# RRF 상수. 값이 클수록 상위 순위의 우위가 완만해진다. 60은 원 논문의 기본값이고,
# 후보가 수십 건 수준인 이 규모에서는 사실상 "1~3위를 비슷하게 존중한다"는 뜻이다.
_RRF_K = 60
_SNIPPET_CHARS = 420


def _repository() -> DocumentChunkRepository | None:
    engine = get_engine()
    return DocumentChunkRepository(engine) if engine is not None else None


def _doc_key(symbol: str, url: str, title: str) -> str:
    """원문 1건의 안정적 식별자.

    URL이 있으면 URL이 정체성이다. yfinance 뉴스는 URL이 비는 경우가 있어
    제목으로 대체하는데, 그때는 종목을 섞어 같은 제목의 다른 종목 기사가 서로를
    덮어쓰지 않게 한다.
    """
    basis = url.strip() or f"{symbol}:{title.strip()}"
    return hashlib.sha1(basis.encode("utf-8")).hexdigest()


def _chunks_of(symbol: str, content: StockContent) -> dict[str, list[DocumentChunk]]:
    """뉴스·리포트를 doc_key별 청크 목록으로 편다.

    제목을 본문 앞에 붙인다 — yfinance 요약은 한두 문장뿐이라 본문만 임베딩하면
    "무엇에 대한 글인지"가 벡터에 안 담긴다.
    """
    grouped: dict[str, list[DocumentChunk]] = {}

    sources = [("news", content.news), ("report", content.reports)]
    for doc_type, items in sources:
        for item in items:
            title = clean_text(item.title)
            body = clean_text(item.summary)
            if not title and not body:
                continue

            key = _doc_key(symbol, item.url, title)
            full_text = f"{title}\n\n{body}".strip()
            parts = split_text(
                full_text, size=settings.rag_chunk_chars, overlap=settings.rag_chunk_overlap
            )

            grouped[key] = [
                DocumentChunk(
                    symbol=symbol,
                    doc_type=doc_type,
                    doc_key=key,
                    chunk_index=index,
                    title=title,
                    publisher=clean_text(item.publisher),
                    url=clean_text(item.url),
                    published_at=format_date_text(item.published_at),
                    content=part,
                )
                for index, part in enumerate(parts)
            ]

    return grouped


async def index_content(symbol: str, content: StockContent) -> IngestResult:
    """수집한 뉴스·리포트 중 **새 것만** 색인한다.

    이미 있는 원문을 건너뛰는 것이 핵심이다. 판단 요청마다 같은 기사 열 건을 다시
    임베딩하면 비용이 요청 수에 비례해 늘어난다. 반대로 새 기사는 그 요청에서 바로
    검색 대상이 되어야 하므로, 배치를 기다리지 않고 여기서 적재한다.
    """
    repository = _repository()
    if repository is None:
        return IngestResult()

    grouped = _chunks_of(symbol, content)
    if not grouped:
        return IngestResult()

    known = await repository.existing_doc_keys(list(grouped))
    pending = [chunk for key, chunks in grouped.items() if key not in known for chunk in chunks]
    if not pending:
        return IngestResult(skipped=len(grouped))

    from app.integrations.llm import embed_texts

    embeddings = await embed_texts([chunk.content for chunk in pending])
    indexed = await repository.upsert(pending, embeddings)

    logger.info("%s 색인 %d청크 (신규 문서 %d건)", symbol, indexed, len(grouped) - len(known))
    return IngestResult(indexed=indexed, skipped=len(known))


def fuse(ranked_lists: list[list[int]], k: int = _RRF_K) -> list[tuple[int, float]]:
    """Reciprocal Rank Fusion — 여러 순위를 하나로 합친다.

    점수 스케일이 다른 검색기를 합칠 때 점수를 정규화해 더하면 스케일 가정이 코드에
    스며든다(코사인 거리와 트라이그램 유사도는 분포가 아예 다르다). RRF는 **순위만**
    쓰므로 그 가정이 필요 없다.

    Returns:
        (문서 id, 융합 점수) 내림차순. 동점은 id 오름차순으로 갈라 결과를 결정적으로 만든다.
    """
    scores: dict[int, float] = {}
    for ranked in ranked_lists:
        for rank, doc_id in enumerate(ranked):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda item: (-item[1], item[0]))


async def retrieve(symbol: str, query: str) -> list[RetrievedDoc]:
    """질의와 관련된 문서 상위 `rag_top_k`건."""
    repository = _repository()
    if repository is None or not query.strip():
        return []

    from app.integrations.llm import embed_texts

    embedding = (await embed_texts([query]))[0]

    # 두 검색은 서로를 기다릴 이유가 없다. 한쪽이 실패해도 다른 쪽 결과로 진행한다.
    candidates, days = settings.rag_candidate_k, settings.rag_recency_days
    vector_rows, keyword_rows = await asyncio.gather(
        repository.search_vector(symbol, embedding, candidates, days),
        repository.search_keyword(symbol, query, candidates, days),
        return_exceptions=True,
    )

    pool: dict[int, dict] = {}
    ranked_lists: list[list[int]] = []
    for rows in (vector_rows, keyword_rows):
        if isinstance(rows, BaseException):
            logger.warning("검색기 하나가 실패했습니다 (%s) → 나머지로 진행", rows)
            continue
        ranked_lists.append([row["id"] for row in rows])
        pool.update({row["id"]: dict(row) for row in rows})

    if not pool:
        return []

    fused = fuse(ranked_lists)[: settings.rag_top_k]
    return [
        RetrievedDoc(
            # 프롬프트에서 쓸 짧은 ID. 순서가 곧 관련도 순위라 D1이 가장 관련 높다.
            doc_id=f"D{position + 1}",
            title=pool[doc_id]["title"],
            publisher=pool[doc_id]["publisher"],
            url=pool[doc_id]["url"],
            published_at=pool[doc_id]["published_at"],
            snippet=pool[doc_id]["content"][:_SNIPPET_CHARS],
            score=round(score, 6),
        )
        for position, (doc_id, score) in enumerate(fused)
    ]


def build_query(name: str, symbol: str) -> str:
    """검색 질의.

    1단계에서는 종목 고정 질의다 — 관점별 질의 재작성은 그래프 단계에서 붙인다.
    그래도 종목명만 넣는 것보다는 낫다: 임베딩이 '무엇을 알고 싶은가'를 담아야
    지수 편입 공지 대신 실적·리스크 기사가 상위로 온다.
    """
    return f"{name}({symbol}) 실적과 주가에 영향을 주는 최근 이슈, 리스크, 투자 전망"


async def documents_for_advice(symbol: str, name: str, content: StockContent) -> list[RetrievedDoc]:
    """AI 판단 경로가 부르는 진입점. **어떤 실패도 밖으로 내보내지 않는다.**

    전체를 하나의 예산(`rag_timeout_seconds`)으로 감싼다. Supabase가 느릴 때
    판단 응답이 같이 느려지면 안 되고, 문서가 없으면 없는 대로 판단은 나와야 한다.
    """
    if not settings.rag_enabled:
        return []

    try:
        async with asyncio.timeout(settings.rag_timeout_seconds):
            if settings.rag_ingest_on_advice:
                await index_content(symbol, content)
            return await retrieve(symbol, build_query(name, symbol))
    except TimeoutError:
        logger.warning(
            "%s RAG 예산 초과 (%.1fs) → 문서 없이 진행", symbol, settings.rag_timeout_seconds
        )
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001 - RAG 실패가 판단 실패가 되면 안 된다
        logger.warning("%s RAG 실패 (%s) → 문서 없이 진행", symbol, exc)
    return []


async def status() -> RagStatus:
    """설정·연결 상태 요약. 스크립트와 운영 확인용."""
    if not settings.rag_enabled:
        return RagStatus(enabled=False, detail="VECTOR_DATABASE_URL 이 비어 있습니다")

    repository = _repository()
    if repository is None:
        return RagStatus(enabled=False, detail="벡터 DB 엔진을 만들지 못했습니다")

    try:
        count = await repository.count()
    except Exception as exc:  # noqa: BLE001
        return RagStatus(enabled=False, detail=f"연결 실패: {exc}")

    return RagStatus(
        enabled=True,
        indexed_chunks=count,
        embedding_model=settings.embedding_model,
        detail="정상",
    )
