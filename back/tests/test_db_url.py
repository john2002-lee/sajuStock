"""Postgres 접속 문자열 정규화 (`core/db_url.py`).

이 파일이 중요한 이유는 하나다. **여기가 틀리면 앱이 DB에 아예 못 붙는다.** 그런데
실패가 접속하는 시점에 나므로, 접속하지 않는 단위 테스트는 전부 초록인 채로 배포에서
처음 드러난다. 그래서 실제 Supabase 문자열 형태를 그대로 넣고 결과를 고정한다.

접속하지 않는다 — 순수 문자열 변환이라 네트워크가 필요 없고, 그래야 Supabase 가
꺼져 있어도 이 계약이 검증된다.
"""

from app.core.db_url import (
    is_pooler,
    is_postgres,
    normalize_url,
)

# Supabase 대시보드 > Project Settings > Database > Connection string 이 주는 형태.
# (값은 가짜다)
_TRANSACTION_POOLER = (
    "postgresql://postgres.abcd:pw@aws-0-ap-northeast-2.pooler.supabase.com"
    ":6543/postgres?sslmode=require"
)
_SESSION_POOLER = (
    "postgresql://postgres.abcd:pw@aws-0-ap-northeast-2.pooler.supabase.com"
    ":5432/postgres?sslmode=require"
)
#: Postgres 가 아닌 주소. 이 코드베이스에서 SQLite 는 **거부 대상으로만** 등장한다 —
#: 실행 경로에는 없고, 여기와 `test_postgres_dialect` 의 자물쇠 테스트가 그것을 지킨다.
_NOT_POSTGRES = "sqlite+aiosqlite:///./stock.db"


def test_driver_is_added_for_asyncpg() -> None:
    """SQLAlchemy 는 드라이버를 알아야 한다. `postgresql://` 만으로는 psycopg 를 찾는다."""
    url, _ = normalize_url(_TRANSACTION_POOLER)

    assert url.startswith("postgresql+asyncpg://")


def test_explicit_driver_is_not_overwritten() -> None:
    """이미 드라이버를 적어 둔 사람의 의도를 덮지 않는다."""
    url, _ = normalize_url("postgresql+asyncpg://u:p@host:5432/db")

    assert url.startswith("postgresql+asyncpg://")


def test_sslmode_is_stripped_but_tls_is_kept() -> None:
    """`sslmode` 는 libpq 전용이다 — asyncpg 에 넘기면 TypeError 가 난다.

    그렇다고 TLS 를 끄면 안 되므로 파라미터는 버리고 **ssl 인자로 바꿔** 넘긴다.
    이 둘을 함께 하지 않으면 "연결은 되는데 평문" 이거나 "아예 안 붙거나" 둘 중 하나다.
    """
    url, connect_args = normalize_url(_TRANSACTION_POOLER)

    assert "sslmode" not in url
    assert connect_args["ssl"] is not None


def test_require_encrypts_without_verifying() -> None:
    """`sslmode=require` 는 libpq 에서 "암호화하되 CA 는 검증하지 않는다" 는 뜻이다.

    예전에는 원격이면 무조건 검증 컨텍스트를 만들었다. 그건 libpq 보다 엄격해서
    Supabase 가 준 URL 을 그대로 붙여넣으면 실패했다 — 풀러가 **자체 서명 CA** 를
    쓰기 때문이다(실측: CERTIFICATE_VERIFY_FAILED: self-signed certificate).
    규약을 우리가 바꿔 쓸 이유가 없다.
    """
    _, connect_args = normalize_url(_TRANSACTION_POOLER)

    assert connect_args["ssl"] == "require"


def test_verify_full_uses_a_verifying_context() -> None:
    """검증까지 원하면 그렇게 적는다 — 그때는 진짜로 검증한다."""
    import ssl as ssl_module

    _, connect_args = normalize_url(
        _TRANSACTION_POOLER.replace("sslmode=require", "sslmode=verify-full")
    )

    assert isinstance(connect_args["ssl"], ssl_module.SSLContext)


def test_sslmode_disable_turns_tls_off() -> None:
    _, connect_args = normalize_url(
        _TRANSACTION_POOLER.replace("sslmode=require", "sslmode=disable")
    )

    assert "ssl" not in connect_args


def test_remote_without_sslmode_still_encrypts() -> None:
    """원격 DB 를 평문으로 두는 것이 검증을 건너뛰는 것보다 나쁘다."""
    _, connect_args = normalize_url("postgresql://u:p@db.example.com:5432/postgres")

    assert connect_args["ssl"] == "require"


def test_transaction_pooler_disables_prepared_statements() -> None:
    """6543 은 PgBouncer 다. 세션마다 백엔드가 바뀌므로 프리페어드 캐시를 켜 두면
    `prepared statement _pg_N already exists` 로 깨진다.

    **캐시가 둘이라 둘 다 꺼야 한다** — asyncpg 자체(`statement_cache_size`)와
    SQLAlchemy asyncpg 방언(`prepared_statement_cache_size`)은 별개다.
    """
    url, connect_args = normalize_url(_TRANSACTION_POOLER)

    assert connect_args["statement_cache_size"] == 0
    assert "prepared_statement_cache_size=0" in url
    assert is_pooler(_TRANSACTION_POOLER)


