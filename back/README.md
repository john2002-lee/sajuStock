# 주식 AI 분석 백엔드

FastAPI · 비동기 · Pydantic v2 · 멀티 에이전트 투자 판단.
프런트엔드 와이어프레임(`front/`)의 명세 6.1–6.4에 대응한다.

## 빠른 시작

```bash
uv sync --all-groups
cp .env.example .env          # OPENAI_API_KEY 채우기 (없으면 규칙 기반으로 동작)
uv run fastapi dev            # 개발 (자동 리로드)
uv run fastapi run            # 운영
```

진입점은 `pyproject.toml`의 `[tool.fastapi] entrypoint = "main:app"`로 고정돼 있다.
루트 `main.py`는 `app/main.py`의 앱을 재노출하기만 하고 로직을 담지 않는다.

- API 문서: http://127.0.0.1:8000/docs
- 헬스체크: http://127.0.0.1:8000/health

```bash
uv run pytest          # 테스트
uv run ruff check .    # 린트
uv run ruff format .   # 포맷
```

## 엔드포인트

전체 파라미터 · 응답 필드 · 오류 코드는 [`docs/api-spec.md`](docs/api-spec.md)에 있다.
화면을 새로 짤 때는 [`docs/api-screens.md`](docs/api-screens.md) — 화면별 호출 순서 · 성능 예산 ·
아직 없는 API를 정리했다.

| 메서드 | 경로 | 명세 | 설명 |
|---|---|---|---|
| GET | `/api/v1/markets/overview?category=` | 6.1 | 카테고리별 시장 개요 + 스파크라인 |
| GET | `/api/v1/stocks/suggestions?query=` | 6.2 | 종목명 · 코드 · 초성 자동완성 |
| GET | `/api/v1/stocks/listed-companies` | 6.2 | 상장사 목록 준비 상태 (첫 호출 지연 배너용) |
| GET | `/api/v1/stocks/history?symbol=` | 6.3 | OHLCV + SMA/볼린저밴드/교차신호 + 지표 + 뉴스 + 리포트 |
| GET | `/api/v1/stocks/content?symbol=` | 6.3 | 뉴스 · 애널리스트 리포트만 (차트 우선 로딩용) |
| GET | `/api/v1/stocks/fundamentals?symbol=` | 6.3 | PER · PBR · ROE · 배당 · 연간 실적 (종목당 15분 캐시) |
| POST | `/api/v1/stocks/advice` | 6.4 | 에이전트 3인 병렬 분석 → 최종 판단 |
| POST | `/api/v1/stocks/advice/stream` | 6.4 | 위와 동일 + 4단계 SSE 스트리밍 |
| GET | `/health` | — | 헬스체크 |

`category`: `home` · `index` · `forex` · `commodity` · `stock`
`timeframe`: `day` · `week` · `month`

오류 응답은 모두 같은 형태다:

```json
{ "error": { "code": "unsupported_timeframe", "message": "지원하지 않는 조회 단위입니다." } }
```

## 계층 구조

```
app/
├── api/           라우팅 전용 — 파라미터 수신 + 서비스 호출
├── services/      비즈니스 로직 · 오케스트레이션 · 도메인 규칙 검증
├── repositories/  DB 접근 (SQL은 여기서만 작성)
├── integrations/  외부 시스템 어댑터 (yfinance · KRX/KIND · llm.py)
├── agents/        LLM 에이전트 정의와 프롬프트
├── domain/        순수 도메인 로직 (종목 정규화 · 지표 계산 · 상수)
├── models/        SQLAlchemy ORM
├── schemas/       Pydantic v2 — API 계약 겸 계층 간 데이터 계약
├── core/          설정 · DB 엔진 · 예외 · 로깅
└── utils/         순수 유틸 (숫자 · 텍스트)
```

의존 방향은 위에서 아래로만 흐른다. `domain`과 `utils`는 앱 내부의 다른 계층을
import하지 않아 네트워크·DB 없이 단위 테스트할 수 있다.

## 설계 노트

