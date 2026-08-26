"""RAG 경로 라이브 검증 겸 최초 부트스트랩.

`verify_llm.py`와 같은 역할이다 — 테스트로 덮을 수 없는 "네트워크 왕복"(Supabase 연결,
임베딩 호출, 벡터 검색)을 한 번에 확인한다. 통과하면 AI 판단의 검색 증강 경로가
검증된 것과 같다.

    uv run python -m scripts.verify_rag            # 기본 종목(005930)으로 확인
    uv run python -m scripts.verify_rag 000660     # 종목 지정

(`-m`으로 실행해야 프로젝트 루트가 sys.path에 올라 `app` 패키지를 찾는다.)

첫 실행은 스키마 생성까지 겸한다 — `ensure_schema()`가 확장·테이블·인덱스를 멱등으로
만들기 때문에, Supabase SQL 편집기에서 따로 DDL을 붙여 넣을 필요가 없다.

각 단계는 독립적으로 실패 원인을 좁힌다:
    1. 설정          VECTOR_DATABASE_URL 이 있는지, 어떻게 정규화됐는지
    2. 연결 + 스키마  Supabase 에 닿는지, vector/pg_trgm 확장을 만들 권한이 있는지
    3. 임베딩        GEMINI_API_KEY 로 임베딩 모델을 부를 수 있는지, 차원이 맞는지
    4. 색인          뉴스·리포트가 청크로 저장되는지
    5. 검색          하이브리드 검색이 문서를 돌려주는지
"""

import asyncio
import sys
from urllib.parse import urlsplit, urlunsplit

from app.core.config import settings
from app.core.logging import configure_logging
from app.core.vector_database import get_engine, normalize_url
from app.repositories.document_chunk import DocumentChunkRepository
from app.schemas.stock import StockHistoryParams
from app.services import rag_service, stock_service

_DEFAULT_SYMBOL = "005930"


def _ok(label: str, detail: str = "") -> None:
    print(f"  [PASS] {label}" + (f" - {detail}" if detail else ""))


def _fail(label: str, exc: BaseException, hint: str) -> None:
    print(f"  [FAIL] {label}")
    print(f"         {type(exc).__name__}: {exc}")
    print(f"         → {hint}")


def _masked(url: str) -> str:
    """비밀번호를 지운 접속 문자열. 로그·스크린샷에 그대로 남아도 되게 한다."""
    parts = urlsplit(url)
    if not parts.hostname:
        return url
    user = parts.username or ""
    netloc = f"{user}:***@" if user else ""
    netloc += parts.hostname + (f":{parts.port}" if parts.port else "")
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


def check_settings() -> bool:
    print("1. 설정")
    # 주소는 `vector_database_dsn` 이 정한다 — VECTOR_DATABASE_URL 이 없으면 주
    # DB(Postgres)를 그대로 쓴다. 여기서 settings.vector_database_url 만 보면
    # 실제로는 켜져 있는 RAG 를 "꺼져 있다" 고 보고한다.
    dsn = settings.vector_database_dsn
    if not dsn:
        print("  [FAIL] 벡터 저장소 주소가 없습니다")
        print("         → DATABASE_URL 을 Supabase Postgres 로 두면 그것을 그대로 쓴다.")
        print("           벡터만 다른 인스턴스로 뺄 때만 VECTOR_DATABASE_URL 을 채운다.")
        print("           (연결 풀러 6543 포트를 권장 - 서버리스/재시작에 강하다)")
        return False

    source = (
        "VECTOR_DATABASE_URL" if settings.vector_database_url else "DATABASE_URL (주 DB 공유)"
    )
    url, connect_args = normalize_url(dsn)
    _ok("주소 출처", source)
    _ok("접속", _masked(url))
    _ok("connect_args", ", ".join(sorted(connect_args)) or "(없음)")
    _ok("임베딩", f"{settings.embedding_model} · {settings.embedding_dimensions}차원")
    return True


async def check_connection() -> DocumentChunkRepository | None:
    print("2. 연결 + 스키마")
    engine = get_engine()
    if engine is None:
        print("  [FAIL] 엔진을 만들지 못했습니다 (위 로그 참고)")
        return None

    repository = DocumentChunkRepository(engine)
    try:
        await repository.ensure_schema()
        count = await repository.count()
    except Exception as exc:
        _fail(
            "ensure_schema",
            exc,
            "확장 생성 권한이 없으면 Supabase SQL 편집기에서 "
            "`create extension if not exists vector;` 와 `pg_trgm` 을 먼저 실행한다. "
            "비밀번호에 @ 나 특수문자가 있으면 URL 인코딩이 필요하다.",
        )
        return None

    _ok("document_chunks", f"기존 {count:,}청크")
    return repository


