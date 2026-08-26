"""Postgres 접속 문자열 정규화. 주 DB·벡터 DB가 함께 쓴다.

## 왜 정규화가 필요한가

Supabase 대시보드가 주는 문자열을 **그대로 붙여넣을 수 있어야 한다.** 그런데 그
문자열은 libpq(psql·psycopg) 기준이고 우리는 asyncpg 를 쓴다. 셋이 어긋난다.

    postgresql://postgres.<ref>:PW@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require
    └── ①                                                                    └── ②   └── ③

  ① `postgresql://` → SQLAlchemy 는 드라이버를 알아야 한다 (`+asyncpg`)
  ② 6543 은 **트랜잭션 풀러**(PgBouncer)다. 세션마다 백엔드가 바뀌므로 프리페어드
     스테이트먼트를 캐시하면 `prepared statement _pg_N already exists` 로 깨진다
  ③ `sslmode` 는 libpq 전용이다. asyncpg 에 넘기면 TypeError 가 난다

## 왜 파일로 뺐나

예전에는 이 로직이 `vector_database.py` 안에만 있었다. 주 DB 가 로컬 SQLite 라
필요가 없었기 때문이다. 주 DB 를 Supabase 로 옮기는 순간 **같은 처리가 양쪽에 필요**해졌고,
한쪽에만 있으면 "벡터 검색은 되는데 앱이 DB에 못 붙는" 상태가 된다.

지금은 주 DB·벡터 DB·alembic 셋이 모두 이 파일을 지난다. `is_postgres` 가 남아 있는
것은 설정 검증(`config.Settings._must_be_postgres`)과 벡터 DSN 판정에 쓰이기 때문이고,
접속 경로에는 더 이상 방언 분기가 없다.

동기 드라이버용 변환(`to_sync_url`)은 없다. alembic 이 psycopg 로 돌던 시절의 유물인데,
지금은 alembic 도 async 엔진(asyncpg)을 쓰므로(`alembic/env.py`) 부르는 곳이 하나도
없었다. 동기 경로가 다시 필요해지면 그때 그 소비자와 함께 되살린다.
"""

import ssl
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

#: 트랜잭션 풀러(PgBouncer) 포트. 여기서는 프리페어드 스테이트먼트를 못 쓴다.
POOLER_PORTS = {"6543"}
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
#: asyncpg 가 모르는 libpq 전용 파라미터. 남겨 두면 연결 시 TypeError.
_LIBPQ_ONLY_PARAMS = {
    "sslmode",
    "pgbouncer",
    "options",
    "target_session_attrs",
    "channel_binding",
}


def is_postgres(raw: str | None) -> bool:
    if not raw:
        return False
    return urlsplit(raw).scheme.split("+", 1)[0] in {"postgres", "postgresql"}


def _tls_for(sslmode: str | None, host: str) -> object | None:
    """`sslmode` 를 asyncpg 의 ssl 인자로 옮긴다.

    **libpq 의 의미를 그대로 따른다.** 예전에는 원격이면 무조건 검증 컨텍스트를
    만들었는데, 그건 libpq 보다 엄격해서 Supabase 가 준 URL 을 그대로 붙여넣으면
    연결이 실패했다:

        sslmode=require 인데 CERTIFICATE_VERIFY_FAILED: self-signed certificate

    Supabase 풀러는 **자체 서명 CA** 를 쓴다. libpq 에서 `require` 는 "암호화하되
    인증서는 검증하지 않는다" 는 뜻이고, 검증까지 원하면 `verify-ca`/`verify-full`
    을 쓰는 것이 규약이다. 우리가 그 규약을 바꿔서 쓸 이유가 없다.

    검증이 필요하면 URL 에 `sslmode=verify-full` 을 적고, 필요하면 Supabase 가
    배포하는 CA 인증서를 시스템 신뢰 저장소에 넣는다.
    """
    mode = (sslmode or "").strip().lower()

    if mode == "disable":
        return None
    if mode in {"verify-ca", "verify-full"}:
        return ssl.create_default_context()
    if mode in {"allow", "prefer", "require"}:
        # asyncpg 는 문자열 "require" 를 "암호화하되 검증하지 않음" 으로 받는다.
        return "require"

    # sslmode 가 없을 때. 로컬은 대개 TLS 를 안 켜므로 끄고, 원격은 켜되 검증까지
    # 요구하지는 않는다 — 원격 DB 를 평문으로 두는 것이 더 나쁘다.
    return None if not host or host in _LOCAL_HOSTS else "require"


def normalize_url(raw: str) -> tuple[str, dict[str, object]]:
    """접속 문자열을 asyncpg용으로 고치고 connect_args를 함께 만든다.

    이미 `postgresql+asyncpg://` 로 적혀 있어도 그대로 통과한다 — 드라이버를 직접
    적어 둔 사람의 의도를 덮지 않는다.

    Returns:
        (SQLAlchemy URL, create_async_engine 에 넘길 connect_args)
    """
    parts = urlsplit(raw.strip())

    scheme = parts.scheme
    if scheme in {"postgres", "postgresql"}:
        scheme = "postgresql+asyncpg"

    query = [
        (key, value)
        for key, value in parse_qsl(parts.query)
        if key not in _LIBPQ_ONLY_PARAMS
    ]

    connect_args: dict[str, object] = {}

    host = (parts.hostname or "").lower()
    tls = _tls_for(dict(parse_qsl(parts.query)).get("sslmode"), host)
    if tls is not None:
        connect_args["ssl"] = tls

    # 풀러 뒤에서는 양쪽 캐시를 모두 끈다 — asyncpg 자체 캐시(statement_cache_size)와
    # SQLAlchemy asyncpg 방언의 캐시(prepared_statement_cache_size)는 별개다.
    if is_pooler(raw):
        connect_args["statement_cache_size"] = 0
        query.append(("prepared_statement_cache_size", "0"))

    url = urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
    return url, connect_args


def is_pooler(raw: str) -> bool:
    """트랜잭션 풀러 뒤인가. 포트로 판별한다 (Supabase 는 6543)."""
    return str(urlsplit(raw.strip()).port or "") in POOLER_PORTS