**블로킹 경계** — yfinance는 동기 라이브러리다. `integrations/yfinance/`의 함수는 모두
동기이고, 서비스 계층이 `asyncio.to_thread`로 감싸 이벤트 루프를 막지 않는다. 반면
KRX/KIND 수집은 `httpx.AsyncClient`로 네이티브 비동기다.

**에이전트 병렬 실행** — 하위 에이전트 3인은 서로 독립적이라 `asyncio.gather`로 동시에
호출한다. 순차 호출이던 원본 대비 대기 시간이 1/3로 줄어든다.

**폴백 체인** — 각 단계가 실패해도 응답은 나온다.
상장사 목록: KRX CSV → KIND HTML → 내부 기본 종목.
투자 판단: LLM 에이전트 → 지표 규칙 기반(`agents/decision.fallback_decision`).
검색 증강: 하이브리드 검색 → 문서 없이 진행(`services/rag_service`).
모든 폴백 전환은 WARNING 로그를 남긴다 — 조용히 삼키지 않는다.

**DB는 Postgres(Supabase) 전용** — SQLite 지원을 걷어냈다. 개발과 운영이 다른 방언
위에서 돌면 차이가 운영에서만 드러나기 때문이다(실제로 `ORDER BY ... DESC`의 NULL
위치가 정반대라 등락률 랭킹 모집단이 조용히 뒤집혔다). `sqlite://`를 넣으면 설정 검증이
기동 시점에 막는다. **테스트도 Postgres에서만 돈다** — `TEST_DATABASE_URL`(`DATABASE_URL`과
다른 프로젝트, 세션 풀러 5432)이 없으면 하네스가 시작하지 않는다. 인메모리 SQLite 폴백은
걷어냈다: 그 폴백이 막으려던 종류의 사고를 스스로 냈기 때문이다(실패한 문장이 트랜잭션을
중단시키는지 여부가 갈려, `orphan_service`의 `users` 탐침이 세션을 죽이는 결함이 264개
초록 뒤에 숨어 있었다).

**프런트와 같은 DB를 본다** — `front/.env.local`의 `AUTH_DATABASE_URL`과 `DATABASE_URL`은
같은 Supabase 프로젝트여야 한다. 갈리면 `services/orphan_service`가 로그인 사용자의 행을
전부 "소유자 없음"으로 읽는다.

**벡터 DB 분리** — RAG는 주 DB와 **엔진**을 공유하지 않는다(주소는 같을 수 있다).
벡터 쪽 장애가 앱 세션 풀로 번지지 않게 하기 위해서다. 다만 `document_chunks` 스키마
자체는 `models/document_chunk.py`의 ORM 모델이 단일 출처이고 alembic이 관리한다 —
`vector(N)`과 HNSW·트라이그램 인덱스는 `pgvector.sqlalchemy.Vector`와
`postgresql_using`/`postgresql_ops`로 전부 표현된다.

**예외 처리** — 서비스·통합 계층은 `HTTPException`을 던지지 않는다. `core/exceptions.py`의
도메인 예외를 던지고 HTTP 매핑은 등록된 핸들러가 담당한다. 덕분에 서비스 계층을
FastAPI 없이 테스트할 수 있다.

**검색 정규화** — `search_name` / `search_symbol` / `initial_consonants`를 컬럼으로
저장해 필터링을 SQL로 내린다. 순위 계산만 파이썬에서 한다.

## LLM 설정

프로바이더는 **Gemini**(공식 `google-genai` SDK, 비동기 클라이언트), 기본 모델은
`gemini-2.5-flash`다. 최종 판단은 `response_schema=InvestmentDecision` + JSON
MIME 타입으로 스키마가 검증된 구조화 출력을 받는다 (`generate_content`).

**앱에서 LLM SDK를 import하는 파일은 `app/integrations/llm.py` 하나뿐이다.** 에이전트
계층은 `ask_text` / `ask_structured` 두 함수만 보므로 프로바이더 교체 시 이 파일만
바꾸면 된다 — Anthropic → OpenAI → **Gemini** 교체 때 실제로 이 파일과 설정 몇 줄만
바뀌었다.