async def check_embedding() -> bool:
    print("3. 임베딩 호출")
    from app.integrations.llm import embed_texts

    try:
        vectors = await embed_texts(["삼성전자 실적 전망"])
    except Exception as exc:
        _fail(
            "embed_texts",
            exc,
            "GEMINI_API_KEY 를 확인한다. 401/403 이면 키가 폐기됐거나 이 API 권한이 없다.",
        )
        return False

    if len(vectors[0]) != settings.embedding_dimensions:
        expected = settings.embedding_dimensions
        print(f"  [FAIL] 차원 불일치 - 응답 {len(vectors[0])} ≠ 설정 {expected}")
        print("         → EMBEDDING_DIMENSIONS 를 맞추거나 테이블을 다시 만든다.")
        return False

    _ok("embed_texts", f"{len(vectors[0])}차원")
    return True


async def check_index_and_search(symbol: str) -> bool:
    print(f"4. 색인 ({symbol})")
    try:
        stock_data = await stock_service.get_history(
            StockHistoryParams(symbol=symbol, timeframe="day", limit=5), include_content=False
        )
        content = await stock_service.get_content(stock_data.symbol)
    except Exception as exc:
        _fail("뉴스 수집", exc, "yfinance 조회 실패다. RAG 문제가 아니라 상류 문제다.")
        return False

    if not content.news and not content.reports:
        print("  [WARN] 수집된 뉴스·리포트가 0건 - 색인할 것이 없다. 다른 종목으로 시도한다.")
        return False

    try:
        result = await rag_service.index_content(stock_data.symbol, content)
    except Exception as exc:
        _fail("index_content", exc, "임베딩 또는 upsert 실패다. 위 단계 로그를 본다.")
        return False

    _ok("index_content", f"신규 {result.indexed}청크 · 기존 {result.skipped}문서 건너뜀")

    print("5. 하이브리드 검색")
    query = rag_service.build_query(stock_data.name, stock_data.symbol)
    try:
        documents = await rag_service.retrieve(stock_data.symbol, query)
    except Exception as exc:
        _fail(
            "retrieve",
            exc,
            "word_similarity/<% 연산자에서 실패하면 pg_trgm 확장이 없는 것이고, "
            "`<=>` 에서 실패하면 vector 확장이 없는 것이다.",
        )
        return False

    if not documents:
        print("  [WARN] 검색 결과 0건 - 방금 색인한 문서가 최신성 필터에 걸렸을 수 있다")
        print(f"         (RAG_RECENCY_DAYS={settings.rag_recency_days}일)")
        return False

    _ok("retrieve", f"{len(documents)}건")
    for doc in documents:
        print(f"         {doc.doc_id} [{doc.score:.4f}] {doc.published_at} {doc.title[:52]}")
    return True


async def main() -> int:
    # 윈도우 기본 콘솔은 cp949 라 일부 기호에서 UnicodeEncodeError 로 죽는다.
    # 진단 스크립트가 진단 대상보다 먼저 죽으면 곤란하다.
    sys.stdout.reconfigure(errors="replace")
    configure_logging()
    symbol = sys.argv[1] if len(sys.argv) > 1 else _DEFAULT_SYMBOL
    print(f"RAG 검증 - top_k={settings.rag_top_k}, 후보={settings.rag_candidate_k}\n")

    if not check_settings():
        return 1
    if await check_connection() is None:
        return 1
    if not await check_embedding():
        return 1

    searched = await check_index_and_search(symbol)

    from app.core.vector_database import dispose_vector_engine
    from app.integrations.llm import close_client

    await close_client()
    await dispose_vector_engine()

    print()
    if searched:
        print("전부 통과. AI 판단이 이제 검색된 문서를 근거로 쓴다.")
        print("확인:")
        print(
            '  curl -s -X POST -H "content-type: application/json" '
            f"-d '{{\"symbol\":\"{symbol}\"}}' "
            "http://127.0.0.1:8000/api/v1/stocks/advice"
        )
        print('  → agents[*].sources 가 비어 있지 않으면 근거가 붙은 것이다.')
        return 0

    print("위 [FAIL]/[WARN] 항목을 먼저 처리한다.")
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
