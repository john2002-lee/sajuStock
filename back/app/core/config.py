"""환경 변수 기반 애플리케이션 설정 (Pydantic v2 BaseSettings)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.db_url import is_postgres

EffortLevel = Literal["low", "medium", "high", "xhigh", "max"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- 앱 ---
    app_name: str = "Stock AI API"
    api_v1_prefix: str = "/api/v1"
    debug: bool = False
    log_level: str = "INFO"
    # 리스트/딕트 타입은 pydantic-settings가 JSON으로 파싱한다 → .env에 JSON 배열로 기입
    cors_origins: list[str] = ["http://localhost:3000"]

    @field_validator("cors_origins")
    @classmethod
    def _cors_origins_must_not_wildcard(cls, value: list[str]) -> list[str]:
        """`main.py` 가 `allow_credentials=True` 로 이 목록을 그대로 쓴다.

        `"*"` 가 섞이면 브라우저는 와일드카드+자격증명 조합을 거부하지만, 그건
        "안전하게 막힌다" 가 아니라 "CORS 가 조용히 다 깨진다" 는 뜻이다 — 배포 중
        오타 하나가 그 상태로 넘어가지 않게 여기서 미리 막는다.
        """
        if "*" in value:
            raise ValueError(
                "CORS_ORIGINS 에 '*' 를 넣을 수 없습니다 — allow_credentials=True 와 "
                "함께 쓰면 브라우저가 요청을 전부 거부합니다. 정확한 오리진을 나열하세요."
            )
        return value

    # --- DB ---
    # **Postgres 전용이다.** 예전 기본값은 로컬 SQLite 였는데, 그러면 개발·테스트와
    # 운영이 서로 다른 방언 위에서 돌아 **차이가 운영에서만 드러난다.** 실제로 그렇게
    # 새어 나간 버그가 있었다: `ORDER BY market_cap DESC` 의 NULL 위치가 SQLite 는
    # 마지막, Postgres 는 처음이라 등락률 랭킹 모집단이 시총 미수집 종목으로 채워졌다
    # (`repositories/listed_company.top_by_market_cap`).
    #
    # 기본값은 로컬 Postgres 다. 실제 값은 `.env` 의 DATABASE_URL(Supabase)이 준다.
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"
    db_echo: bool = False
    #: 기동 때 `Base.metadata.create_all()` 로 테이블을 만들지.
    #:
    #: **기본값이 False 다. 예전에는 True 였고 그것이 두 사고의 뿌리였다.**
    #:
    #: ① 환경변수를 빠뜨린 배포가 **위험한 쪽으로** 떨어졌다. 새 DB 에서 create_all 이
    #:    테이블을 선점하면 이후 `alembic upgrade head` 가 `relation already exists` 로
    #:    멈추거나, autogenerate 가 "차이 없음" 을 보고 빈 마이그레이션을 낸다.
    #: ② 그 기본값이 **마이그레이션 사슬의 구멍을 가리고 있었다.** `listed_companies` 를
    #:    만드는 리비전이 아예 없었는데도 아무도 몰랐다 — 기동할 때마다 create_all 이
    #:    대신 만들어 줬기 때문이다(`b0d3a1c7e594` 가 그 구멍을 메웠다). 편의 기능이
    #:    스키마의 실제 출처가 되면 그 출처가 틀렸다는 사실도 함께 숨는다.
    #:
    #: 개발자는 `.env` 에서 켤 수 있다. 대신 켠 채로 뜨면 기동 로그가 경고하고,
    #: 이미 alembic 이 관리하는 DB(=`alembic_version` 이 있는 DB)에서는 **기동을
    #: 거부한다** — 그 조합이 위 ①을 만드는 정확한 조건이다 (`core/database.create_all`).
    db_create_all_on_startup: bool = False

    # --- 외부 HTTP ---
    http_timeout_seconds: float = Field(default=20.0, gt=0)

    # --- 상장사 목록 ---
    # 이 값보다 적게 저장돼 있으면 자동완성 첫 호출 때 수집을 시도한다.
    listed_company_min_count: int = Field(default=100, ge=1)
    # 검색 후보를 DB에서 가져올 때의 상한. 초과분은 경고 로그로 남긴다.
    suggestion_candidate_limit: int = Field(default=500, ge=10)
    # 시가총액 배치의 yfinance 폴백이 한 번에 채우는 종목 수.
    # KRX 벌크가 되면 쓰이지 않는다 — 종목당 1회 호출이라 상한이 필요하다.
    market_cap_batch_limit: int = Field(default=400, ge=0)
    # KRX 데이터포털 로그인. 1차 소스 pykrx 가 요구하는 것은 **API 키가 아니라
    # 회원 아이디·비밀번호**이고, pykrx 는 그것을 `os.getenv` 로 **직접** 읽는다.
    #
    # 그래서 이 두 필드는 조금 특이하다 — 앱 코드는 값을 쓰지 않는다. 여기 두는
    # 이유는 `extra="ignore"` 다. 필드가 없으면 `.env` 에 적은 값이 오타처럼 조용히
    # 버려지고, 실제로 한동안 그랬다: 설정은 채워져 있는데 배치는 매번 yfinance
    # 폴백으로 내려갔고 아무도 그 사실을 말해 주지 않았다.
    #
    # pydantic-settings 는 `.env` 를 이 객체로만 옮기고 `os.environ` 은 건드리지
    # 않는다(`dotenv_values`). 그 마지막 한 칸은
    # `integrations/krx/market_cap._prepare_pykrx()` 가 잇는다.
    krx_id: str | None = None
    krx_pw: str | None = None
    # 기동 직후 상장사 목록을 배경에서 채운다. 첫 검색·상세 요청이 KRX 수집(수 초)을
    # 기다리지 않게 하는 것이 목적이다. 테스트·오프라인에서는 끈다.
    seed_listed_companies_on_startup: bool = True

    # --- 종목 스냅샷 배치 (오늘의 일정 + 스크리너 지표) ---
    # 하루 1회 배치가 한 번에 물어볼 종목 수. 종목당 yfinance 2회(info ~0.5초 +
    # 밸류에이션 ~0.2초)이고 동시 8스레드라 200이면 20초쯤이다. 전 종목(2,700+)은
    # 며칠에 걸쳐 채워진다 — 시총 배치와 달리 **값이 만료되므로**(실적발표일이
    # 지나간다) 한 바퀴 돌면 다시 오래된 것부터 갱신한다.
    #
    # 일정과 지표를 한 배치가 함께 채운다. 나누면 같은 종목에 `get_info()` 를 두 번
    # 치게 되고, 16회차에 야후가 그것 때문에 전 종목 요청을 거부했다.
    snapshot_batch_limit: int = Field(default=200, ge=0)
    # 화면이 기본으로 보는 창(일). 너무 넓히면 '오늘의 일정'이 '이번 분기 일정'이 된다.
    calendar_default_days: int = Field(default=7, ge=1, le=90)
    # 조건 검색 한 페이지 종목 수의 기본값. 상한은 엔드포인트가 따로 건다.
    screener_page_size: int = Field(default=50, ge=1, le=100)

    # --- 등락률 랭킹 ---
    # 등락률을 스캔할 종목 수. 시가총액 상위부터 채운다 — 전 종목(2,700+)을
    # 매번 훑을 수는 없고, 상위권 밖은 등락 상위에 올라와도 의미가 옅다.
    # KRX 벌크(전 종목 한 번에)가 열리면 이 상한 자체가 불필요해진다.
    market_movers_universe_size: int = Field(default=200, ge=10, le=2000)
    # 랭킹 스냅샷 수명(초). 만료되면 다음 요청이 배경 갱신을 예약하고,
    # 그동안은 직전 스냅샷을 그대로 낸다 — 스캔이 수 초라 동기로 기다릴 수 없다.
    market_movers_ttl_seconds: int = Field(default=300, ge=0)
    # 기동 직후 랭킹을 미리 데워 첫 홈 화면이 예시 데이터로 떨어지지 않게 한다.
    warm_market_movers_on_startup: bool = True

    # --- 재무·밸류에이션 ---
    # 종목당 캐시 수명(초). ticker.info 한 번이 0.5~1.5초이고 밸류에이션·손익까지
    # 합치면 1~2초라 요청마다 부를 수 없다. 그렇다고 PER/PBR 은 주가를 따라
    # 움직이므로 하루 단위로 둘 수도 없다 — 15분이 그 사이의 타협점이다.
    stock_fundamentals_ttl_seconds: int = Field(default=900, ge=0)
    # 캐시에 담아 둘 종목 수 상한. 임의 심볼이 키라 상한이 없으면 무한히 증가한다.
    stock_fundamentals_cache_size: int = Field(default=512, ge=1)

    # --- AI 판단 캐시·상한 ---
    # 종목 하나를 분석하면 LLM 4회(에이전트 3 + 판단 1)가 나간다. 여기 있는 값들이
    # 이 프로젝트에서 **유일하게 돈이 새는 경로**의 수도꼭지다.
    #
    # 이 시간 안에는 같은 종목을 다시 물어도 **뉴스 조회조차 하지 않고** 캐시를 낸다.
    # 만료 뒤에는 뉴스 지문만 비교해서, 기사가 그대로면 LLM 없이 수명을 연장하고
    # 새 기사가 있을 때만 다시 분석한다 (advice_cache.py).
    advice_cache_ttl_seconds: int = Field(default=600, ge=0)
    # 캐시에 담아 둘 종목 수 상한. 임의 심볼이 키라 상한이 없으면 무한히 증가한다.
    advice_cache_size: int = Field(default=256, ge=1)
    # 동시에 돌릴 수 있는 분석 수. 초과 요청은 429다 — 큐에 쌓아 두면 상한이 아니라
    # 지연이 되고, LLM 호출 총량은 그대로 나간다.
    # 프런트 일괄 분석이 3개씩 여는 것을 감안한 값이다 (useBulkAdvice MAX_CONCURRENT).
    advice_max_concurrent: int = Field(default=4, ge=1)
    # 판단 한 건에 쓸 수 있는 **전체 시간**. 넘기면 에러가 아니라 그때까지 모은
    # 지표로 규칙 기반 판단을 내고 끝낸다 (`services/advice_stream`).
    #
    # 예전에는 이 값이 없었다. 그래프 주석은 "30초 안에 끝난다" 고 적어 두었지만
    # 강제하는 코드가 한 줄도 없었고, 실질 상한은 프런트의 5분짜리 fetch 타임아웃
    # 하나였다 — 그동안 동시 4슬롯 중 하나가 잡혀 다른 사용자는 429 를 받았다.
    #
    # **90 인 이유는 근거가 얇기 때문이다.** 저장소의 유일한 실측은 29.5초인데
    # 그것은 비스트리밍 경로의 LLM 4회 합이고(작업노트 20회차) 그래프 경로의
    # 1회차 실측은 아직 없다. 예산이 정상 실행의 p95 에 붙으면 안전망이 아니라
    # 조용한 품질 저하 스위치가 된다 — 넉넉히 잡고 아래 로그로 관측한 뒤 조인다.
    # 조일 근거: `"AI 판단 스트림 %.1f초"` 로그와 `decision_source=="timeout"` 비율.
    advice_budget_seconds: float = Field(default=90.0, gt=0)
    # 예산의 이 지점을 넘기면 **LLM 을 한 번 더 쓰지 않는다** — 질의 재작성도,
    # 판단 재시도도 시작하지 않는다 (`graph/advice_graph` 의 조건부 엣지).
    # 여기 있는 이유는 아래 `_llm_must_fit_the_advice_budget` 이 이 값을 봐야 하기
    # 때문이다. 서비스에 상수로 두면 검증이 그것을 볼 수 없다.
    advice_soft_ratio: float = Field(default=0.6, gt=0, lt=1)
    # SSE 주석(`: keep-alive`) 프레임 간격. 에이전트 구간은 수십 초 동안 이벤트가
    # 없는데, 중간 프록시(nginx `proxy_read_timeout` 기본 60초)는 그것을 죽은
    # 연결로 보고 끊는다. **이벤트가 아니라 주석**이라 프런트와의 4단계 계약을
    # 넓히지 않는다. 부수 효과로 uvicorn 이 끊긴 클라이언트를 감지하는 상한도
    # 이 값이 된다 — 10초마다 쓰기를 시도하기 때문이다.
    advice_heartbeat_seconds: float = Field(default=10.0, gt=0)
    # AI 판단 엔드포인트 2개를 여는 공유 비밀키. 프런트 BFF 만 알고 있고 브라우저에는
    # 나가지 않는다. **비워 두면 인증이 꺼진다** — 로컬 개발이 키 없이 돌아야 하기
    # 때문인데, 그 상태로 외부에 노출하면 누구나 토큰을 태울 수 있으므로 기동 시
    # 경고를 남긴다 (main.py lifespan).
    advice_api_key: str | None = None

    # --- 관리자 ---
    # 관리자 엔드포인트를 여는 공유 비밀키. **`ADVICE_API_KEY` 와 다른 값이어야 한다** —
    # 매 AI 요청에 실려 나가는 키가 곧 관리자 키가 되면, 가장 넓게 노출되는 값이 가장
    # 강한 권한을 갖는다 (`api/auth.require_admin_key` 주석).
    #
    # **비어 있으면 관리자 API 가 닫힌다.** `advice_api_key` 와 정반대다. 그쪽은
    # 미설정이면 열어 두는데(로컬 개발이 키 없이 돌아야 하고 잃는 것이 토큰뿐이다),
    # 여기서 같은 선택을 하면 설정을 빠뜨린 서버가 권한 부여 API 를 공개하게 된다.
    admin_api_key: str | None = None

    # --- 사주 유료 리포트 ---
    #: 리포트 가격(원). **환경변수가 아니라 코드가 정한다** — 가격은 화면·결제 요청·
    #: 승인 검증 세 곳이 반드시 같은 값을 봐야 하고, 배포마다 달라지면 그 셋이
    #: 어긋나는 순간이 생긴다. 바꿀 때는 이 한 줄을 고친다.
    saju_report_price: int = 9900

    #: 토스 시크릿 키. **비어 있으면 결제 경로 전체가 닫힌다** — 주문 생성부터
    #: 거절한다. `advice_api_key` 처럼 "없으면 열어 둔다" 로 하면 안 되는 자리다:
    #: 키 없이 열어 두면 승인할 수 없는 주문만 쌓이고, 고객은 결제창까지 갔다가
    #: 실패한다. 없으면 아예 팔지 않는 편이 정직하다.
    toss_secret_key: str | None = None

    #: 리포트 접근 토큰(HMAC)의 비밀키. 이것이 바뀌면 **이미 발급된 모든 링크가
    #: 열리지 않는다** — 토큰이 주문 id 에서 파생되기 때문이다. 배포 간에 고정해야 한다.
    saju_access_token_secret: str | None = None

    #: 유료 주문의 보관 기간(일). 이 기간이 지나면 정리 대상이다.
    #: 화면의 개인정보 문구가 같은 숫자를 말해야 한다.
    saju_order_retention_days: int = Field(default=30, ge=1)

    @property
    def saju_payment_enabled(self) -> bool:
        """결제를 팔 수 있는 상태인가.

        시크릿 키와 토큰 비밀키가 **둘 다** 있어야 한다. 토큰 비밀키가 없으면
        결제는 되는데 리포트를 열 수 없는 상태가 되므로, 하나만 있는 것은
        없는 것보다 나쁘다.
        """
        return bool((self.toss_secret_key or "").strip()) and bool(
            (self.saju_access_token_secret or "").strip()
        )

    # --- LLM (Google Gemini) ---
    # 미설정 시 SDK가 GOOGLE_API_KEY / GEMINI_API_KEY 환경 변수를 읽는다.
    gemini_api_key: str | None = None
    # 구조화 출력(responseSchema)과 thinking 을 함께 받는 계열이어야 한다.
    # `gemini-flash-latest` 같은 별칭은 thinkingConfig 에서 400 이 날 수 있어 피한다.
    gemini_model: str = "gemini-2.5-flash"
    # 생각 토큰도 이 상한을 함께 먹는다 — 너무 낮으면 본문이 빈 채로 MAX_TOKENS 로 끝난다.
    llm_max_tokens: int = Field(default=16000, ge=1024)
    llm_effort: EffortLevel = "medium"
    # **호출 하나**의 상한이다. 판단 한 건의 상한은 `advice_budget_seconds` 다.
    #
    # 45 는 실측이 아니라 아래 불변식에서 역산한 값이다. 저장소의 유일한 실측은
    # LLM 4회 합 29.5초(작업노트 20회차)라 한 호출 45초는 충분히 넉넉하다.
    llm_timeout_seconds: float = Field(default=45.0, gt=0)
    # **0 이다.** SDK 의 `attempts` 는 최초 요청을 포함한 총 시도 횟수이고
    # (google-genai `HttpRetryOptions`), 타임아웃은 시도마다 따로 걸린다.
    # 300/2 조합의 최악값은 300×3 = 900초였다.
    #
    # 낮추는 것으로는 부족해서 아예 껐다. **재시도가 이 파이프라인에서는 결과를
    # 더 나쁘게 만든다**: 에이전트 호출이 타임아웃하면 `agents/analysts` 가 그것을
    # 즉시 규칙 기반 의견으로 흡수해 1초 만에 다음 단계로 간다. 재시도를 켜 두면
    # 그 흡수가 한 호출분만큼 미뤄지는데, 그동안 fan-in 이 나머지 두 에이전트까지
    # 붙잡고 있어 판단 LLM 이 예산 안에 들어올 기회를 잃는다 — 즉 재시도가
    # "의견 3건 + LLM 판단" 을 "의견 0건 + 규칙 판단" 으로 바꾼다.
    llm_max_retries: int = Field(default=0, ge=0)

    # --- RAG (벡터 검색) ---
    # **대개 비워 둔다.** 주 DB 가 Postgres 라 그것을 그대로 벡터 저장소로 쓴다 —
    # 같은 Supabase 인스턴스가 앱 테이블과 pgvector 테이블을 함께 담는다.
    # 벡터만 다른 인스턴스로 빼고 싶을 때만 채우고, 그때는 이쪽이 이긴다.
    # Supabase의 URI를 그대로 붙여넣으면 된다 (postgres:// · sslmode · 6543 포트
    # 풀러 모두 vector_database.py 가 정규화한다).
    vector_database_url: str | None = None
    # Gemini 임베딩. `gemini-embedding-001` 은 출력 차원을 지정할 수 있어(MRL) 아래
    # embedding_dimensions 를 그대로 따른다 — 프로바이더를 바꿔도 이미 적재한
    # `vector(1536)` 테이블을 다시 만들지 않아도 됐던 이유다.
    embedding_model: str = "gemini-embedding-001"
    # 테이블 DDL의 `vector(N)`이 이 값으로 만들어진다. 색인을 만든 뒤 모델을 바꾸면
    # 차원이 어긋나 검색이 실패한다 — 그때는 테이블을 지우고 다시 적재해야 한다.
    embedding_dimensions: int = Field(default=1536, ge=64)

    # 청크 길이. 뉴스 요약은 대개 한 청크에 들어가고, 긴 리포트만 쪼개진다.
    rag_chunk_chars: int = Field(default=900, ge=200)
    rag_chunk_overlap: int = Field(default=150, ge=0)
    # 벡터·키워드 검색기가 **각각** 뽑는 후보 수. 융합 뒤 rag_top_k만 남는다.
    rag_candidate_k: int = Field(default=24, ge=1)
    rag_top_k: int = Field(default=6, ge=1)
    # 이보다 오래된 문서는 검색 대상에서 뺀다. 3개월 지난 뉴스로 오늘의 매수 판단을
    # 하면 근거처럼 보이는 헛소리가 된다.
    rag_recency_days: int = Field(default=120, ge=1)
    # 판단 요청이 들어올 때 그 종목의 새 뉴스를 색인할지. 끄면 배치·스크립트로만 채운다.
    rag_ingest_on_advice: bool = True
    # 색인+검색 전체 예산. 초과하면 문서 없이 진행한다 — RAG 때문에 판단이
    # 늦어지거나 실패하면 안 된다.
    rag_timeout_seconds: float = Field(default=15.0, gt=0)

    @field_validator("database_url")
    @classmethod
    def _must_be_postgres(cls, value: str) -> str:
        """SQLite 주소를 **기동 시점에** 막는다.

        조용히 받아 주면 앱은 뜨고 방언 차이만 런타임에 흩어져 나타난다 — 어느 쿼리가
        왜 다르게 도는지 추적하는 비용이 훨씬 크다. 여기서 한 번에 실패하는 편이 낫다.
        """
        if not is_postgres(value):
            scheme = value.split("://", 1)[0] if "://" in value else value
            raise ValueError(
                "DATABASE_URL 은 Postgres 여야 합니다. Supabase 대시보드의 풀러 URI 를 "
                f"그대로 붙여넣으면 됩니다. 받은 스킴: {scheme or '(빈 값)'}"
            )
        return value

    @model_validator(mode="after")
    def _llm_must_fit_the_advice_budget(self) -> "Settings":
        """한 번의 LLM 호출이 판단 전체의 예산을 먹어서는 안 된다.

        **이 검사가 주석이 아니라 코드인 이유가 이 프로젝트의 역사에 있다.** 그래프
        주석은 오래전부터 "30초 안에 끝난다" 고 적어 두었지만 강제하는 것이 없어서
        실제로는 5분이 걸렸고, 그것을 고치는 것이 P1-15 였다. 그리고 그 수정에서
        새로 적은 불변식(`llm_timeout_seconds < advice_budget_seconds`)도 **틀렸다** —
        호출 하나의 실제 상한은 타임아웃이 아니라 `타임아웃 × 시도 횟수` 다.
        같은 실수를 세 번째로 하지 않으려면 사람이 지키는 대신 기동이 지켜야 한다.

        소프트 지점과 비교하는 이유: 그 선을 넘으면 그래프가 LLM 을 더 쓰지 않기로
        하므로, 호출 하나가 거기까지 갈 수 있으면 소프트 저하가 발동할 기회 자체가
        없다. 그러면 사용자는 90초를 기다린 끝에 **의견 0건짜리** 규칙 판단을 받는다.
        """
        worst = self.llm_timeout_seconds * (self.llm_max_retries + 1)
        soft = self.advice_budget_seconds * self.advice_soft_ratio
        if worst > soft:
            raise ValueError(
                "LLM 호출 하나의 최악 소요가 AI 판단 예산의 소프트 지점을 넘습니다 "
                f"({self.llm_timeout_seconds:g}초 × 시도 {self.llm_max_retries + 1}회 "
                f"= {worst:g}초 > {soft:g}초). "
                "LLM_TIMEOUT_SECONDS 나 LLM_MAX_RETRIES 를 낮추거나 "
                "ADVICE_BUDGET_SECONDS 를 올리세요."
            )
        return self

    @property
    def vector_database_dsn(self) -> str | None:
        """벡터 저장소가 **실제로** 쓸 접속 문자열.

        `VECTOR_DATABASE_URL` 을 따로 두는 것은 선택이다. 주 DB 가 Postgres 이므로
        그것을 그대로 쓴다 — 같은 Supabase 인스턴스가 앱 테이블과 pgvector 테이블을
        함께 담을 수 있고, 두 곳에 같은 주소를 적어 두면 한쪽만 바꿔 어긋난다.
        벡터만 다른 인스턴스로 빼고 싶을 때만 채우고, 그때는 그쪽이 이긴다.

        `is_postgres` 검사를 남겨 둔 이유: 이 속성이 **벡터 저장소로 쓸 수 있는
        주소인가**를 판정하는 자리이기 때문이다. 설정 검증을 통과한 값만 들어온다는
        보장에 기대어 검사를 빼면, 테스트가 주소를 갈아끼우는 경로에서 pgvector 가
        아닌 DB 로 조용히 붙으려 든다.
        """
        if self.vector_database_url:
            return self.vector_database_url
        return self.database_url if is_postgres(self.database_url) else None

    @property
    def rag_enabled(self) -> bool:
        """접속 정보가 있어야 RAG를 켠다. 그 외에는 조용히 비활성이다."""
        return bool(self.vector_database_dsn)

    @property
    def krx_bulk_enabled(self) -> bool:
        """시가총액을 **전 종목 한 번에** 받을 수 있는가.

        아이디와 비밀번호가 **둘 다** 있어야 한다 — pykrx 는 하나만 있으면 로그인을
        시도조차 하지 않는다. 꺼져 있으면 배치가 yfinance 폴백(종목당 1회 호출)으로
        내려가고, 전 종목(2,700+)을 채우는 데 며칠이 걸린다.

        `rag_enabled` 와 달리 비활성이 **조용하지 않다.** 이 값이 조용히 False 였던
        것이 정확히 이 설정을 못 쓰게 만든 원인이라, 기동 로그가 말한다 (main.py).
        """
        return bool((self.krx_id or "").strip() and (self.krx_pw or "").strip())

    @property
    def advice_auth_enabled(self) -> bool:
        """키가 있어야 AI 판단 엔드포인트를 잠근다.

        `rag_enabled`와 달리 비활성이 **조용하지 않다** — 이건 기능이 아니라 자물쇠라,
        꺼져 있다는 사실을 기동 로그가 알려야 한다 (main.py).
        """
        return bool(self.advice_api_key)

    @property
    def admin_enabled(self) -> bool:
        """관리자 엔드포인트가 열려 있는가. 기동 로그가 이 값을 알린다 (main.py).

        `advice_auth_enabled` 와 뜻이 **반대**라는 점에 주의한다. 저쪽은 True 가
        "잠겼다" 이고 여기는 True 가 "쓸 수 있다" 다 — 키가 없으면 잠기는 것이
        아니라 기능 자체가 없다.
        """
        return bool((self.admin_api_key or "").strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