`GEMINI_API_KEY`를 비워두면 SDK가 `GOOGLE_API_KEY`/`GEMINI_API_KEY` 환경 변수를
그대로 읽는다. 아무것도 없으면 에이전트 호출이 실패하고 규칙 기반 판단으로 자동
폴백한다(응답은 200, `agents[*].status`가 `"fallback"`).

`LLM_EFFORT`는 추론 강도다. OpenAI 는 `low~max` 라벨을 그대로 받지만 Gemini 는
"생각에 쓸 토큰 예산"(`thinking_config.thinking_budget`)을 받으므로, `llm.py`의
`_THINKING_BUDGET` 표가 라벨을 토큰 수로 옮긴다(`max` 는 `-1`, 즉 모델이 알아서
정하는 동적 예산). 그 예산은 `LLM_MAX_TOKENS`와 **함께** 소모되므로, 상한을 낮게
두면 생각만 하다 본문이 빈 채로 끝나고(`MAX_TOKENS`) WARNING 로그가 남는다.

키를 넣은 뒤 `uv run python -m scripts.verify_llm`으로 자격 증명 → 자유 서술 →
구조화 출력 3단계를 한 번에 확인할 수 있다.

### LLM 경로 검증

자격 증명 없이도 에이전트 배선은 `tests/test_agents.py`가 덮는다 — SDK 호출 경계만
대체하고 병렬 실행·폴백 전환·라벨 매핑을 모두 검증한다.

키를 넣은 뒤에는 네트워크 왕복을 한 번 확인한다:

```bash
uv run python -m scripts.verify_llm
```

3단계가 각각 독립적으로 실패 원인을 좁힌다 (자격 증명·모델 접근 → 요청 형태 →
구조화 출력). 통과하면 마지막으로 실제 엔드포인트에서 `agents[*].status`가 모두
`"done"`인지 확인한다 — `"fallback"`이면 LLM이 아니라 규칙 기반으로 답한 것이다.

## RAG (검색 증강)

에이전트에게 넘길 뉴스·리포트를 **최신순이 아니라 관련도순**으로 고른다. 최신 3건을
그대로 넣던 방식은 지수 편입 공지가 실적 악화 기사를 밀어내는 문제가 있었다.

```
수집(yfinance) → 청킹 → 임베딩 → pgvector 적재
                                      ↓
질의 ──┬─ 벡터 검색(의미)   ─┐
       └─ 키워드 검색(어휘) ─┴─ RRF 융합 → 상위 K → 프롬프트 + 인용
```

두 검색기를 함께 쓰는 이유는 맹점이 서로 다르기 때문이다. 벡터는 "실적 부진"과
"어닝 쇼크"를 묶지만 종목코드·수치에 약하고, 트라이그램은 그 반대다. 점수 스케일이
전혀 다르므로 정규화해 더하지 않고 **순위만 쓰는 RRF**로 합친다.

| 설정 | 뜻 |
|---|---|
| `VECTOR_DATABASE_URL` | Supabase URI. **비우면 RAG만 꺼지고 나머지는 그대로 동작한다** |
| `EMBEDDING_MODEL` · `EMBEDDING_DIMENSIONS` | 테이블의 `vector(N)`이 후자로 만들어진다 |
| `RAG_CANDIDATE_K` → `RAG_TOP_K` | 검색기별 후보 수 → 융합 후 프롬프트에 넣는 수 |
| `RAG_RECENCY_DAYS` | 이보다 오래된 문서는 검색하지 않는다 |
| `RAG_TIMEOUT_SECONDS` | 색인+검색 전체 예산. 넘기면 문서 없이 판단한다 |

Supabase URI는 **그대로 붙여넣으면 된다**. `postgres://` 접두, `?sslmode=require`,
6543 풀러(프리페어드 스테이트먼트 금지)는 `core/vector_database.py`가 정규화한다.

