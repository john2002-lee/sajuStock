"""검색 증강(RAG) 스키마."""

from pydantic import BaseModel, Field

DocType = str  # "news" | "report" — 소스가 늘어날 예정이라 Literal로 좁히지 않는다


class DocumentChunk(BaseModel):
    """색인 단위 한 건. 임베딩 이전의 형태다."""

    symbol: str
    doc_type: DocType
    # 원문 1건의 안정적인 식별자(URL 해시). 같은 기사를 다시 수집해도 같은 값이라
    # 재임베딩 없이 건너뛸 수 있다.
    doc_key: str
    chunk_index: int
    title: str = ""
    publisher: str = ""
    url: str = ""
    published_at: str = ""
    content: str


class RetrievedDoc(BaseModel):
    """검색 결과 한 건. 프롬프트에 넣는 형태이자 화면의 '근거' 항목이다."""

    # 프롬프트에서 인용할 짧은 ID ("D1"). 모델이 URL 대신 이걸 인용하게 해서
    # 인용 문자열을 우리가 검증·매핑할 수 있게 한다.
    doc_id: str
    title: str
    publisher: str = ""
    url: str = ""
    published_at: str = ""
    snippet: str
    # RRF 융합 점수. 절대값에 의미는 없고 정렬용이다.
    score: float = 0.0


class DocRef(BaseModel):
    """에이전트가 실제로 인용한 문서. 화면의 '근거:' 줄에 그대로 쓰인다."""

    title: str
    publisher: str = ""
    url: str = ""
    published_at: str = ""


class RagStatus(BaseModel):
    """운영 확인용 요약."""

    enabled: bool
    indexed_chunks: int = 0
    embedding_model: str = ""
    detail: str = ""


class IngestResult(BaseModel):
    indexed: int = Field(default=0, description="새로 임베딩·저장한 청크 수")
    skipped: int = Field(default=0, description="이미 색인돼 있어 건너뛴 문서 수")
