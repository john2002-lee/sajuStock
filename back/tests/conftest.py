"""테스트 픽스처. 외부 호출은 하지 않는다.

## DB 는 Postgres 하나뿐이다

`TEST_DATABASE_URL` 은 **필수**다. 예전에는 비어 있으면 인메모리 SQLite 로 폴백했는데,
그 폴백이 정확히 막으려던 사고를 냈다 — `ORDER BY ... DESC` 의 NULL 위치가 Postgres 와
정반대라, 264개가 전부 초록인 채로 운영 랭킹이 조용히 뒤집혀 있었다. 방언이 갈리는 한
"테스트가 통과했다" 는 말이 운영에 대해 아무것도 보장하지 않는다.

    TEST_DATABASE_URL=postgresql://...@aws-0-<region>.pooler.supabase.com:5432/postgres

지켜야 할 것이 둘이다.

  ① **반드시 `DATABASE_URL` 과 다른 프로젝트.** 아래 `pg_engine` 이 drop_all 로 시작한다.
     같은 DB 를 가리키면 이 파일이 즉시 멈춘다.
  ② **세션 풀러(5432)를 쓴다.** `db_session` 이 테스트 하나 동안 커넥션 하나를 붙잡고
     트랜잭션을 열어 두기 때문이다 — 트랜잭션 풀러(6543)는 그 사이 백엔드가 바뀔 수
     있어 이 방식과 맞지 않는다.
"""

import os
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from urllib.parse import urlsplit

import pytest
import pytest_asyncio
from dotenv import load_dotenv
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.agents import analysts
from app.agents import decision as decision_agent
from app.api.deps import get_listed_company_repository
from app.core.config import settings
from app.core.database import get_db
from app.core.db_url import is_pooler, is_postgres, normalize_url
from app.integrations import llm
from app.main import create_app
from app.models.base import Base
from app.repositories.listed_company import ListedCompanyRepository
from app.services import advice_cache, fundamentals_service

# `Settings` 는 이 값을 모른다 — 테스트 하네스 전용이라 운영 설정에 넣지 않는다.
load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
TEST_DATABASE_URL = (os.environ.get("TEST_DATABASE_URL") or "").strip()

#: RAG 를 끄기 위한 "주소 없음". `is_postgres("")` 가 False 라 `vector_database_dsn`
#: 이 None 을 낸다 (`rag_off_by_default`).
_NO_VECTOR_STORE = ""

#: `SKIP_DB_TESTS` 에서 참으로 볼 값 (`pytest_collection_modifyitems`).
_TRUTHY = frozenset({"1", "true", "yes", "on"})


def _target(url: str) -> tuple[str | None, int | None, str]:
    """같은 DB 를 가리키는지 비교할 키. 자격증명·쿼리스트링은 무시한다."""
    parts = urlsplit(url)
    return (parts.hostname, parts.port, parts.path)


def require_test_database_url() -> str:
    """DB 를 실제로 쓰는 픽스처만 부른다. 검사 내용은 예전 그대로다.

    **이 검사가 모듈 최상단에서 이리로 내려온 이유.** 예전에는 import 시점에 던져서,
    `TEST_DATABASE_URL` 이 없으면 **DB 를 건드리지 않는 테스트까지 전부** 수집조차
    되지 않았다. 사주 엔진(`domain/saju/`)은 순수 계산이라 Postgres 가 필요 없는데도
    그 때문에 한 줄도 돌릴 수 없었다.

    가드의 목적은 "DB 테스트가 틀린 방언 위에서 도는 일이 없게 하는 것"이지 "아무
    테스트도 못 돌게 하는 것"이 아니다. 여기로 내리면 그 목적은 그대로다 — DB 픽스처를
    요구하는 순간 같은 메시지로 똑같이 멈춘다. **SQLite 폴백은 여전히 없다.**
    """
    if not TEST_DATABASE_URL:
        raise RuntimeError(
            "TEST_DATABASE_URL 이 없습니다. DB 를 쓰는 테스트는 Postgres 에서만 돕니다 — "
            "SQLite 폴백은 방언 차이(NULL 정렬 등)를 숨겨서 제거했습니다. DATABASE_URL 과 "
            "**다른** Supabase 프로젝트의 세션 풀러(5432) URI 를 back/.env 에 넣으세요. "
            "(사주 엔진 등 순수 계산 테스트는 이 값 없이도 돕니다.)"
        )
    if not is_postgres(TEST_DATABASE_URL):
        raise RuntimeError("TEST_DATABASE_URL 은 Postgres 여야 합니다.")
    # **운영 DB 를 겨누면 즉시 멈춘다.** 스키마 준비가 drop_all 로 시작하므로,
    # 이 검사가 없으면 오타 하나로 실 데이터가 통째로 사라진다.
    if _target(TEST_DATABASE_URL) == _target(settings.database_url):
        raise RuntimeError(
            "TEST_DATABASE_URL 이 DATABASE_URL 과 같은 DB 를 가리킵니다. "
            "테스트는 스키마를 지우고 다시 만들므로 별도 프로젝트여야 합니다."
        )
    return TEST_DATABASE_URL


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    """CI 에서 **DB 없이 도는 테스트만** 고른다. 로컬 동작은 건드리지 않는다.

    `SKIP_DB_TESTS` 가 켜져 있고 `TEST_DATABASE_URL` 이 없을 때에만 Postgres 를
    요구하는 항목에 skip 을 건다. 플래그가 없으면 이 훅은 아무 일도 하지 않으므로
    `require_test_database_url` 의 RuntimeError 가 예전과 **똑같이** 난다.

    그 조건이 두 개인 것이 핵심이다. "주소가 없으면 알아서 건너뛴다" 로 만들면,
    개발자가 `TEST_DATABASE_URL` 을 빠뜨린 채 초록을 보고 넘어가게 된다 — DB 테스트
    183개가 조용히 안 돈 상태로. 그것은 이 파일 머리말이 SQLite 폴백을 없애면서
    막으려던 것과 같은 종류의 사고다. 플래그를 켜는 곳은 배포 워크플로 하나뿐이고,
    거기서는 "DB 를 안 쓴다" 가 의도다.

    판정 기준은 **`pg_engine` 픽스처 하나** 다. DB 를 쓰는 경로는 전부 이것을 거친다
    (`db_session`→`pg_engine`, `repo`·`client`→`db_session`). 파일명 목록이나 마커로
    고르면 테스트가 추가될 때마다 목록이 어긋나고, 어긋난 쪽은 **조용히 안 도는 쪽**이다.
    """
    if TEST_DATABASE_URL:
        return
    if os.environ.get("SKIP_DB_TESTS", "").strip().lower() not in _TRUTHY:
        return

    skip_db = pytest.mark.skip(reason="TEST_DATABASE_URL 없음 (SKIP_DB_TESTS)")
    for item in items:
        if "pg_engine" in getattr(item, "fixturenames", ()):
            item.add_marker(skip_db)