최초 1회 실행이 스키마 생성(확장·테이블·HNSW 인덱스)까지 겸한다:

```bash
uv run python -m scripts.verify_rag            # 기본 종목(005930)
uv run python -m scripts.verify_rag 000660     # 종목 지정
```

5단계가 실패 지점을 좁힌다 (설정 → 연결·스키마 → 임베딩 → 색인 → 검색). 통과 뒤
`POST /stocks/advice`의 `agents[*].sources`가 비어 있지 않으면 근거가 붙은 것이다.

**인용은 검증한다.** 에이전트는 `AnalystOutput.cited_doc_ids`로 doc_id를 돌려주고,
`analysts.resolve_sources()`가 실제 검색 결과에 없는 ID를 버린다 — 모델이 지어낸
출처가 화면에 "근거"로 뜨는 것이 근거가 없는 것보다 나쁘다.

**RAG 실패는 판단 실패가 아니다.** 미설정·연결 실패·타임아웃 모두 빈 문서 목록으로
흡수되고, 그때 프롬프트의 근거 규칙이 "문서가 없으면 뉴스를 언급하지 말라"로 작동한다.

## 운영

```bash
docker compose up --build     # API 만. DB는 .env 의 Supabase 를 그대로 본다
```

DB 컨테이너는 없다. 예전에는 `postgres:17-alpine`을 함께 띄웠는데, 그러면 컨테이너로
띄운 앱과 로컬에서 띄운 앱이 다른 DB를 보게 되고 그 이미지에는 pgvector가 없어 RAG가
컨테이너에서만 조용히 죽는다. 주소는 `.env` 하나가 정한다.

스키마는 alembic이 관리한다.

```bash
uv run alembic upgrade head   # document_chunks 포함
uv run alembic check          # 모델과 DB가 어긋났는지
```

`DB_CREATE_ALL_ON_STARTUP`의 **코드 기본값은 `false`다** — 환경변수를 빠뜨린 배포가
안전한 쪽으로 떨어져야 한다. `create_all`이 마이그레이션과 별개로 테이블을 만들면
이력이 어긋나고, 그 상태는 되돌리기 어려운 데다 조용하다. 그래서 `true`로 켜더라도
`alembic_version`이 있는 DB에서는 **기동을 거부한다**.

빈 DB에서 시작하는 절차는 이것뿐이다 — `create_all`은 거치지 않는다:

```bash
uv run alembic upgrade head   # 리비전 10개. 뿌리(b0d3a1c7e594)가 listed_companies 를 만든다
uv run alembic check          # 모델과 DB 가 어긋났는지 (drift 0 이 기준선)
```

## 남은 정리 작업

지금은 없다. 직전까지 남아 있던 것들:

- ~~`_legacy/`~~ — `app/`으로 이관이 끝난 원본(`finance.py` 1,331줄) 보관소. 대조가
  끝나 폴더째 지웠다. 이관 매핑표가 필요하면 git 이력에 있다.
- ~~alembic 도입~~ — `document_chunks`까지 포함해 alembic이 관리한다.
- ~~미사용 의존성 정리~~ — `bcrypt`·`pyjwt`·`fastapi-pagination`과 동기 Postgres 드라이버
  3종(`psycopg2-binary`·`psycopg[binary]`·`psycopg2`)을 걷어냈다. 전부 import되는 곳이
  없었고, 비바이너리 `psycopg2`는 리눅스 휠이 없어 slim 이미지 빌드를 깨뜨렸다.
- ~~`front/.env.local.example`의 역방향 경고~~ — `AUTH_DATABASE_URL`이 `DATABASE_URL`과
  같은 Supabase여야 한다는 경고를 양쪽에 넣었다.

`GEMINI_MODEL=gemini-3-flash-preview`는 확인 결과 문제없다 — `verify_llm`이 thinking
지원(출력 상한 65,536)을 보고했고 `LLM_EFFORT`가 그대로 적용된다. `.env.example`이
경고하는 것은 `-latest` 같은 **별칭**이고, 이 모델은 거기 해당하지 않는다.
