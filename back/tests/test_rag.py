"""RAG 계층 계약 테스트.

Postgres·임베딩 호출 없이 도는 부분만 덮는다. 네트워크 왕복은 `scripts/verify_rag.py`가
맡는다 (LLM 경로에서 `verify_llm.py`가 하는 역할과 같다).

여기서 지키려는 계약은 셋이다.
    1. 청크 경계는 문장·문단에서만 끊긴다
    2. 융합 순위는 결정적이고, 두 검색기 모두에서 상위인 문서가 앞에 온다
    3. 벡터 DB가 없으면 조용히 빈손으로 돌아온다 — 예외가 위로 새지 않는다
"""

import pytest

from app.core.config import settings
from app.domain.chunking import split_text
from app.schemas.stock import AnalystReport, NewsItem, StockContent
from app.services import rag_service

# --- 청크 -------------------------------------------------------------------


def test_short_text_stays_one_chunk() -> None:
    assert split_text("한 문장짜리 뉴스다.", size=900) == ["한 문장짜리 뉴스다."]


def test_chunks_respect_size_and_sentence_boundaries() -> None:
    sentences = [f"{i}번째 문장이며 적당한 길이를 가진다." for i in range(20)]
    chunks = split_text(" ".join(sentences), size=120, overlap=0)

    assert len(chunks) > 1
    assert all(len(chunk) <= 120 for chunk in chunks)
    # 문장이 반토막 나지 않았는지 — 모든 조각이 온전한 문장으로 끝난다.
    assert all(chunk.endswith(".") for chunk in chunks)


def test_overlap_repeats_the_tail() -> None:
    text = " ".join(f"문장 {i} 입니다." for i in range(12))
    chunks = split_text(text, size=80, overlap=20)

    assert len(chunks) > 1
    # 앞 청크의 꼬리가 다음 청크 앞에 그대로 다시 나타난다 (경계에 걸친 내용 보호).
    assert chunks[1].startswith(chunks[0][-20:].strip())


def test_oversized_sentence_is_not_cut() -> None:
    """한 문장이 상한보다 길어도 자르지 않는다. 잘린 조각은 검색에 걸리지 않는다."""
    long_sentence = "가" * 300 + "."
    assert split_text(long_sentence, size=100) == [long_sentence]


def test_empty_text_yields_nothing() -> None:
    assert split_text("   \n\n  ", size=900) == []


# --- 융합 -------------------------------------------------------------------


def test_fusion_prefers_documents_ranked_high_by_both() -> None:
    vector = [10, 20, 30]
    keyword = [30, 20, 40]

    fused = [doc_id for doc_id, _ in rag_service.fuse([vector, keyword])]

    # 20 은 양쪽에서 2위·2위, 30 은 3위·1위, 10 은 1위·없음.
    # 두 목록 모두에 있는 20·30 이 한쪽에만 있는 10·40 보다 앞선다.
    assert fused[:2] == [30, 20]
    assert set(fused[2:]) == {10, 40}


def test_fusion_is_deterministic_on_ties() -> None:
    """동점은 id 오름차순. 같은 입력에 같은 순서가 나와야 결과를 재현할 수 있다."""
    assert [doc_id for doc_id, _ in rag_service.fuse([[7, 3]], k=60)] == [7, 3]
    assert [doc_id for doc_id, _ in rag_service.fuse([[3], [7]], k=60)] == [3, 7]


def test_fusion_of_nothing_is_empty() -> None:
    assert rag_service.fuse([]) == []
    assert rag_service.fuse([[], []]) == []


# --- 비활성 경로 -------------------------------------------------------------


_CONTENT = StockContent(
    symbol="005930.KS",
    news=[NewsItem(title="실적 발표", summary="영업이익이 늘었다.", url="https://example.com/1")],
    reports=[AnalystReport(title="목표주가 상향", summary="투자의견 매수.")],
)


async def test_disabled_rag_returns_no_documents(monkeypatch: pytest.MonkeyPatch) -> None:
    """VECTOR_DATABASE_URL 이 없으면 판단은 예전 경로 그대로 간다."""
    monkeypatch.setattr(settings, "vector_database_url", None)

    documents = await rag_service.documents_for_advice("005930.KS", "삼성전자", _CONTENT)

    assert documents == []


async def test_vector_db_failure_is_absorbed(monkeypatch: pytest.MonkeyPatch) -> None:
    """DB가 죽어도 AI 판단은 계속돼야 한다 — 예외가 위로 새면 stage 0 에러가 된다."""
    monkeypatch.setattr(settings, "vector_database_url", "postgresql://x:y@example.com:6543/db")

    async def exploding_index(symbol: str, content: StockContent):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(rag_service, "index_content", exploding_index)

    assert await rag_service.documents_for_advice("005930.KS", "삼성전자", _CONTENT) == []


async def test_timeout_is_absorbed(monkeypatch: pytest.MonkeyPatch) -> None:
    """느린 벡터 DB가 판단 응답을 함께 늦추면 안 된다."""
    import asyncio

    monkeypatch.setattr(settings, "vector_database_url", "postgresql://x:y@example.com:6543/db")
    monkeypatch.setattr(settings, "rag_timeout_seconds", 0.05)

    async def slow_index(symbol: str, content: StockContent):
        await asyncio.sleep(5)

    monkeypatch.setattr(rag_service, "index_content", slow_index)

    assert await rag_service.documents_for_advice("005930.KS", "삼성전자", _CONTENT) == []


def test_index_content_groups_chunks_by_document() -> None:
    """뉴스·리포트가 각각 하나의 doc_key 로 묶이고, 제목이 본문 앞에 붙는지."""
    grouped = rag_service._chunks_of("005930.KS", _CONTENT)

    assert len(grouped) == 2  # 뉴스 1 + 리포트 1
    chunks = [chunk for chunks in grouped.values() for chunk in chunks]
    assert {chunk.doc_type for chunk in chunks} == {"news", "report"}
    assert any(chunk.content.startswith("실적 발표") for chunk in chunks)


def test_doc_key_is_stable_and_url_based() -> None:
    """같은 기사는 몇 번을 수집해도 같은 키여야 재임베딩을 건너뛴다."""
    first = rag_service._doc_key("005930.KS", "https://example.com/1", "제목")
    again = rag_service._doc_key("005930.KS", "https://example.com/1", "다른 제목")
    other = rag_service._doc_key("005930.KS", "https://example.com/2", "제목")

    assert first == again  # URL 이 정체성이다
    assert first != other


def test_doc_key_without_url_is_scoped_to_symbol() -> None:
    """URL 이 없는 기사는 제목으로 식별하되, 종목이 다르면 다른 문서다."""
    assert rag_service._doc_key("005930.KS", "", "동일 제목") != rag_service._doc_key(
        "000660.KS", "", "동일 제목"
    )