@pytest.fixture(autouse=True)
def no_live_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    """**어떤 테스트도 실제 LLM 을 부르지 못하게 한다.**

    이 가드가 없어서 실제로 두 번 당했다. 그래프에 `rewrite_query` 노드가 생기면서,
    그 노드가 부르는 `ask_text` 를 아무도 대역으로 세우지 않았고 — 테스트가 조용히
    **실제 Gemini API 를 쳤다.** 무료 티어 한도(모델당 하루 20회)를 테스트 한 번에
    태우고, 429 를 받고서야 알았다.

    실패가 아니라 **예외**로 만드는 것이 핵심이다. 조용히 폴백으로 흡수되면(에이전트
    계층이 그렇게 되어 있다) 테스트는 초록인데 네트워크는 나간 상태가 그대로 유지된다.

    LLM 을 쓰는 테스트는 자기가 필요한 지점을 명시적으로 대역으로 세운다.
    """

    async def _blocked(*args: object, **kwargs: object):
        raise AssertionError(
            "테스트에서 실제 LLM 을 호출했습니다. 필요한 지점을 대역으로 세우세요 "
            "(analysts.ask_structured · decision.ask_structured · llm.ask_text 등)."
        )

    # 지연 import(`from app.integrations.llm import ask_text` 를 함수 안에서 하는 곳)는
    # 호출 시점에 모듈 속성을 읽으므로 여기 패치가 그대로 먹는다. 모듈 최상단에서
    # 이름을 가져간 곳(analysts·decision)은 그쪽 모듈도 함께 막는다.
    for module, names in (
        (llm, ("ask_text", "ask_structured", "embed_texts")),
        (analysts, ("ask_structured",)),
        (decision_agent, ("ask_structured",)),
    ):
        for name in names:
            monkeypatch.setattr(module, name, _blocked, raising=False)


@pytest.fixture(autouse=True)
def reset_fundamentals_cache() -> Iterator[None]:
    """재무 캐시는 모듈 전역이라 테스트 사이로 샌다 — 매번 비운다."""
    fundamentals_service._cache.clear()
    fundamentals_service._locks.clear()
    yield
    fundamentals_service._cache.clear()
    fundamentals_service._locks.clear()


@pytest.fixture(autouse=True)
def rag_off_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """테스트는 기본적으로 RAG 를 끈다 — **실제 벡터 DB 를 치지 않게 한다.**

    `vector_database_dsn` 이 `VECTOR_DATABASE_URL` 이 없을 때 주 DB 로 폴백하면서,
    개발자 `.env` 의 Supabase 주소가 그대로 테스트에 새어 들어왔다. 실제로 한 테스트가
    **닿지 않는 DB 덕분에** 통과하고 있었고(연결 실패 → 문서 0건), 주소를 고쳐 DB 가
    살아나는 순간 실패로 바뀌었다 — 그때까지 그 테스트는 아무것도 검증하지 않았다.

    RAG 를 쓰는 테스트는 `vector_database_url` 을 직접 설정해 **명시적으로 켠다.**

    주소를 빈 문자열로 둔다 — `vector_database_dsn` 은 `is_postgres` 로 판정하므로
    빈 값이면 None 을 내고 RAG 가 꺼진다. 예전에는 여기에 SQLite 주소를 넣어 같은
    효과를 냈는데, 그 문자열이 "테스트는 SQLite 로 돈다" 는 오해를 만들었다.
    """
    monkeypatch.setattr(settings, "vector_database_url", None)
    monkeypatch.setattr(settings, "database_url", _NO_VECTOR_STORE)