def test_session_pooler_keeps_prepared_statements() -> None:
    """5432 세션 풀러는 커넥션을 붙들고 있어 프리페어드가 정상 동작한다.

    여기까지 캐시를 끄면 이유 없이 느려진다 — 포트로 갈리는 것이 핵심이다.
    """
    url, connect_args = normalize_url(_SESSION_POOLER)

    assert "statement_cache_size" not in connect_args
    assert "prepared_statement_cache_size" not in url
    assert not is_pooler(_SESSION_POOLER)


def test_localhost_does_not_force_tls() -> None:
    """로컬 Postgres 는 대개 TLS 를 안 켠다. 강제하면 개발 환경이 안 붙는다."""
    _, connect_args = normalize_url("postgresql://u:p@localhost:5432/db")

    assert "ssl" not in connect_args


def test_non_postgres_is_rejected() -> None:
    """`is_postgres` 는 설정 검증과 벡터 DSN 판정의 기준이다.

    이게 헐거워지면 `sqlite://` 가 설정 검증을 통과하고, 그때부터 방언 차이가
    런타임에 흩어져 나타난다.
    """
    assert not is_postgres(_NOT_POSTGRES)
    assert not is_postgres("")
    assert not is_postgres(None)
    assert is_postgres(_TRANSACTION_POOLER)
    assert is_postgres("postgresql+asyncpg://u:p@h/db")


def test_alembic_uses_the_same_normalization_as_the_app(monkeypatch) -> None:
    """alembic 이 앱과 **같은 정규화**를 거치는지.

    예전에는 `to_sync_url` 로 psycopg 용 주소를 따로 만들었다. 지금 alembic 은 async
    엔진(asyncpg)으로 돌므로 변환이 하나뿐이고, 그래서 여기서 확인할 것도 하나다:
    앱이 붙는 주소와 마이그레이션이 붙는 주소가 같은 함수에서 나오는가.

    갈라지면 "앱은 붙는데 alembic 만 안 붙는" 상태가 되고, 스키마가 코드보다 뒤처진
    채로 오래 간다.
    """
    from app.core.config import settings

    monkeypatch.setattr(settings, "database_url", _TRANSACTION_POOLER)
    url, connect_args = normalize_url(settings.database_url)

    assert url.startswith("postgresql+asyncpg://")
    # 풀러 뒤라 프리페어드 캐시가 양쪽 다 꺼져 있어야 한다.
    assert "prepared_statement_cache_size=0" in url
    assert connect_args["statement_cache_size"] == 0


def test_vector_dsn_falls_back_to_main_database(monkeypatch) -> None:
    """`VECTOR_DATABASE_URL` 이 없으면 주 DB(Postgres)를 그대로 쓴다.

    두 곳에 같은 주소를 적어 두면 한쪽만 바꿔 어긋난다. 주소를 따로 두는 것이
    필수였던 시절은 주 DB 가 pgvector 를 올릴 수 없던 때뿐이고, 지금은 선택이다.
    """
    from app.core.config import settings

    monkeypatch.setattr(settings, "vector_database_url", None)
    monkeypatch.setattr(settings, "database_url", _TRANSACTION_POOLER)
    assert settings.vector_database_dsn == _TRANSACTION_POOLER
    assert settings.rag_enabled

    # Postgres 가 아니면 벡터 저장소가 될 수 없다 — pgvector 확장을 못 올린다.
    monkeypatch.setattr(settings, "database_url", _NOT_POSTGRES)
    assert settings.vector_database_dsn is None
    assert not settings.rag_enabled


def test_explicit_vector_url_wins(monkeypatch) -> None:
    """벡터만 다른 인스턴스로 빼고 싶을 때를 위해 변수를 남겨 뒀다."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "database_url", _SESSION_POOLER)
    monkeypatch.setattr(settings, "vector_database_url", _TRANSACTION_POOLER)

    assert settings.vector_database_dsn == _TRANSACTION_POOLER


def test_thinking_is_only_sent_to_models_that_accept_it() -> None:
    """`thinking_config` 는 gemini-2.5/3 정식 모델만 받는다.

    안 받는 모델에 붙여 보내면 **요청 자체가 400** 이라 응답을 한 줄도 못 받고,
    화면에는 "AI 판단 실패" 로만 보여 원인이 모델 선택에 있다는 것을 알기 어렵다.
    OpenAI 시절 `reasoning` 으로 같은 일이 났었다 — 프로바이더가 바뀌어도 함정은 같다.

    `-latest` 별칭을 빼는 것은 실측 근거다: `gemini-flash-latest` 는 thinkingConfig 와
    함께 보내면 400(invalid argument)이 났다.
    """
    from app.integrations.llm import supports_thinking

    assert supports_thinking("gemini-2.5-flash")
    assert supports_thinking("gemini-2.5-pro")
    assert supports_thinking("gemini-3-pro-preview")
    assert not supports_thinking("gemini-flash-latest")
    assert not supports_thinking("gemini-1.5-flash")