@pytest.fixture(autouse=True)
def advice_lock_off_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """AI 판단 자물쇠도 기본은 꺼진 상태로 둔다.

    같은 부류의 사고를 두 번째로 겪었다. 개발자가 `.env` 에 `ADVICE_API_KEY` 를 넣는
    순간, 그 값을 읽은 테스트 3개가 빨개졌다 — **테스트가 로컬 환경 파일에 의존하고
    있었다는 뜻**이다. 남의 기계에서 초록인지 여부가 그 사람 `.env` 에 달려 있으면
    테스트가 아니다.

    자물쇠를 검사하는 테스트는 `locked` 픽스처로 **명시적으로 켠다**
    (`test_advice_auth.py`).
    """
    monkeypatch.setattr(settings, "advice_api_key", None)


@pytest.fixture(autouse=True)
def reset_advice_cache() -> Iterator[None]:
    """AI 판단 캐시도 모듈 전역이다.

    비우지 않으면 **한 테스트가 다른 테스트를 통과시킨다** — 앞 테스트가 넣어 둔
    판단을 뒤 테스트가 캐시에서 받아 LLM 대역을 한 번도 안 부르고 초록이 된다.
    동시 실행 카운터도 함께 되돌린다: 429 를 확인하는 테스트가 상한을 채운 채
    끝나면 그 뒤 advice 테스트가 전부 429 가 된다.
    """
    advice_cache.reset_for_tests()
    yield
    advice_cache.reset_for_tests()


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def pg_engine():
    """테스트 Postgres 엔진.

    스키마는 **세션당 한 번** 만든다. 테스트마다 만들면 273개 × 왕복이 되어
    네트워크 DB 에서는 견딜 수 없다. 격리는 `db_session` 의 트랜잭션이 맡는다.
    """
    # 설정 검사는 여기서 한다 — 이 픽스처를 요구하는 것이 곧 "DB 가 필요하다" 는
    # 선언이다 (`require_test_database_url` 주석).
    database_url = require_test_database_url()

    url, connect_args = normalize_url(database_url)
    engine = create_async_engine(
        url,
        poolclass=NullPool if is_pooler(database_url) else None,
        connect_args=connect_args,
    )

    # drop → create. 앞 실행이 남긴 스키마 변경이 조용히 남아 있으면, 통과 여부가
    # "언제 마지막으로 돌렸는가" 에 달리게 된다. NextAuth 테이블은 `Base.metadata`
    # 밖이라 여기서 건드리지 않는다.
    #
    # 확장이 먼저다 — `document_chunks` 가 이제 `Base.metadata` 안에 있어서
    # (`models/document_chunk.py`), vector·pg_trgm 없이는 create_all 자체가 실패한다.
    async with engine.begin() as conn:
        for extension in ("vector", "pg_trgm"):
            await conn.execute(text(f"create extension if not exists {extension}"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(loop_scope="session")
async def db_session(pg_engine) -> AsyncIterator[AsyncSession]:
    """테스트 하나가 쓰는 세션. 끝나면 **아무것도 남기지 않는다.**

    Postgres 경로는 테이블을 비우지 않고 **바깥 트랜잭션을 롤백**한다. 273개마다
    TRUNCATE 를 돌리면 네트워크 왕복이 그만큼 늘고, 병렬 실행도 불가능해진다.

    `join_transaction_mode="create_savepoint"` 가 핵심이다. 리포지토리들이 자기
    쓰기마다 `commit()` 을 부르는데(`get_db` 가 커밋하지 않는 규약 때문이다), 그대로
    두면 바깥 트랜잭션이 끝나 버려 롤백할 것이 없어진다. 세이브포인트로 바꾸면
    커밋은 세이브포인트 해제가 되고 바깥 트랜잭션은 살아 있다.
    """
    conn = await pg_engine.connect()
    trans = await conn.begin()
    session = AsyncSession(
        bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )
    try:
        yield session
    finally:
        await session.close()
        await trans.rollback()
        await conn.close()


@pytest.fixture
def repo(db_session: AsyncSession) -> ListedCompanyRepository:
    return ListedCompanyRepository(db_session)


@pytest_asyncio.fixture(loop_scope="session")
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    """스키마 자동 생성과 실제 DB를 끄고, 테스트 세션을 주입한 앱."""
    app = create_app()

    async def override_db() -> AsyncIterator[AsyncSession]:
        yield db_session

    def override_repo() -> ListedCompanyRepository:
        return ListedCompanyRepository(db_session)

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_listed_company_repository] = override_repo

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client
