# API 명세서

`back/app/api/v1/` 라우터가 노출하는 모든 엔드포인트의 실제 동작 명세다.
코드가 정본이며, 이 문서는 코드(`endpoints/` · `services/` · `schemas/` · `integrations/`)에서
확인한 동작만 기술한다.

- 기준 코드: `app/api/v1/endpoints/`(stocks · markets · watchlist · profile · admin) ·
  `app/api/auth.py` · `app/api/deps.py` · `app/core/exceptions.py` · `app/main.py`
- 범위: **오퍼레이션 29개 전부**. 목록은 1.2, 자물쇠·헤더는 1.6 에 있다.
- **화면을 새로 짤 때는 [`api-screens.md`](api-screens.md)를 본다** — 화면별로 어떤 API를 어떤
  순서로 부르는지, 성능 예산과 아직 없는 API가 정리돼 있다. 이 문서는 엔드포인트별 상세다.
- 대응 기획 문서: [`docs/product-plan.md`](../../docs/product-plan.md) 6.1–6.4 / 7장
- 자동 생성 문서: `http://127.0.0.1:8000/docs` (OpenAPI)

---

## 1. 공통 사항

### 1.1 기본 정보

| 항목 | 값 | 근거 |
|---|---|---|
| Base URL (개발) | `http://127.0.0.1:8000` | `uv run fastapi dev` |
| API prefix | `/api/v1` | `settings.api_v1_prefix` |
| 인증 | 공유 비밀키 헤더 2종 + 소유자 식별 헤더 1종 (1.6) | `api/auth.py` · `api/deps.py` |
| 요청 본문 형식 | `application/json` | POST · PUT · PATCH |
| 응답 형식 | `application/json` (스트리밍만 `text/event-stream`) | |
| CORS 허용 출처 | 기본 `http://localhost:3000`, `CORS_ORIGINS`로 변경 | `app/main.py` |

`/health`만 prefix 밖에 있고, 나머지는 전부 `/api/v1` 아래에 있다.

### 1.2 엔드포인트 목록

전 29개 오퍼레이션이다. **자물쇠** 열은 1.6 의 헤더를 가리킨다.

| # | 메서드 | 경로 | 요약 | 자물쇠 | 절 |
|---|---|---|---|---|---|
| 1 | GET | `/health` | 헬스체크 | — | 2 |
| 2 | GET | `/api/v1/markets/overview` | 카테고리별 시장 개요 | — | 3 |
| 3 | GET | `/api/v1/stocks/history` | 주가 히스토리 + 보조지표 (+뉴스·리포트) | — | 4 |
| 4 | GET | `/api/v1/stocks/content` | 종목 뉴스 · 애널리스트 리포트 | — | 5 |
| 5 | GET | `/api/v1/stocks/fundamentals` | 재무 · 밸류에이션 | — | 6 |
| 6 | GET | `/api/v1/stocks/suggestions` | 종목명 · 코드 · 초성 자동완성 | — | 7 |
| 7 | GET | `/api/v1/stocks/listed-companies` | 상장사 목록 준비 상태 | — | 8 |
| 8 | POST | `/api/v1/stocks/advice` | AI 멀티 에이전트 투자 판단 | `X-Advice-Key` · `X-Owner-Key`(선택) | 9.2 |
| 9 | POST | `/api/v1/stocks/advice/stream` | 위와 동일 + SSE 단계 스트리밍 | `X-Advice-Key` · `X-Owner-Key`(선택) | 9.3 |
| 10 | GET | `/api/v1/markets/movers` | 상승률 · 하락률 상위 | — | 10 |
| 11 | GET | `/api/v1/markets/ranking` | 시가총액 · 등락률 랭킹 (탐색 화면) | — | 11 |
| 12 | GET | `/api/v1/markets/calendar` | 오늘의 일정 (실적발표 · 배당락) | — | 12 |
| 13 | GET | `/api/v1/markets/screener` | 스크리너 (조건 검색) | — | 13 |
| 14 | GET | `/api/v1/watchlist` | 관심종목 목록 | `X-Owner-Key` | 14.1 |
| 15 | POST | `/api/v1/watchlist` | 관심종목 추가 | `X-Owner-Key` | 14.2 |
| 16 | DELETE | `/api/v1/watchlist/{code}` | 관심종목 제거 | `X-Owner-Key` | 14.3 |
| 17 | PATCH | `/api/v1/watchlist/{code}` | 그룹 · 알림 · 보유 수정 | `X-Owner-Key` | 14.4 |
| 18 | PUT | `/api/v1/watchlist/order` | 순서 변경 | `X-Owner-Key` | 14.5 |
| 19 | POST | `/api/v1/watchlist/claim` | 익명 목록을 계정으로 승계 | `X-Owner-Key` | 14.6 |
| 20 | GET | `/api/v1/profile` | 내 투자 성향 조회 | `X-Owner-Key` | 15.1 |
| 21 | PUT | `/api/v1/profile` | 투자 성향 저장 · 수정 | `X-Owner-Key` | 15.2 |
| 22 | DELETE | `/api/v1/profile` | 투자 성향 삭제 | `X-Owner-Key` | 15.3 |
| 23 | POST | `/api/v1/profile/claim` | 익명 프로파일 승계 | `X-Owner-Key` | 15.4 |
| 24 | GET | `/api/v1/admin/ops` | 운영 현황 | `X-Admin-Key` | 16.1 |
| 25 | GET | `/api/v1/admin/users` | 회원 목록 | `X-Admin-Key` | 16.2 |
| 26 | GET | `/api/v1/admin/users/{user_id}` | 회원 상세 | `X-Admin-Key` | 16.3 |
| 27 | PATCH | `/api/v1/admin/users/{user_id}/role` | 권한 변경 | `X-Admin-Key` + `X-Admin-Actor` | 16.4 |
| 28 | DELETE | `/api/v1/admin/users/{user_id}` | 회원 삭제 | `X-Admin-Key` + `X-Admin-Actor` | 16.5 |
| 29 | GET | `/api/v1/admin/audit` | 감사 로그 | `X-Admin-Key` | 16.6 |

OpenAPI 태그는 `meta`(1), `markets`(2·10–13), `stocks`(3–9), `watchlist`(14–19),
`profile`(20–23), `admin`(24–29)이다.

화면별로 **어떤 API 를 어떤 순서로** 부르는지는 [`api-screens.md`](api-screens.md) 를 본다.

### 1.3 공통 오류 응답

서비스·통합 계층은 `HTTPException`을 던지지 않는다. `app/core/exceptions.py`의 도메인 예외를
던지고, 등록된 핸들러가 아래 형태로 직렬화한다.

```json
{ "error": { "code": "stock_not_found", "message": "주가 데이터를 찾을 수 없습니다. 예: AAPL, MSFT, 005930.KS" } }
```

**봉투가 두 가지라는 점에 주의한다.** 위 형태는 `AppError` 계열(서비스·통합 계층)에만
적용된다. 라우터가 직접 던지는 `HTTPException`(자물쇠 거절 401, 소유자 헤더 누락 400,
동시 실행 상한 429, 관심종목 404·409 등)은 FastAPI 기본 핸들러가 처리하므로 **`detail`
한 필드**로 나간다.

```json
{ "detail": "관심종목에 없는 종목입니다" }
```

호출부는 두 형태를 모두 읽을 수 있어야 한다 — `error.message` 가 없으면 `detail` 을 본다.
어느 엔드포인트가 어느 형태인지는 1.4 의 **출처** 열에 있다.

FastAPI 파라미터 검증 실패(422)만 `fields`가 추가된다.

```json
{
  "error": {
    "code": "validation_error",
    "message": "요청 값을 확인해주세요.",
    "fields": [
      { "type": "greater_than_equal", "loc": ["query", "limit"], "msg": "Input should be greater than or equal to 1" }
    ]
  }
}
```

### 1.4 오류 코드 사전

`{ "error": { "code", "message" } }` 봉투로 나가는 것들이다 (출처: `core/exceptions.py`).

| HTTP | `code` | `message` | 발생 조건 |
|---:|---|---|---|
| 400 | `unsupported_timeframe` | 지원하지 않는 조회 단위입니다. | `timeframe`이 `day`/`week`/`month`가 아님 |
| 400 | `unsupported_period` | 지원하지 않는 조회 기간입니다. | `period`가 허용 목록 밖 (날짜 범위 미지정 시에만 검사) |
| 400 | `invalid_date_range` | 시작일은 종료일보다 늦을 수 없습니다. | `start_date > end_date` |
| 400 | `unsupported_market_category` | 지원하지 않는 시장 구분입니다. | `category`가 카탈로그에 없음 |
| 404 | `stock_not_found` | 주가 데이터를 찾을 수 없습니다. 예: AAPL, MSFT, 005930.KS | 모든 후보 심볼에서 빈 결과 |
| 422 | `validation_error` | 요청 값을 확인해주세요. | 길이·범위·타입 위반 |
| 500 | `internal_error` | 요청을 처리하지 못했습니다. | 그 밖의 `AppError` |
| 502 | `llm_unavailable` | AI 분석을 완료하지 못했습니다. | LLM 호출 실패 (※ 현재 API 경로로는 노출되지 않음 — 1.5 참고) |
| 502 | `llm_refused` | AI가 이 요청에 답변하지 않았습니다. | 안전 분류기 거절 (※ 동일) |
| 503 | `market_data_unavailable` | 시장 데이터를 불러오지 못했습니다. | 카테고리 내 모든 심볼 조회 실패 |
| 503 | `provider_unavailable` | 시세 공급자를 사용할 수 없습니다. | `yfinance` import 실패 |

`status_code >= 500`은 ERROR 로그, 그 미만은 INFO 로그를 남긴다.

아래는 라우터·의존성이 던지는 `HTTPException` 이다. 본문이 `{ "detail": "..." }` 이고
`code` 가 없다.

| HTTP | 발생 위치 | `detail` | 발생 조건 |
|---:|---|---|---|
| 400 | 모든 `X-Owner-Key` 엔드포인트 | 소유자 식별자(X-Owner-Key)가 필요합니다 | 헤더 누락·공백 |
| 400 | 〃 | 소유자 식별자가 너무 깁니다 | 80자 초과 |
| 400 | `/watchlist/claim` · `/profile/claim` | 같은 소유자에게는 승계할 수 없습니다 | `from_key == X-Owner-Key` |
| 400 | 관리자 쓰기 2건 | 행위자(X-Admin-Actor)가 필요합니다… | 헤더 누락 (16.4·16.5) |
| 401 | `/stocks/advice*` | AI 판단 엔드포인트에 접근할 수 없습니다. | `X-Advice-Key` 불일치 (키가 설정된 경우만) |
| 401 | `/admin/*` | 관리자 엔드포인트에 접근할 수 없습니다. | `X-Admin-Key` 불일치 |
| 404 | `POST /watchlist` | KRX 목록에서 찾을 수 없는 종목입니다: … | 심볼 확정 실패 |
| 404 | `PATCH /watchlist/{code}` | 관심종목에 없는 종목입니다 | 그 소유자의 목록에 없음 |
| 404 | `GET /admin/users/{id}` | 그 회원을 찾을 수 없습니다. | 없는 회원 |
| 409 | `POST /watchlist` | 관심종목은 200개까지 담을 수 있습니다 | 소유자당 상한 |
| 409 | 관리자 권한 변경·삭제 | (서비스 메시지 그대로) | 마지막 관리자 강등·자기 강등 등 |
| 429 | `/stocks/advice*` | (동시 실행 상한 메시지) | 진행 중 판단이 `ADVICE_MAX_CONCURRENT`(기본 4) 이상. `Retry-After: 20` 동봉 |
| 503 | `/admin/*` | 관리자 기능이 설정되지 않았습니다. | `ADMIN_API_KEY` 미설정 |
| 503 | 관리자 회원 조회·변경 | (서비스 메시지 그대로) | `users` 스키마 없음 — "없는 회원"이 아니라 "판단 불가" |

### 1.5 폴백 정책 (오류로 나가지 않는 실패)

실패해도 200으로 응답하는 경로가 있다. 화면이 통째로 깨지지 않게 하려는 의도이며,
전환 사실은 응답 필드로 드러난다.

| 실패 지점 | 결과 | 확인 필드 |
|---|---|---|
| 분석 에이전트 개별 실패 | 지표 기반 대체 의견 | `agents[].status == "fallback"`, `agents[].error` |
| 최종 판단 LLM 실패·거절 | 규칙 기반 판단 | `decision_source == "fallback"` |
| 뉴스 조회 실패 | 빈 배열 | `news == []` |
| 리포트 조회 실패 | 빈 배열 | `reports == []` |
| 재무 항목별 조회 실패 | 해당 필드만 `null` | `per == null` 등 |
| 재무 갱신 실패 (캐시 만료 후) | 직전 스냅샷 유지 | (응답에 드러나지 않음, 로그만) |
| AI 판단 경로의 재무 조회 실패 | 컨텍스트에서 제외 | (응답에 드러나지 않음, 로그만) |
| 상장사 수집 실패 | KRX → KIND → 내부 기본 목록 | `source`, `steps[]` |
| 시가총액 배치 실패 | 랭킹이 폴백 정렬로 하향 | (응답에 드러나지 않음, 로그만) |

즉 `llm_unavailable` / `llm_refused`는 정의돼 있지만 `agents/decision.py`가 모든 예외를
흡수하므로 `/stocks/advice`에서 502로 관측되지 않는다. `agents[*].status`가 전부 `"done"`이고
`decision_source`가 `"llm"`이어야 LLM 경로가 실제로 동작한 것이다.

### 1.6 헤더 — 자물쇠와 식별자

**브라우저는 FastAPI 를 직접 호출하지 않는다.** 네 헤더 모두 Next BFF(서버 측)가 붙이며,
값은 서버 환경변수와 세션·쿠키에만 있다.

```
브라우저 ──(세션 쿠키)──▶ Next BFF ──(아래 헤더들)──▶ FastAPI
```

| 헤더 | 대상 | 성격 | 미제출 시 |
|---|---|---|---|
| `X-Advice-Key` | `/stocks/advice` · `/advice/stream` | 서버-서버 공유 비밀키 | 401 (키가 설정된 경우만) |
| `X-Admin-Key` | `/admin/*` 전체 | 서버-서버 공유 비밀키 | 401 |
| `X-Owner-Key` | `/watchlist/*` · `/profile*` (필수), `/stocks/advice*` (선택) | 소유자 **식별자** | 필수 경로는 400, 선택 경로는 무시 |
| `X-Admin-Actor`(+`-Email`) | 관리자 **쓰기** 2건 | 감사 로그 기록용 | 400 |

**셋의 성질이 서로 다르다.**

- **`X-Advice-Key`** — 잠그는 이유는 하나다. 돈이 나가는 경로가 이 둘뿐이기 때문이다
  (LLM 호출 = 종목 1개당 4회). 나머지 엔드포인트는 남이 불러도 토큰이 줄지 않아 잠그지
  않는다. **미설정이면 인증을 건너뛴다** — 로컬 개발이 키 없이 돌아야 하기 때문이고,
  꺼져 있다는 사실은 기동 로그가 매번 경고한다.
- **`X-Admin-Key`** — 위와 **정반대로, 미설정이면 503 으로 막는다.** 설정을 빠뜨린 서버가
  관리자 API 를 열어 두는 것보다 관리자 화면이 안 열리는 편이 낫다. 두 키는 **절대 같은
  값을 쓰지 않는다** — AI 키는 매 판단 요청에 실려 나가므로 표면이 넓고, 그 값이 관리자
  권한까지 갖게 되면 안 된다. 그리고 이 키는 관리자 **인증이 아니다**: 누가 관리자인지는
  프런트가 세션과 `users.role` 로 판단하고, 이 키는 그 판단을 우회한 직접 호출을 막는
  2차 방어선이다.
- **`X-Owner-Key`** — **인증이 아니라 식별이다.** 값은 `anon:<uuid>`(로그인 전, 서버가
  발급해 httpOnly 쿠키에 둔 난수) 또는 `user:<uuid>`(로그인 후, `users.id`)이고,
  엔드포인트는 **둘을 구분하지 않는다.** 남의 키를 알면 그 목록을 볼 수 있다는 한계가
  남아 있다. 빈 값이나 고정값으로 떨어뜨리지 않고 400 으로 끊는 이유는, 그렇게 하면
  **모든 익명 사용자가 하나의 목록을 공유**하게 되기 때문이다.
- **`X-Admin-Actor`** — 권한이 아니라 **기록**이다. 백엔드는 이 값을 검증할 수 없고
  (세션은 프런트에 있다) 감사 로그에 "프런트가 이렇게 주장했다"를 적을 뿐이다. 그래도
  없으면 거절한다 — 누가 했는지 모르는 감사 로그는 기록이 아니다.

관련 환경변수: `ADVICE_API_KEY`(백엔드) ↔ 프런트에 같은 값, `ADMIN_API_KEY` 도 같은 규칙.

---

## 2. GET /health

헬스체크. prefix 없이 루트에 있다.

**요청**

```http
GET /health
```

**응답 200**

```json
{ "status": "ok" }
```

파라미터·오류 없음. DB나 외부 공급자를 확인하지 않는 순수 liveness 체크다 —
DB가 죽어도 `ok`를 반환한다.

---

## 3. GET /api/v1/markets/overview

카테고리별 시장 개요 + 스파크라인 (명세 6.1).

**요청**

```http
GET /api/v1/markets/overview?category=index
```

**쿼리 파라미터**

| 이름 | 필수 | 기본값 | 값 |
|---|---:|---:|---|
| `category` | 아니요 | `index` | `home` · `index` · `forex` · `commodity` · `stock` |

**카테고리 카탈로그** (`app/domain/market_catalog.py`)

| `category` | `label` | 구성 심볼 |
|---|---|---|
| `home` | 홈 지수 | KOSPI `^KS11`, KOSDAQ `^KQ11`, S&P 500 `^GSPC`, USD/KRW `KRW=X` |
| `index` | 지수 | 코스피 `^KS11`, 코스닥 `^KQ11`, 코스피200 `^KS200`, US 500 `^GSPC`, US Tech 100 `^NDX`, DAX `^GDAXI`, 닛케이 `^N225`, 미국 달러 지수 `DX-Y.NYB`, 필라델피아 반도체 `^SOX` |
| `forex` | 외환 | 달러/원 `KRW=X`, 유로/달러 `EURUSD=X`, 브라질 헤알/원 `BRLKRW=X`, 엔/원 `JPYKRW=X`, 파운드/달러 `GBPUSD=X`, 태국 바트/원 `THBKRW=X`, 달러/엔 `JPY=X` |
| `commodity` | 원자재 | 금 `GC=F`, 은 `SI=F`, 브렌트유 `BZ=F`, WTI유 `CL=F`, 천연가스 `NG=F`, 구리 `HG=F`, 미국 옥수수 `ZC=F` |
| `stock` | 주식 | `AAPL`, `BABA`, `TSLA`, `AA`, `BAC`, `KO`, `XOM` |

`home`은 홈 화면 지수 4카드 전용이다. `index`는 9종목이고 환율이 없어, 화면 하나를 그리려면
`index` + `forex` 두 번을 호출해야 했다 — 그 한 번을 없애려고 별도 카테고리로 뒀다.

**동작**

1. 카테고리의 심볼을 순서대로 조회한다.
2. 시세는 `period=1d, interval=5m` → 실패·공백이면 `period=5d, interval=1d`로 후퇴한다.
3. 전일 종가는 `fast_info.previous_close` → `info.previousClose` → 직전 종가 순으로 찾는다.
4. 조회 실패한 심볼은 **건너뛴다**(응답 `rows`에서 누락). 전부 실패하면 503.
5. `highlight`는 성공한 **첫 행**만 `true`다.
6. 카테고리 차트(`chart_points`/`chart_labels`)는 highlight 행의 스파크라인을 승격한 값이다.
   그 행에 스파크라인이 없으면 각 행의 `value`/`name`을 대신 쓴다.
7. 스파크라인은 최근 **24개 포인트**까지다. 라벨은 인트라데이면 `HH:MM`, 일봉이면 `MM/DD`.

**응답 200** — `MarketOverview`

```json
{
  "category": "index",
  "label": "지수",
  "rows": [
    {
      "name": "코스피지수",
      "symbol": "^KS11",
      "value": 3120.5,
      "change": 15.2,
      "change_percent": 0.49,
      "tone": "up",
      "highlight": true,
      "chart_points": [3105.1, 3108.4, 3120.5],
      "chart_labels": ["09:00", "09:05", "09:10"]
    }
  ],
  "chart_points": [3105.1, 3108.4, 3120.5],
  "chart_labels": ["09:00", "09:05", "09:10"],
  "updated_at": "2026-08-03T01:20:31+00:00"
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `category` | string | 요청한 카테고리 |
| `label` | string | 화면 표시명 |
| `rows[].name` | string | 카탈로그의 표시명 (공급자 이름이 아님) |
| `rows[].symbol` | string | yfinance 심볼 |
| `rows[].value` | number | 최신 종가 |
| `rows[].change` | number \| null | 전일 종가 대비 변화량 |
| `rows[].change_percent` | number \| null | 변화율(%) — 전일 종가가 0이면 `null` |
| `rows[].tone` | `"up"` \| `"down"` | `change >= 0`이면 `up` (0도 `up`) |
| `rows[].highlight` | boolean | 대표 행 여부 |
| `rows[].chart_points` | number[] | 스파크라인 값 (최대 24) |
| `rows[].chart_labels` | string[] | 스파크라인 라벨, `chart_points`와 같은 길이 |
| `chart_points` / `chart_labels` | array | 카테고리 대표 차트 |
| `updated_at` | string | 응답 생성 시각, UTC ISO-8601 (초 단위) |

**오류**

| HTTP | code | 조건 |
|---:|---|---|
| 400 | `unsupported_market_category` | 카탈로그에 없는 `category` |
| 503 | `market_data_unavailable` | 모든 심볼 조회 실패 |
| 503 | `provider_unavailable` | yfinance 미설치 |

---

## 4. GET /api/v1/stocks/history

OHLCV + 보조지표 + 지표 요약, 선택적으로 뉴스·리포트 (명세 6.3).

**요청**

```http
GET /api/v1/stocks/history?symbol=005930.KS&timeframe=day&limit=504
GET /api/v1/stocks/history?symbol=삼성전자&include_content=false
GET /api/v1/stocks/history?symbol=AAPL&start_date=2026-01-01&end_date=2026-07-29&limit=5000
```

**쿼리 파라미터**

| 이름 | 필수 | 기본값 | 제한 / 값 | 설명 |
|---|---:|---:|---|---|
| `symbol` | 예 | — | 1~80자 | 심볼 · 6자리 코드 · 한글 별칭 |
| `timeframe` | 아니요 | `day` | `day` · `week` · `month` | 봉 단위 |
| `period` | 아니요 | timeframe 기본값 | `5d` `1mo` `3mo` `6mo` `1y` `2y` `5y` `ytd` `max` | 조회 기간 |
| `limit` | 아니요 | `504` | 1~5000 | 반환할 **마지막** 봉 개수 |
| `start_date` | 아니요 | — | `YYYY-MM-DD` | 시작일 |
| `end_date` | 아니요 | — | `YYYY-MM-DD` | 종료일 (포함) |
| `include_content` | 아니요 | `true` | boolean | 뉴스·리포트 포함 여부 |

**timeframe 매핑** (`app/domain/constants.py`)

| `timeframe` | 실제 `interval` | 기본 `period` |
|---|---|---|
| `day` | `1d` | `2y` |
| `week` | `1wk` | `5y` |
| `month` | `1mo` | `max` |

**파라미터 상호작용**

- `start_date` 또는 `end_date`가 하나라도 있으면 `period`는 **무시**되고 검증도 건너뛴다.
  응답의 `period`는 `"custom"`이 된다.
- `end_date`는 종료일을 포함한다 (yfinance의 배타적 `end`에 +1일 해서 호출).
- `limit`은 조회 후 잘라내는 값이다 — 보조지표는 잘라내기 **전** 전체 구간에서 계산되므로
  `limit`을 줄여도 SMA60이 앞부분부터 채워져 나온다.
- `include_content=false`는 응답이 약 20배 빨라진다. 뉴스·리포트가 응답 시간의 약 95%
  (일봉 6개월 + 지표 0.13초 vs 뉴스·리포트 2.2초)를 차지하기 때문이다. 차트를 먼저 그리고
  콘텐츠는 [`/stocks/content`](#5-get-apiv1stockscontent)로 따라붙이는 용도다.

**심볼 해석 순서** (`app/domain/symbols.py`)

입력 한 건을 후보 목록으로 바꿔 앞에서부터 시도하고, 첫 성공을 반환한다.

| 입력 형태 | 후보 |
|---|---|
| 별칭 (`삼성`, `네이버`, `naver`, `sk하이닉스` 등 12종) | 매핑된 심볼 1개 (예: `005930.KS`) |
| 6자리 숫자 (`005930`) | `005930.KS` → `005930.KQ` → `005930` |
| 그 외 (`aapl`) | 대문자 변환 1개 (`AAPL`) |

표시명(`name`)은 별칭 표시명 → 내부 한글 종목명 표 → `ticker.info`의 `shortName`/`longName` →
심볼 순으로 결정한다.

**보조지표 계산** (`integrations/yfinance/history.py`)

- `sma5` / `sma20` / `sma60` — 종가 단순이동평균
- `bb_upper` / `bb_lower` — SMA20 ± 2σ(20일 표준편차)
- `cross_signal` — **SMA20 × SMA60** 교차. 상향 돌파 `golden`, 하향 이탈 `dead`, 없으면 `null`.
  5×20이 아닌 이유는 마커가 과도하게 찍히고 프런트 레전드(MA20/MA60)와 어긋나서다.
  두 이동평균이 모두 존재하는 구간에서만 판정하므로 차트 왼쪽 끝에 유령 마커가 생기지 않는다.
- 워밍업 구간(앞쪽 봉)은 SMA·볼린저밴드가 `null`이다.

**응답 200** — `StockHistory`

```json
{
  "name": "삼성전자",
  "symbol": "005930.KS",
  "query": "삼성전자",
  "timeframe": "day",
  "period": "2y",
  "interval": "1d",
  "start_date": null,
  "end_date": null,
  "rows": [
    {
      "name": "삼성전자",
      "symbol": "005930.KS",
      "date": "2026-07-29",
      "open": 71000,
      "close": 72500,
      "high": 72900,
      "low": 70800,
      "volume": 12345678,
      "sma5": 71820,
      "sma20": 70410,
      "sma60": 68950,
      "bb_upper": 74120,
      "bb_lower": 66700,
      "cross_signal": "golden"
    }
  ],
  "news": [],
  "reports": [],
  "metrics": {
    "latest_date": "2026-07-29",
    "latest_close": 72500,
    "day_change": 1500.0,
    "day_change_pct": 2.11,
    "return_20d_pct": 8.2,
    "return_60d_pct": 12.5,
    "sma5": 71820,
    "sma20": 70410,
    "sma60": 68950,
    "trend": "상승 우위",
    "bollinger_position": "중립",
    "volume_ratio_20d": 1.32,
    "recent_cross_signal": "golden",
    "recent_cross_date": "2026-07-21",
    "week52_position_pct": 78.4,
    "week52_high": 78000,
    "week52_low": 54100,
    "volatility_20d_pct": 1.87
  }
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `name` | string | 표시명 |
| `symbol` | string | **해석된** 심볼. 후속 호출(`/content`)에 그대로 넘긴다 |
| `query` | string | 사용자가 보낸 원본 입력 |
| `timeframe` | `day`\|`week`\|`month` | 요청 그대로 |
| `period` | string | 적용된 기간. 날짜 범위를 주면 `"custom"` |
| `interval` | string | 실제 봉 간격 (`1d`/`1wk`/`1mo`) |
| `start_date` / `end_date` | string \| null | 요청한 날짜 범위 (`YYYY-MM-DD`) |
| `rows` | StockRow[] | 오래된 → 최신 순, 최대 `limit`개 |
| `news` | NewsItem[] | `include_content=false`면 `[]` |
| `reports` | AnalystReport[] | `include_content=false`면 `[]` |
| `metrics` | StockMetrics \| null | 유효 봉이 하나도 없으면 `null` |

`rows[]`와 `metrics` 필드는 [10장 스키마 사전](#10-스키마-사전) 참고.

지표를 응답에 함께 담는 이유: 계산 소유자를 백엔드 한 곳으로 두어 프런트가 같은 계산을
TypeScript로 재구현하지 않게 한다.

**오류**

| HTTP | code | 조건 |
|---:|---|---|
| 400 | `unsupported_timeframe` / `unsupported_period` / `invalid_date_range` | 파라미터 규칙 위반 |
| 404 | `stock_not_found` | 모든 후보 심볼이 빈 결과 |
| 422 | `validation_error` | 길이·범위 위반 (`symbol` 81자, `limit=0` 등) |
| 503 | `provider_unavailable` | yfinance 미설치 |

---

## 5. GET /api/v1/stocks/content

종목 뉴스 · 애널리스트 리포트만 조회 (명세 6.3).

**요청**

```http
GET /api/v1/stocks/content?symbol=005930.KS
```

**쿼리 파라미터**

| 이름 | 필수 | 기본값 | 제한 |
|---|---:|---:|---|
| `symbol` | 예 | — | 1~80자 |

**`/stocks/history`의 `symbol` 값을 그대로 넘긴다.** 이 엔드포인트는 후보 심볼 탐색을 하지
않는다 — 호출자는 이미 유효한 심볼을 알고 있다. 별칭(`삼성전자`)이나 접미사 없는 6자리 코드를
넘기면 조회가 실패해 빈 배열이 돌아온다(오류가 아니다).

**동작**

- 뉴스 최대 3건. yfinance 스키마가 버전마다 달라 `get_news(count=)` → `.news` 순으로 시도한다.
- 리포트 최대 3건. 세 소스를 순서대로 채우고 3건에 도달하면 즉시 멈춘다:
  1. 등급 변경(`get_upgrades_downgrades`) — "○○ 애널리스트 의견: Buy"
  2. 목표가 컨센서스(`get_analyst_price_targets`) — 평균/최고/최저/현재가
  3. 투자의견 요약(`get_recommendations_summary` → `get_recommendations`) — Strong Buy/Buy/Hold/Sell 집계
- 뉴스와 리포트는 **독립적으로** 실패를 흡수한다. 한쪽이 실패해도 다른 쪽은 정상 반환되고,
  실패한 쪽은 `[]`가 된다. 이 엔드포인트는 부분 실패로 5xx를 내지 않는다.

**응답 200** — `StockContent`

```json
{
  "symbol": "005930.KS",
  "news": [
    {
      "title": "삼성전자, 3분기 실적 발표",
      "publisher": "Yonhap",
      "published_at": "2026-07-29",
      "summary": "반도체 부문 회복세가 확인되었다.",
      "url": "https://finance.yahoo.com/news/...",
      "thumbnail": "https://s.yimg.com/uu/api/res/1.2/.../170x128.jpg"
    }
  ],
  "reports": [
    {
      "title": "Goldman Sachs 애널리스트 의견: Buy",
      "publisher": "Goldman Sachs",
      "published_at": "2026-07-25",
      "summary": "투자의견 Hold에서 Buy로 변경 · 목표가 9.2만",
      "url": "https://finance.yahoo.com/quote/005930.KS/analysis/"
    }
  ]
}
```

`thumbnail`은 `170x128` 해상도를 우선 선택하고 없으면 마지막 해상도를 쓴다.
리포트의 `url`은 항상 해당 심볼의 Yahoo Finance analysis 페이지다.

**오류**

| HTTP | code | 조건 |
|---:|---|---|
| 422 | `validation_error` | `symbol` 길이 위반 |
| 503 | `provider_unavailable` | yfinance 미설치 |

---

## 6. GET /api/v1/stocks/fundamentals

재무 · 밸류에이션 (명세 6.3).

**요청**

```http
GET /api/v1/stocks/fundamentals?symbol=005930.KS
```

**쿼리 파라미터**

| 이름 | 필수 | 기본값 | 제한 |
|---|---:|---:|---|
| `symbol` | 예 | — | 1~80자 |

**`/stocks/history`의 `symbol` 값을 그대로 넘긴다.** `/stocks/content`와 같은 계약으로,
후보 심볼 탐색을 하지 않는다. 별칭(`삼성전자`)을 넘기면 조회가 실패해 전 필드가 `null`인
응답이 돌아온다(오류가 아니다).

**주가·뉴스와 분리한 이유**는 비용이다. `ticker.info` 한 번이 0.5~1.5초이고 여기에
밸류에이션·손익계산서 호출이 붙어 종목당 1~2초가 든다. `/history`의 차트 경로(0.13초)가
이걸 기다리면 안 된다.

**동작**

- **PER·PBR은 `get_valuation_measures()`가 1차 소스다.** 국내 종목은
  `info["trailingPE"]`/`["priceToBook"]`가 **항상 `null`**이다 (실측: 005930.KS ·
  000660.KS · 247540.KQ 전부). 이 API는 **yfinance ≥ 1.5**에만 있으므로
  `pyproject.toml`의 핀을 낮추면 국내 전 종목의 PER/PBR이 조용히 빈다. `AttributeError`가
  나면 WARNING 로그를 남긴다.
- **`roe_pct`와 `dividend_yield_pct`는 단위 규약이 다르다.** 같은 `info` dict에서 오는데도
  `returnOnEquity`는 소수(0.30792)라 ×100 해서 담고, `dividendYield`는 공급자가 이미
  백분율(0.57 = 0.57%)로 주므로 그대로 담는다. 화면에 배당수익률 57%가 뜨면 여기를 본다.
- **`next_earnings_date`는 `earningsTimestampStart` 기준이다.** `earningsTimestamp`는
  **직전** 발표일이라 쓰지 않는다 (실측 2026-08-04 기준 005930.KS: 전자 2026-07-29,
  후자 2026-10-28 — 후자가 `calendar["Earnings Date"]`와 일치).
- `ex_dividend_date`는 원본 epoch를 **UTC**로 변환한다. yfinance의 `calendar`는 naive
  `datetime.fromtimestamp()`를 써서 서버 타임존에 따라 하루가 밀리므로 폴백으로만 쓴다.
- **`eps`/`bps`는 국내 종목에서 `현재가 ÷ PER`, `현재가 ÷ PBR` 역산값이다.** 공급자가
  `trailingEps`/`bookValue`를 주지 않기 때문이다. 화면의 PER·PBR과 곱셈이 맞아떨어지는
  값이지만 **사업보고서의 공시 EPS와는 다르다.**
- `market_cap`은 `info["marketCap"]`을 우선한다. 밸류에이션 표의 `Market Cap`은 야후의
  다른 가격 기준이라 10% 가까이 어긋나며, 앱의 다른 곳(`krx/market_cap.py`)도 전자를 쓴다.
- 종목당 `STOCK_FUNDAMENTALS_TTL_SECONDS`(기본 900초) 캐시가 붙는다. 미스는 1~2초,
  히트는 즉시다. 같은 종목의 동시 요청은 종목별 락으로 한 번의 조회로 합쳐진다.
  캐시는 프로세스 메모리에만 있고 `STOCK_FUNDAMENTALS_CACHE_SIZE`(기본 512)를 넘으면
  가장 오래된 항목부터 버린다.
- **부분 실패는 `null`로 흡수한다 — 전 필드가 `null`이어도 200이다.** 갱신에 실패했는데
  직전 값이 있으면 그 값을 낸다.

**응답 200** — `StockFundamentals`

```json
{
  "symbol": "005930.KS",
  "currency": "KRW",
  "per": 21.06,
  "pbr": 3.64,
  "eps": 11396.01,
  "bps": 65934.07,
  "roe_pct": 30.79,
  "market_cap": 1575975166935040.0,
  "dividend_yield_pct": 0.57,
  "dividend_per_share": 1496.0,
  "ex_dividend_date": "2026-06-29",
  "next_earnings_date": "2026-10-28",
  "annual": [
    { "fiscal_year": 2025, "revenue": 333605938000000.0, "operating_income": 43601051000000.0 },
    { "fiscal_year": 2024, "revenue": 300870903000000.0, "operating_income": 32725961000000.0 }
  ]
}
```

필드 설명은 [10장 스키마 사전](#10-스키마-사전) 참고.

**오류**

| HTTP | code | 조건 |
|---:|---|---|
| 422 | `validation_error` | `symbol` 길이 위반 |
| 503 | `provider_unavailable` | yfinance 미설치 |

---

## 7. GET /api/v1/stocks/suggestions

종목명 · 코드 · 초성 자동완성 (명세 6.2).

**요청**

```http
GET /api/v1/stocks/suggestions?query=삼성&limit=5
GET /api/v1/stocks/suggestions?query=ㅅㅅㅈㅈ
GET /api/v1/stocks/suggestions?query=005930
```

**쿼리 파라미터**

| 이름 | 필수 | 기본값 | 제한 | 설명 |
|---|---:|---:|---|---|
| `query` | 예 | — | 1자 이상 | 종목명 · 코드 · 초성 |
| `limit` | 아니요 | `5` | 1~10 | 최대 결과 수 |

**동작**

1. **첫 호출은 느릴 수 있다.** 저장된 상장사가 임계값(`LISTED_COMPANY_MIN_COUNT`, 기본 100)
   미만이면 외부 수집(KRX CSV → KIND HTML → 내부 기본 종목)을 먼저 수행한다. 동시 요청이
   같은 수집을 중복 실행하지 않도록 락으로 감싼다. 프런트는 이 지연 동안
   [`/stocks/listed-companies`](#8-get-apiv1stockslisted-companies)를 폴링해 안내 배너를 띄운다.
2. 시가총액 갱신(랭킹 가중치)은 하루 1회, **백그라운드 태스크**로 던지고 기다리지 않는다.
   이번 검색은 기존(또는 비어 있는) 시총으로 랭킹된다.
3. 입력을 검색어와 초성으로 각각 정규화한다. 둘 다 비면 `[]`를 반환한다.
4. DB에서 후보를 최대 `SUGGESTION_CANDIDATE_LIMIT`(기본 500)건 가져와 파이썬에서 순위를 매기고
   상위 `limit`건을 반환한다.

**랭킹 순서** (`app/domain/ranking.py`) — 튜플이 작을수록 위로 온다.

1. **매칭 등급**
   - 0 완전 일치: 코드 또는 종목명이 검색어와 정확히 같음
   - 1 접두사 일치: 코드·종목명·초성이 검색어로 시작
   - 2 부분 일치: 종목명 또는 초성에 검색어가 포함
   - 매칭 없음은 결과에서 제외
2. **시가총액 유무** — 값이 있는 종목이 먼저 (NULL은 등급 안에서 항상 뒤)
3. **시가총액 내림차순**
4. **폴백 키** — 보통주 우선 → KOSPI → KOSDAQ → KONEX → 종목명 길이 오름차순 → 가나다순
   - 보통주 판정: 이름이 `우`/`우B`/`(전환)`/`(신형)`으로 끝나거나 `리츠`·`스팩`·`기업인수목적`을
     포함하면 보통주가 아니다.

등급 안의 2차 정렬이 시가총액인 이유: 가나다순이면 "삼성"에 삼성E&A·삼성FN리츠·삼성SDI가 먼저
나오고 삼성전자가 화면 밖으로 밀린다.

**응답 200** — `StockSuggestion[]`

```json
[
  {
    "symbol": "005930.KS",
    "name": "삼성전자",
    "market": "KOSPI",
    "initial_consonants": "ㅅㅅㅈㅈ"
  }
]
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `symbol` | string | yfinance 심볼. `/stocks/history?symbol=`에 그대로 넣는다 |
| `name` | string | 종목명 |
| `market` | string \| null | `KOSPI`/`코스피` 등 — 수집 소스에 따라 한글·영문이 섞인다 |
| `initial_consonants` | string | 초성 문자열 |

매칭이 없으면 빈 배열이다 (404가 아니다).

**오류**

| HTTP | code | 조건 |
|---:|---|---|
| 422 | `validation_error` | `query` 누락·공백, `limit` 범위 밖 |

---

## 8. GET /api/v1/stocks/listed-companies

상장사 목록 준비 상태 (명세 6.2).

**요청**

```http
GET /api/v1/stocks/listed-companies
```

파라미터 없음. **수집을 유발하지 않고 상태만 읽는다** — 첫 자동완성 지연 배너가 폴링하는
대상이므로, 이 엔드포인트 자체가 무거워지면 안 된다.

**응답 200** — `ListedCompaniesStatus`

```json
{
  "ready": true,
  "loaded": 2847,
  "total": 2847,
  "source": "KRX",
  "steps": [
    { "label": "KRX CSV",       "source": "KRX",      "state": "사용" },
    { "label": "KIND 목록",     "source": "KIND",     "state": "대기" },
    { "label": "내부 기본 종목", "source": "INTERNAL", "state": "대기" }
  ]
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `ready` | boolean | 수집이 진행 중이 아니고 저장 건수가 임계값 이상이면 `true` |
| `loaded` | number | DB에 실제로 저장된 상장사 수 |
| `total` | number | 수집한 원본 건수. 아직 수집 전이면 `max(loaded, 임계값)` |
| `source` | `KRX`\|`KIND`\|`INTERNAL` | 실제로 사용된 수집 경로 |
| `steps[].label` | string | 화면 표시용 단계명 |
| `steps[].source` | `KRX`\|`KIND`\|`INTERNAL` | 단계 식별자 |
| `steps[].state` | `사용`\|`실패`\|`대기` | 사용된 경로 앞은 `실패`, 그 자리는 `사용`, 뒤는 `대기` |

수집은 벌크 다운로드 한 번이라 "몇 건 중 몇 건" 같은 세분 진행률이 없다. `loaded`/`total`은
백분율 표시가 아니라 완료 여부 판단에 쓴다.

진행 상태는 **프로세스 메모리에만** 있다. 서버를 재시작하면 `source`는 `KRX`, `total`은 0으로
초기화되고 `steps`도 초기 상태로 돌아간다 — DB에 이미 종목이 있으면 `ready`는 계속 `true`다.

**오류** 없음 (DB 오류 시 500 `internal_error`).

---

## 9. AI 투자 판단

### 9.1 공통 오케스트레이션

`/stocks/advice`와 `/stocks/advice/stream`은 같은 흐름을 공유한다.

```
주가 조회 (day, 504봉)
  → 지표 계산 (StockMetrics)
  → 컨텍스트 구성 (봉 데이터 제외, 지표 + 뉴스 3 + 리포트 3)
  → 분석 에이전트 3인 병렬 호출
  → 최종 판단 에이전트 1회 (구조화 출력)
```

종목당 LLM 호출은 **4회**(에이전트 3 + 의사결정 1)다. 완료까지 수십 초가 걸릴 수 있다.

**에이전트 구성** (`app/agents/prompts.py`)

| `agents[].agent` | 역할 | 참조 입력 |
|---|---|---|
| `AI 저널리스트` | 뉴스·공시성 이슈의 긍정/부정 이벤트 평가 | 뉴스 헤드라인, 리포트 제목 |
| `AI 경제학자` | 거래량·가격 추세·거시 리스크 관점 평가 | 거래량 추이, 트렌드 지표 |
| `AI 애널리스트` | SMA·볼린저밴드 기반 신호와 타이밍 평가 | SMA5/20, BB 상하한, 교차 신호 |
| (최종) `AI 의사결정자` | 세 의견 종합 → BUY/WATCH/AVOID | 위 세 의견 + 지표 |

세 에이전트는 서로 독립적이라 병렬 호출한다(순차 대비 대기 시간 1/3).

**판단값**

| `verdict` | `decision_label` | 의미 |
|---|---|---|
| `BUY` | 매수 가능 | |
| `WATCH` | 관망 | |
| `AVOID` | 매수 보류 | |

`decision_label`은 LLM이 무엇을 쓰든 서버가 위 표로 덮어쓴다(`resolve_decision_label`).
알 수 없는 verdict면 `"관망"`으로 떨어진다.

**규칙 기반 폴백** (`app/agents/decision.py`) — LLM 실패 시 지표 점수로 판단한다.

| 조건 | 점수 |
|---|---:|
| `return_20d_pct > 0` / `<= 0` | +1 / −1 |
| `return_60d_pct > 0` / `<= 0` | +1 / −1 |
| `trend == "상승 우위"` | +1 |
| `recent_cross_signal == "golden"` / `"dead"` | +1 / −1 |
| `bollinger_position == "상단 돌파"` | −1 |
| `bollinger_position == "하단 이탈"` | −1 |
| `day_change_pct < -3.0` | −1 |

합계 ≥ 2 → `BUY`, ≤ −1 → `AVOID`, 그 사이 → `WATCH`.
`confidence = min(82, 52 + |점수| × 8)`.

이때 `decision_source`가 `"fallback"`이 된다. 프런트가 '규칙 기반 판단' 배지와 재시도 버튼을
켜는 **유일한** 근거다 — `agents[].status`로는 알 수 없다(에이전트가 모두 성공해도 의사결정
호출만 실패할 수 있다).

---

### 9.2 POST /api/v1/stocks/advice

**요청**

```http
POST /api/v1/stocks/advice
Content-Type: application/json
X-Advice-Key: <서버 측 공유 비밀키>
X-Owner-Key: user:1f2e…            # 선택 — 개인화 판단을 받을 때만

{ "symbol": "005930.KS" }
```

| 필드 | 필수 | 제한 |
|---|---:|---|
| `symbol` | 예 | 1~80자. `/stocks/history`와 동일한 해석 규칙(별칭·6자리 코드 허용) |

**헤더** (1.6)

| 헤더 | 필수 | 없을 때 |
|---|---:|---|
| `X-Advice-Key` | `ADVICE_API_KEY` 가 설정돼 있으면 예 | 401 |
| `X-Owner-Key` | 아니요 | `personal` 이 `null` 인 종전 응답 그대로 |

개인화는 **얹는 기능이지 전제 조건이 아니다** — 로그인하지 않은 사람도 시장 판단은
그대로 받는다. `X-Owner-Key` 가 있고 그 소유자에게 프로파일이 있을 때만 `personal` 이
채워진다.

`timeframe`은 `day`, 봉 수는 504(약 2년)로 **고정**이다 — 요청으로 바꿀 수 없다.
뉴스·리포트는 포함해서 조회한다(에이전트 컨텍스트에 필요).

**응답 200** — `StockAdviceResponse`

```json
{
  "stock": { "name": "삼성전자", "symbol": "005930.KS", "query": "005930.KS" },
  "stock_data": { "...": "StockHistory 전체 (rows 504개 + news + reports + metrics)" },
  "metrics": { "...": "StockMetrics" },
  "agents": [
    { "agent": "AI 저널리스트", "status": "done", "summary": "...", "error": null },
    { "agent": "AI 경제학자",   "status": "done", "summary": "...", "error": null },
    { "agent": "AI 애널리스트", "status": "fallback", "summary": "최근 종가 7.3만, ...", "error": "빈 응답" }
  ],
  "verdict": "BUY",
  "decision_label": "매수 가능",
  "confidence": 76,
  "answer": "BUY. 20거래일 수익률과 추세가 ... 본 의견은 투자 손익을 보장하지 않는 참고용입니다.",
  "buy_conditions": ["종가가 단기 이동평균 위에서 유지되는지 확인"],
  "risk_notes": ["뉴스 이벤트, 실적 발표, 환율 및 금리 변화에 따라 판단이 빠르게 바뀔 수 있습니다."],
  "decision_source": "llm",
  "personal": {
    "market_verdict": "BUY", "market_confidence": 76,
    "fit_score": 38, "fit_level": "low",
    "verdict": "WATCH", "label": "관망 권장", "adjusted": true,
    "concerns": [
      { "axis": "변동성 부담", "severity": "high",
        "message": "이 종목의 20일 변동성은 고객님의 손실 회피 성향에 비해 높습니다." }
    ],
    "guardrails": ["그래도 매수한다면 평소 수량의 1/3", "손절선 -8% 선설정"]
  },
  "updated_at": "2026-08-03T01:20:31+00:00"
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `stock` | object | `name` · `symbol`(해석된) · `query`(원본 입력) |
| `stock_data` | StockHistory | 4장 응답과 동일한 전체 구조. 차트를 이 응답만으로 그릴 수 있다 |
| `metrics` | StockMetrics | 유효 봉이 없으면 모든 값이 기본값인 객체(`null` 아님) |
| `agents` | AgentOpinion[] | 3건. `asyncio.gather` 순서 = 저널리스트·경제학자·애널리스트 |
| `agents[].status` | `done`\|`fallback` | `fallback`이면 LLM이 아니라 지표 문장으로 채운 것 |
| `agents[].error` | string \| null | `fallback`일 때의 원인. 사용자에게 원문 노출은 권장하지 않는다 |
| `verdict` | `BUY`\|`WATCH`\|`AVOID` | |
| `decision_label` | string | 서버가 verdict로부터 확정한 한글 라벨 |
| `confidence` | number | 0~100 |
| `answer` | string | 첫 문장에 매수 가능 여부가 드러나는 최종 답변 |
| `buy_conditions` | string[] | 매수 조건 체크리스트 (빈 배열 가능) |
| `risk_notes` | string[] | 리스크 메모 (빈 배열 가능) |
| `decision_source` | `llm`\|`fallback` | 최종 판단의 출처 |
| `personal` | PersonalVerdict \| null | 프로파일이 있을 때만. 아래 |
| `updated_at` | string | UTC ISO-8601 (초 단위) |

**`personal` — 2축 판단** (`PersonalVerdict`)

상단의 `verdict`/`decision_label` 은 **시장 판단 그대로 두고** 개인화 결과를 별도 블록으로
얹는다. 같은 필드를 덮어쓰면 화면이 "시장은 BUY 인데 당신에게는 관망"이라는 불일치를
그릴 수 없고, 프로파일 없는 기존 클라이언트의 동작도 바뀐다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `market_verdict` · `market_confidence` | | 보정 전 시장 판단 (상단과 같은 값) |
| `fit_score` · `fit_level` | 0~100 / `high`\|`medium`\|`low` | 프로파일 × 종목 지표 적합도. **LLM·네트워크 없이** 산출된다 |
| `verdict` | `BUY`\|`WATCH`\|`AVOID` | 보정 후 최종 판단. **절대 상향되지 않는다** |
| `label` | string | 사용자에게 보여줄 짧은 판단 |
| `adjusted` | boolean | 프로파일이 실제로 판단을 움직였는지. 화면의 '왜 갈렸나' 블록을 켜는 근거 |
| `concerns[]` | `{axis, severity, message}` | 점수가 깎인 이유. `message` 는 그대로 노출 가능한 문장 |
| `guardrails[]` | string[] | "그래도 사겠다면" — 막지 않고 방법을 준다 |

**오류**

| HTTP | code / detail | 조건 |
|---:|---|---|
| 401 | `detail` | `X-Advice-Key` 불일치 (키가 설정된 경우만) |
| 404 | `stock_not_found` | 주가 조회 실패 |
| 422 | `validation_error` | `symbol` 누락·길이 위반 |
| 429 | `detail` + `Retry-After: 20` | 진행 중 판단이 `ADVICE_MAX_CONCURRENT`(기본 4) 이상 |
| 503 | `provider_unavailable` | yfinance 미설치 |

429 가 503 이 아닌 이유: 서버는 멀쩡하고 잠시 뒤 다시 보내면 되는 상황이라는 뜻이 정확하다.

LLM 실패는 오류가 아니다 — 200으로 응답하고 `decision_source`/`agents[].status`에 드러난다.

---

### 9.3 POST /api/v1/stocks/advice/stream

`/advice`와 같은 결과를 4단계로 나눠 흘린다 (SSE).

**요청**

```http
POST /api/v1/stocks/advice/stream
Content-Type: application/json
X-Advice-Key: <서버 측 공유 비밀키>
X-Owner-Key: user:1f2e…            # 선택

{ "symbol": "005930.KS" }
```

요청 본문과 헤더 모두 `/advice`와 동일하다. **화면이 실제로 부르는 경로는 이쪽이다** —
프런트는 비스트리밍 `/advice` 를 쓰지 않으므로 `personal`(2축 판단)도 여기 실린다.

401·429 는 **스트림이 열리기 전에** 판정한다. 제너레이터 안에서 상한을 잡으면 이미
`200 text/event-stream` 헤더가 나간 뒤라, 클라이언트가 거절 대신 "빈 스트림"을 받아
거절인지 장애인지 구분할 수 없다.

**응답 200** — `text/event-stream`

응답 헤더:

```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no
```

`X-Accel-Buffering: no`는 nginx 같은 리버스 프록시가 SSE를 버퍼링하지 않게 하는 지시다.

프레임 형식은 SSE 표준이며 본문은 `AdviceStreamEvent` JSON 한 줄이다.

```
data: {"stage":1,"agent":null,"decision":null,"error":null}\n\n
```

**단계 순서**

| `stage` | 시점 | 동반 필드 | 횟수 |
|---:|---|---|---:|
| 1 | 주가 데이터 조회 완료 (뉴스 제외) | — | 1 |
| 2 | 뉴스·리포트 수집 완료 | — | 1 |
| 3 | 에이전트 의견 1건 완료 | `agent` | 3 (완료 순서대로) |
| 4 | 최종 판단 종합 | `decision` | 1 |
| 0 | 복구 불가능한 실패 | `error` | 0 또는 1 (스트림 종료) |

stage 3은 `asyncio.as_completed`로 **먼저 끝난 에이전트부터** 나온다 — `/advice`의
`agents[]` 순서와 다를 수 있다. 클라이언트가 연결을 끊으면 남은 에이전트 태스크는 취소된다.

**stage 1·2가 분리된 이유**: 스트리밍 경로는 주가를 `include_content=false`로 먼저 가져와
차트를 즉시 그릴 수 있게 하고, 뉴스·리포트(응답 시간의 대부분)를 뒤이어 붙인다.

**stage 4 페이로드** — `AdviceStreamDecision`

```json
{
  "stage": 4,
  "agent": null,
  "decision": {
    "stock": { "name": "삼성전자", "symbol": "005930.KS", "query": "005930.KS" },
    "verdict": "BUY",
    "decision_label": "매수 가능",
    "confidence": 76,
    "answer": "...",
    "buy_conditions": [],
    "risk_notes": [],
    "decision_source": "llm",
    "personal": { "...": "PersonalVerdict — 9.2 와 같은 규약. 프로파일이 있을 때만" },
    "updated_at": "2026-08-03T01:20:31+00:00"
  },
  "error": null
}
```

`/advice` 응답에서 **`stock_data`와 `metrics`가 빠진** 형태다. 504봉을 SSE 마지막 프레임에
다시 실어보낼 이유가 없다 — 차트는 이미 화면에 있다. 지표가 필요하면 stage 1 이전에
`/stocks/history`를 따로 호출하거나, `/advice`를 쓴다.

**stage 0 (실패)**

```json
{ "stage": 0, "agent": null, "decision": null, "error": "주가 데이터를 찾을 수 없습니다. 예: AAPL, MSFT, 005930.KS" }
```

주가 조회 실패처럼 복구 불가능한 경우에만 나온다. 에이전트·판단 실패는 각 계층이 이미
규칙 기반으로 흡수하므로 여기까지 오지 않는다.

**중요: HTTP 상태 코드는 오류 판별에 쓸 수 없다.** 스트림이 이미 시작된 뒤 발생한 실패는
`stage: 0` 프레임으로 전달되므로 상태 코드는 200이다. 스트림이 열리기 **전에** 판정되는
것만 일반 JSON 오류로 돌아온다 — 401(키), 422(본문 검증), 429(동시 실행 상한).

**클라이언트 구현 주의** — POST이므로 브라우저의 `EventSource`를 쓸 수 없다.
`fetch` + `ReadableStream`으로 직접 파싱한다.

```ts
const res = await fetch("/api/v1/stocks/advice/stream", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ symbol }),
  signal: controller.signal,
});

const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  // 프레임 구분자는 빈 줄(\n\n)이다. 마지막 조각은 다음 청크와 이어붙인다.
  const frames = buffer.split("\n\n");
  buffer = frames.pop() ?? "";

  for (const frame of frames) {
    const line = frame.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue;
    const event = JSON.parse(line.slice(6));
    // event.stage 로 분기
  }
}
```

---

## 10. GET /api/v1/markets/movers

시가총액 상위 종목을 스캔해 만든 전일 대비 등락률 랭킹.

```http
GET /api/v1/markets/movers?limit=5
```

| 파라미터 | 필수 | 기본 | 범위 |
|---|---:|---:|---|
| `limit` | 아니요 | 5 | 1~20. 상승·하락 **각각** 이 개수만큼 |

**항상 즉시 응답한다.** 스캔(수 초)은 배경에서 돌고 여기서는 최신 스냅샷만 자른다.
스냅샷이 아직 없으면 `gainers`/`losers` 가 빈 배열이므로, 호출부는 빈 목록을
'데이터 없음'으로 다루면 된다.

**응답 200** — `MarketMovers`

```json
{
  "as_of": "2026-08-11",
  "source": "YFINANCE",
  "universe_label": "시가총액 상위 200종목",
  "universe_size": 200,
  "scanned": 187,
  "gainers": [
    {
      "name": "에코프로비엠", "symbol": "247540.KQ", "code": "247540",
      "market": "코스닥", "price": 152300, "change": 12400,
      "change_percent": 8.86, "spark": [139900, 141200, 152300]
    }
  ],
  "losers": [],
  "updated_at": "2026-08-12T00:31:07+00:00"
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `as_of` | string \| null | 기준 봉 날짜 `YYYY-MM-DD`. 스캔이 비면 `null` |
| `source` | `"YFINANCE"` \| `"KRX"` | 등락률을 얻어온 경로 |
| `universe_label` | string | 화면에 그대로 노출하는 모집단 설명 |
| `universe_size` | number | 모집단으로 넘긴 종목 수 (실패분 포함) |
| `scanned` | number | 등락률을 실제로 산출한 종목 수. `universe_size` 보다 작을 수 있다 |
| `gainers[]` / `losers[]` | `MoverRow[]` | 등락률 내림/오름차순 상위 `limit` 건 |
| `updated_at` | string | 응답 생성 시각 (UTC ISO-8601) |

`MoverRow` 는 17장 스키마 사전에 있다.

---

## 11. GET /api/v1/markets/ranking

종목 탐색 화면용 목록. `/movers` 와 **같은 스냅샷**을 다르게 자른다.

```http
GET /api/v1/markets/ranking?sort=market_cap&board=KOSPI&limit=50&offset=0
```

| 파라미터 | 필수 | 기본 | 값 |
|---|---:|---:|---|
| `sort` | 아니요 | `market_cap` | `market_cap` · `change` |
| `board` | 아니요 | `ALL` | `ALL` · `KOSPI` · `KOSDAQ` |
| `limit` | 아니요 | 50 | 1~100 |
| `offset` | 아니요 | 0 | 0~2000 |

`board` 판정은 **심볼 접미사**(`.KS`/`.KQ`) 기준이다. DB 의 `market` 컬럼은
`유가`·`코스닥` 같은 한글이라 필터에 쓸 수 없다.

`/movers` 와 나눈 이유: movers 는 부호로 갈린 **두** 목록이고, 이쪽은 필터가 적용된
**한** 목록 + `total` 이라 응답 형태가 다르다. 랭킹 때문에 스캔이 추가로 돌지는 않는다.

**응답 200** — `MarketRanking`

```json
{
  "as_of": "2026-08-11",
  "source": "YFINANCE",
  "universe_label": "시가총액 상위 200종목",
  "sort": "market_cap",
  "board": "KOSPI",
  "total": 132,
  "rows": [
    {
      "name": "삼성전자", "symbol": "005930.KS", "code": "005930",
      "market": "유가", "price": 71500, "change": 300, "change_percent": 0.42,
      "spark": [70800, 71200, 71500],
      "board": "KOSPI", "market_cap": 426000000000000, "rank": 1
    }
  ],
  "updated_at": "2026-08-12T00:31:07+00:00"
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `total` | number | 필터 적용 **후** 전체 건수. 페이지네이션의 근거 |
| `rows[]` | `RankingRow[]` | `MoverRow` + `board` · `market_cap` · `rank` |
| `rows[].market_cap` | number \| null | 원. 배치가 아직 안 채운 종목은 `null` |
| `rows[].rank` | number | 1부터. `offset` 을 반영한 절대 순위라 페이지를 넘겨도 이어진다 |

---

## 12. GET /api/v1/markets/calendar

오늘부터 `days` 일 안의 실적발표 · 배당락.

```http
GET /api/v1/markets/calendar?kind=earnings&days=7&limit=20
```

| 파라미터 | 필수 | 기본 | 값 |
|---|---:|---:|---|
| `kind` | 아니요 | (없음) | `earnings` · `ex_dividend`. 비우면 둘 다 섞어 날짜순 |
| `days` | 아니요 | `CALENDAR_DEFAULT_DAYS`(7) | 1~90 |
| `limit` | 아니요 | 20 | 1~100 |

**데이터 출처가 앞의 둘과 다르다.** 요청 시점에 공급자를 부르지 않고 `listed_companies`
에 적재된 날짜를 읽는다 — yfinance 는 종목당 1회 호출(~1초)이라 "이번 주 실적발표"를
실시간으로 찾으려면 전 종목을 훑어야 하기 때문이다. 하루 1회 배치가 오래된 것부터
채우므로, 초기에는 **일정이 없는 것**과 **아직 안 물어본 것**이 똑같이 빈 목록으로 보인다.
그래서 `covered`/`universe_size` 를 함께 낸다 — 화면이 "예정된 일정 없음"과 "수집 중"을
구분하지 못하면 그건 거짓말이 된다.

응답 `events[]` 는 종목이 아니라 **일정 하나**가 한 줄이다. 같은 종목에 실적발표와
배당락이 모두 있으면 두 줄이 나온다 — 한 줄로 합치면 날짜순 정렬이 불가능해진다.

**응답 200** — `MarketCalendar`

```json
{
  "as_of": "2026-08-11",
  "days": 7,
  "total": 23,
  "events": [
    {
      "name": "삼성전자", "symbol": "005930.KS", "code": "005930",
      "board": "KOSPI", "kind": "earnings", "date": "2026-08-14",
      "d_day": 2, "market_cap": 426000000000000
    }
  ],
  "covered": 412,
  "universe_size": 2703,
  "updated_at": "2026-08-12T00:31:07+00:00"
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `as_of` | string \| null | **일정 배치가 마지막으로 돈 날.** 한 번도 안 돌았으면 `null` |
| `days` | number | 조회 창 |
| `total` | number | 창 안의 전체 건수. `events` 는 `limit` 으로 잘린다 |
| `events[].kind` | `"earnings"` \| `"ex_dividend"` | |
| `events[].d_day` | number | 남은 일수. 0 이면 오늘. 음수는 나오지 않는다 |
| `covered` / `universe_size` | number | 일정이 채워진 종목 수 / 전체 종목 수 (배치 진행률) |
| `updated_at` | string | **응답을 만든 시각.** `as_of` 와 다르다 — 이것만 보면 값이 최신이라고 오해한다 |

---

## 13. GET /api/v1/markets/screener

조건 검색. 모집단은 **상장 전 종목**이고 값은 하루 1회 배치가 채운다.

```http
GET /api/v1/markets/screener?board=ALL&per_min=0&per_max=15&sort=per&limit=50
```

| 파라미터 | 기본 | 범위 | 설명 |
|---|---:|---|---|
| `board` | `ALL` | `ALL`·`KOSPI`·`KOSDAQ` | |
| `market_cap_min` / `market_cap_max` | (없음) | ≥0 | 원 |
| `per_min` / `per_max` | (없음) | — | |
| `pbr_min` / `pbr_max` | (없음) | — | |
| `dividend_min` | (없음) | ≥0 | % 이상 |
| `roe_min` | (없음) | — | % 이상 |
| `sort` | `market_cap` | `market_cap`·`per`·`pbr`·`dividend_yield`·`roe` | 방향은 **축이 정한다** (아래) |
| `limit` | 50 | 1~100 | |
| `offset` | 0 | 0~5000 | |

정렬 방향을 파라미터로 열지 않은 이유: "PER 높은 순"은 조건 검색에서 아무도 찾지 않는
목록이고, 방향을 열면 화면·URL·백엔드 셋에 뜻 없는 조합이 생긴다. 축별 방향은
`market_cap`·`dividend_yield`·`roe` = 내림차순, `per`·`pbr` = 오름차순이다.

**`per_min` 을 왜 두나** — PER 은 음수가 될 수 있다(순손실). `per_max=15` 만 걸면
PER −3 인 적자 회사가 '가장 싼 종목'으로 맨 앞에 온다. 화면 프리셋은 하한을 항상 함께 건다.

**조건에 걸린 컬럼이 NULL 이면 그 종목은 빠진다.** SQL 이 그렇게 동작하고 그게 맞다 —
"PER 15 이하"를 물었는데 PER 을 모르는 종목이 섞이면 그 목록은 조건을 만족하지 않는다.
배치가 아직 안 채운 종목이 조용히 사라져 보이므로 `covered` 로 진행률을 함께 낸다.

**응답 200** — `ScreenerResult`

```json
{
  "as_of": "2026-08-11",
  "sort": "per", "order": "asc", "board": "ALL",
  "total": 218,
  "rows": [
    {
      "name": "삼성전자", "symbol": "005930.KS", "code": "005930",
      "board": "KOSPI", "market_cap": 426000000000000,
      "per": 11.2, "pbr": 1.08, "roe_pct": 9.6, "dividend_yield_pct": 2.05, "rank": 1
    }
  ],
  "covered": 1890,
  "universe_size": 2703,
  "updated_at": "2026-08-12T00:31:07+00:00"
}
```

`/ranking` 과 달리 **가격·등락률·스파크라인이 없다.** 그쪽 모집단은 시가총액 상위
200종목이라 조건 검색의 답이 될 수 없어 등락률 스냅샷을 쓰지 않는다. 대신 시세 열이
빠졌고, 시세는 종목 상세로 넘긴다.

---

## 14. 관심종목 (`/api/v1/watchlist`)

여섯 오퍼레이션 모두 **`X-Owner-Key` 가 필수**이고(1.6), **응답은 언제나 목록 전체**
(`Watchlist`)다.

한 건만 돌려주지 않는 이유: 화면이 그룹 집계·합계를 스스로 다시 계산해야 하고, 그
계산이 서버와 어긋나는 순간 사용자는 새로고침해야만 맞는 숫자를 본다. 목록은 최대
200행이라 통째로 주는 비용이 그 위험보다 싸다.

**공통 응답 200** — `Watchlist`

```json
{
  "items": [
    {
      "name": "삼성전자", "symbol": "005930.KS", "code": "005930", "market": "유가",
      "group": "관찰", "position": 0,
      "price": 71500, "change_percent": 0.42, "spark": [70800, 71200, 71500],
      "holding": { "quantity": 10, "avg_price": 68000 },
      "alert": { "enabled": true, "condition": "75,000원 도달 시" }
    }
  ],
  "groups": [{ "name": "관찰", "count": 1 }],
  "total_count": 1, "group_count": 1, "active_alerts": 1,
  "total_return_percent": 5.15,
  "updated_at": "2026-08-12T00:31:07+00:00"
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `items[].group` | string | 기본 `"관찰"` |
| `items[].position` | number | 사용자가 끈 순서. **값이 아니라 대소 관계만** 의미가 있다 |
| `items[].price` · `change_percent` · `spark` | number / number[] | **저장하지 않는다.** 조회 시점의 시세이고, 상류가 막히면 `0` / 빈 배열 |
| `items[].holding` | object \| null | 수량과 평단은 **둘 다 있거나 둘 다 없다** |
| `total_count` · `group_count` · `active_alerts` | number | 헤더 캡션용 집계. 화면이 `items.length` 로 유도하지 않도록 서버가 따로 준다 |
| `total_return_percent` | number | 보유 종목 전체의 평가손익률(%). 보유가 없으면 0 |
| `updated_at` | string | **시세를 붙인 시각.** 저장 데이터의 수정 시각이 아니다 |

### 14.1 GET /api/v1/watchlist

파라미터 없음. 목록이 비어 있어도 200 이다.

### 14.2 POST /api/v1/watchlist

```json
{ "symbol": "005930", "group": "관찰" }
```

| 필드 | 필수 | 제약 |
|---|---:|---|
| `symbol` | 예 | 1~40자. **6자리 코드도 `005930.KS` 도 받는다** — 서버가 KRX 목록으로 확정한다 |
| `group` | 아니요 | 40자 이하. 생략하면 `"관찰"` |

이미 담긴 종목을 다시 눌러도 오류가 아니다. 상한(200)은 **새로 담을 때만** 본다 —
사용자가 아무것도 바꾸지 않았는데 실패를 보면 안 되기 때문이다.

오류: 404(KRX 목록에서 확정 실패) · 409(소유자당 200개 상한).

### 14.3 DELETE /api/v1/watchlist/{code}

`code` 는 **6자리 숫자**여야 한다(`^\d{6}$`). 아니면 422 다.

> 이 검증이 없으면 데이터가 지워진다. 예전 구현은 `code` 를 `LIKE '{code}%'` 에 그대로
> 실었고, `DELETE /watchlist/%` 가 그 소유자의 임의의 한 종목을 지우고 200 을 돌려줬다.
> 저장소 쪽 LIKE 도 함께 없앴지만, 애초에 들어올 수 없게 하는 것이 첫 번째 방어선이다.

**없는 것을 지워도 200 이다.** 결과 상태("그 종목은 목록에 없다")가 요청자가 원한
그대로이고, 연타·재시도가 오류로 보이면 안 된다.

### 14.4 PATCH /api/v1/watchlist/{code}

```json
{ "group": "보유", "alert": { "enabled": true, "condition": "75,000원 도달 시" },
  "holding": { "quantity": 10, "avg_price": 68000 } }
```

**보내지 않은 필드는 건드리지 않는다.** `"holding": null` 을 **명시적으로** 보내면
보유 해제다 — 서비스 계층이 `model_fields_set` 으로 그 둘을 구분한다.

| 필드 | 제약 |
|---|---|
| `group` | 40자 이하 |
| `alert.enabled` | boolean |
| `alert.condition` | 120자 이하 자유 텍스트. 발송 경로는 아직 없다 |
| `holding.quantity` | 정수 ≥ 0 |
| `holding.avg_price` | > 0 |

오류: 404(그 소유자의 목록에 없는 코드) · 422(코드 형식).

### 14.5 PUT /api/v1/watchlist/order

```json
{ "codes": ["005930", "000660", "247540"] }
```

**새 순서 전체를 코드 배열로 받는다**(1~500개). "이 종목을 3번으로" 같은 부분 갱신이
아닌 이유: 드래그 한 번이 여러 행의 상대 순서를 바꾸고, 부분 갱신으로 표현하면
클라이언트와 서버가 서로 다른 순서를 갖는 중간 상태가 생긴다.

### 14.6 POST /api/v1/watchlist/claim

```json
{ "from_key": "anon:1f2e…" }
```

로그인 직후 한 번 부른다. 익명(`anon:`)으로 모은 목록을 헤더의 `X-Owner-Key`(로그인
계정)로 옮긴다. **받는 쪽을 본문으로 받지 않는 이유**: 그러면 아무 계정으로나 옮길 수
있게 된다. 본문에는 내놓는 쪽만 담는다.

`from_key == X-Owner-Key` 면 400 이다. 유니크 제약 때문에 어차피 아무것도 안 옮겨지지만,
그 호출이 오는 것 자체가 배선이 잘못됐다는 신호라 조용히 넘어가지 않게 막는다.

---

## 15. 투자 성향 프로파일 (`/api/v1/profile`)

`X-Owner-Key` 필수. 관심종목과 같은 소유자 체계다.

**이 엔드포인트는 사주를 모른다.** 받는 것은 0~100 숫자 5개와 표시용 문장 하나뿐이고,
그 숫자가 사주에서 왔는지 설문에서 왔는지는 `source` 가 말해 줄 뿐 처리는 같다.
사주 원문·오행은 이 계층에 들어오지 않는다.

**`InvestorProfile`**

| 필드 | 타입 | 설명 |
|---|---|---|
| `risk_appetite` | 0~100 | 위험 감수도 |
| `patience` | 0~100 | 보유기간 선호. 낮을수록 단타 |
| `decisiveness` | 0~100 | 결정 속도. 높을수록 충동적 |
| `loss_aversion` | 0~100 | 손실 회피 강도 |
| `herd_tendency` | 0~100 | 군중 추종 성향 |
| `source` | `saju` \| `survey` \| `user_edited` | 기본 `survey` |
| `saju_summary` | string \| null | **화면 표시 전용.** 판단 계산에 절대 들어가지 않는다 |

### 15.1 GET /api/v1/profile

```json
{ "profile": null, "updated_at": null }
```

**아직 없으면 404 가 아니라 `profile: null` 로 200 이다.** "안 만들었다"는 오류가 아니라
온보딩 전이라는 정상 상태이고, 404 로 주면 처음 방문한 사용자마다 에러 경로를 타서
진짜 장애와 구분되지 않는다.

### 15.2 PUT /api/v1/profile

본문은 `InvestorProfile` 전체. 온보딩 저장과 사용자 보정을 **같은 PUT** 으로 받는다 —
화면이 "이미 있는가"를 먼저 묻지 않아도 되고, 재시도가 중복 행을 만들지 않는다
(`owner_key` 유니크 + upsert). 응답은 15.1 과 같은 형태다.

### 15.3 DELETE /api/v1/profile

204. 없는 것을 지우라는 요청도 성공이다.

### 15.4 POST /api/v1/profile/claim

본문·규칙 모두 14.6 과 같다(`from_key` 하나). 프런트가 로그인 직후 두 승계를 같은 값으로
잇달아 부르므로 형태를 일부러 공유한다. 응답은 15.1 형태.

---

## 16. 관리자 (`/api/v1/admin`)

**라우터 전체가 `X-Admin-Key` 로 잠겨 있다**(엔드포인트마다 붙이는 방식이 아니다 —
새 엔드포인트를 추가하며 가드를 빠뜨리면 그 하나만 조용히 공개되기 때문이다).
쓰기 2건은 `X-Admin-Actor` 도 필수다. 두 헤더의 성격은 1.6 을 본다.

### 16.1 GET /api/v1/admin/ops

배치 진행률 · 배치 실행 기록 · AI 캐시 · 자물쇠 상태. 파라미터 없음.

**배치를 돌리지 않는다.** 다른 화면(`/markets/calendar`·`/screener`)은 열릴 때 배경
배치를 예약하지만, 관리자 화면은 관측이 목적이라 관측 행위가 대상을 바꾸면 안 된다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `calendar_covered` · `fundamentals_covered` · `market_cap_covered` | number | 진행률. 분모는 셋 다 `universe_size` |
| `universe_size` | number | `.KS`/`.KQ` 모집단 |
| `last_calendar_batch` · `last_fundamentals_batch` | string \| null | 마지막 배치 시각(ISO) |
| `advice_cached` · `advice_capacity` | number | AI 판단 캐시. **프로세스 메모리라 재시작하면 0** — 누적이 아니라 현재 상태 |
| `advice_in_flight` · `advice_max_concurrent` | number | 진행 중 판단 수 / 동시 상한(429 의 근거) |
| `advice_locked` · `rag_enabled` | boolean | 자물쇠·기능 상태. **꺼져 있다는 사실이 화면에 보여야 한다** |
| `batches[]` | `BatchStatus[]` | 아래 |
| `generated_at` | string | 응답 생성 시각 |

`BatchStatus` 는 **마지막 실행과 마지막 실패를 함께** 담는다. 마지막 실행만 주면
"어제 실패·오늘 성공"과 "계속 성공"이 구분되지 않고, 마지막 실패만 주면 "실패가 없다"와
"배치가 아예 돌지 않았다"가 구분되지 않는다 — 후자가 더 나쁜 상태다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `name` | string | 배치 이름 |
| `last_run_at` | string \| null | `null` 이면 **한 번도 돌지 않았다** |
| `last_run_ok` | boolean \| null | |
| `attempted` · `answered` · `applied` | number | 물어본 / 응답받은 / 반영한 종목 수 |
| `last_failure_at` · `last_failure_detail` | string \| null | 지금이 정상이어도 남는다 |

진행률과 실행 기록은 다른 질문에 답한다 — 앞은 "지금까지 얼마나 채웠나", 뒤는
"그 일이 **돌고 있나**"다. 커버리지가 며칠째 같을 때 그것이 정상인지 배치가 죽은
것인지는 뒤쪽만 답할 수 있다.

### 16.2 GET /api/v1/admin/users

| 파라미터 | 기본 | 범위 |
|---|---:|---|
| `q` | `""` | 200자 이하. 이메일·이름 부분 일치 |
| `limit` | 50 | 1~100 |
| `offset` | 0 | 0~100000 |

**응답** — `AdminUserPage`: `rows[]` · `total`(검색 적용 후) · `admin_count` · `updated_at`.
관리자를 먼저, 그다음 이메일순이다. `admin_count` 는 화면이 **마지막 관리자의 강등
버튼을 미리 잠그는** 근거다.

`AdminUser` 의 `watchlist_count`·`has_profile`·`active_sessions` 는 우리가 붙인 통계다.
특히 `watchlist_count` 는 **삭제 확인 화면이 보여준다** — 이 계정을 지우면 무엇이 함께
사라지는지 모르고 누르면 안 된다.

### 16.3 GET /api/v1/admin/users/{user_id}

한 명(`AdminUser`). 없으면 404, **`users` 스키마 자체가 없으면 503** 이다. 둘을 구분하는
이유: 404 는 "그런 회원이 없다", 503 은 "우리가 판단할 수 없다"다. 후자를 404 로 내면
화면이 "없는 회원"이라고 단정하는데 실제로는 마이그레이션이 안 돌았을 뿐이다.

### 16.4 PATCH /api/v1/admin/users/{user_id}/role

```json
{ "role": "admin" }
```

`role` 은 `user` \| `admin`. `X-Admin-Actor` 필수. 응답은 갱신된 `AdminUser`.

거절 사유는 **본문 메시지로 그대로 나간다**(409) — "마지막 관리자입니다" 같은 문장은
화면이 다시 쓸 필요 없이 사용자에게 보여줄 수 있는 말이다. **거절도 감사 로그에 남는다.**

### 16.5 DELETE /api/v1/admin/users/{user_id}

`X-Admin-Actor` 필수.

```json
{ "deleted_watchlist": 12, "deleted_profiles": 1 }
```

회원과 그 사람의 데이터를 **같은 트랜잭션으로** 함께 지운다. 관심종목·투자 성향은
외래키가 아니라 `owner_key` 문자열로 연결돼 있어 CASCADE 가 처리하지 못하고, 여기서
지우지 않으면 고아가 남는다. 응답은 무엇이 함께 사라졌는지 밝힌다.

### 16.6 GET /api/v1/admin/audit

| 파라미터 | 기본 | 범위 |
|---|---:|---|
| `limit` | 50 | 1~200 |

최근 관리자 행위(`rows[]`)와 전체 건수(`total`). **거절된 시도도 함께 나온다**(`ok=false`) —
화면이 성공과 다르게 그려야 한다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `created_at` | string | ISO |
| `actor_user_id` · `actor_email` | string / null | **프런트가 주장한 행위자.** 백엔드는 검증하지 않는다 |
| `action` | string | 행위 이름 |
| `target_user_id` · `target_email` | string \| null | 대상 |
| `detail` | string \| null | 거절 사유 등 |
| `ok` | boolean | 거절이면 `false` |

---

## 17. 스키마 사전

### StockRow

| 필드 | 타입 | 설명 |
|---|---|---|
| `name` | string | 종목명 |
| `symbol` | string | 심볼 |
| `date` | string | `YYYY-MM-DD` |
| `open` `close` `high` `low` | number \| null | OHLC. `auto_adjust=false`(수정주가 미적용) |
| `volume` | number \| null | 거래량 |
| `sma5` `sma20` `sma60` | number \| null | 단순이동평균. 워밍업 구간은 `null` |
| `bb_upper` `bb_lower` | number \| null | SMA20 ± 2σ |
| `cross_signal` | `golden`\|`dead`\|null | 그 봉에서 SMA20이 SMA60을 돌파했는지 |

### StockMetrics

`rows`에서 파생한 요약. 종가가 없는 봉은 제외하고 날짜 오름차순으로 정렬한 뒤 계산한다.

| 필드 | 타입 | 계산 |
|---|---|---|
| `latest_date` | string \| null | 마지막 유효 봉의 날짜 |
| `latest_close` | number \| null | 마지막 종가 |
| `day_change` | number \| null | 최신 종가 − 직전 종가 |
| `day_change_pct` | number \| null | 위의 변화율(%) |
| `return_20d_pct` | number \| null | 21봉 전 대비 수익률. 봉이 부족하면 `null` |
| `return_60d_pct` | number \| null | 61봉 전 대비 수익률 |
| `sma5` `sma20` `sma60` | number \| null | 마지막 봉의 값 |
| `trend` | string | `sma5 > sma20`이면 `"상승 우위"`, 아니면 `"중립/약세"` |
| `bollinger_position` | string | `"상단 돌파"` / `"하단 이탈"` / `"중립"` |
| `volume_ratio_20d` | number \| null | 최신 거래량 ÷ 최근 20봉 평균 (소수 2자리) |
| `recent_cross_signal` | `golden`\|`dead`\|null | 최근 **45봉** 안의 마지막 교차 |
| `recent_cross_date` | string \| null | 그 교차의 날짜 |
| `week52_position_pct` | number \| null | 52주(252봉) 최저~최고 구간에서 현재가의 백분위(0~100) |
| `week52_high` / `week52_low` | number \| null | 252봉 최고/최저 종가 |
| `volatility_20d_pct` | number \| null | 최근 20봉 일간수익률 표준편차(%), 표본 표준편차 |

봉이 252개보다 적으면 있는 만큼으로 52주 값을 계산한다 — 신규 상장 종목도 값이 나오는 편이
빈칸보다 낫다는 판단이다.

### NewsItem

| 필드 | 타입 | 비고 |
|---|---|---|
| `title` | string | 비어 있는 항목은 수집에서 제외된다 |
| `publisher` | string | 없으면 `""` |
| `published_at` | string | 정규화된 날짜 문자열, 없으면 `""` |
| `summary` | string | 없으면 `""` |
| `url` | string | `clickThroughUrl` → `canonicalUrl` |
| `thumbnail` | string | `170x128` 우선, 없으면 `""` |

### AnalystReport

| 필드 | 타입 | 비고 |
|---|---|---|
| `title` | string | 예: `"Goldman Sachs 애널리스트 의견: Buy"` |
| `publisher` | string | 증권사명 또는 `"Yahoo Finance"` |
| `published_at` | string | 컨센서스·의견 요약 항목은 `""` |
| `summary` | string | `" · "`로 이어붙인 세부 정보 |
| `url` | string | 심볼의 Yahoo Finance analysis 페이지 |

### StockFundamentals

| 필드 | 타입 | 비고 |
|---|---|---|
| `symbol` | string | 요청한 심볼 그대로 |
| `currency` | string \| null | `KRW` · `USD` |
| `per` / `pbr` | number \| null | `get_valuation_measures()` 우선, `info` 폴백. **국내 종목은 전자만 값이 있다** |
| `eps` / `bps` | number \| null | 공급자 값이 없으면 `현재가 ÷ PER`, `현재가 ÷ PBR` **역산**. 공시 EPS가 아니다 |
| `roe_pct` | number \| null | **소수를 ×100 한 값** (0.30792 → 30.79) |
| `market_cap` | number \| null | `info["marketCap"]` 우선 |
| `dividend_yield_pct` | number \| null | **공급자가 이미 백분율로 준다** (0.57 = 0.57%). 위 ROE와 규약이 반대다 |
| `dividend_per_share` | number \| null | 연간 forward DPS |
| `ex_dividend_date` | string \| null | `YYYY-MM-DD`. 원본 epoch를 UTC로 변환 |
| `next_earnings_date` | string \| null | `YYYY-MM-DD`. **`earningsTimestampStart` 기준** (`earningsTimestamp`는 직전 발표일이라 쓰지 않는다). 공급자 추정치일 수 있다 |
| `annual` | AnnualFinancial[] | 최신 회계연도부터 내림차순, 최대 4개년 |

전 필드가 `null`일 수 있다. 그래도 200이다.

### AnnualFinancial

| 필드 | 타입 | 비고 |
|---|---|---|
| `fiscal_year` | number | 2025 |
| `revenue` | number \| null | `TotalRevenue` → `OperatingRevenue` |
| `operating_income` | number \| null | `OperatingIncome` → `TotalOperatingIncomeAsReported`. **음수(영업손실)가 정상적으로 나온다** |

### AgentOpinion

| 필드 | 타입 | 비고 |
|---|---|---|
| `agent` | string | `AI 저널리스트` / `AI 경제학자` / `AI 애널리스트` |
| `status` | `done`\|`fallback` | |
| `summary` | string | 3문장 이내(프롬프트 제약). `fallback`이면 지표 서술 문장 |
| `error` | string \| null | `fallback`일 때의 원인 (`"빈 응답"` 등) |

### MoverRow

`/markets/movers` · `/markets/ranking` 이 공유하는 시세 한 줄.

| 필드 | 타입 | 설명 |
|---|---|---|
| `name` | string | KRX 상호 |
| `symbol` | string | yfinance 심볼 (`247540.KQ`) |
| `code` | string | 라우팅용 6자리 코드 |
| `market` | string \| null | KRX 시장 구분 **원문** (`유가`·`코스닥`·`코넥스`) |
| `price` | number | |
| `change` | number \| null | |
| `change_percent` | number | |
| `spark` | number[] | 스파크라인 원본 종가 |

### RankingRow

`MoverRow` + `board`(`KOSPI`\|`KOSDAQ`, **심볼 접미사에서 유도**) · `market_cap`(원, `null` 가능) ·
`rank`(1부터, `offset` 반영).

`market`(한글 원문)과 `board`(프런트 계약)는 다른 값이다 — 필터에 쓰는 것은 `board` 쪽이다.

### InvestorProfile · PersonalVerdict · FitScore

15장(프로파일)과 9장(AI 판단)에 각각 표로 있다. `PersonalVerdict.verdict` 는 **절대
상향되지 않는다** — 프로파일은 판단을 보수적인 쪽으로만 움직인다.

### 전체 스키마

Pydantic 정의는 `app/schemas/`에 있고, 서버 기동 후 `http://127.0.0.1:8000/openapi.json`에서
기계 판독 가능한 형태로 받을 수 있다 (오퍼레이션 29개 · 컴포넌트 스키마 49개).

---

## 18. 프런트 호출 시나리오

**홈 화면**

```
GET /api/v1/markets/overview?category=home     # 지수 4카드
```

**종목 검색**

```
GET /api/v1/stocks/listed-companies            # ready=false면 준비 배너 표시 후 폴링
GET /api/v1/stocks/suggestions?query=삼성      # 입력 디바운스 후
```

**종목 상세 (차트 우선 로딩)**

```
GET /api/v1/stocks/history?symbol=005930.KS&include_content=false   # 빠름 — 차트·지표
# 아래 둘은 서로 독립이라 병렬로 던진다. 위 응답의 symbol을 그대로 넘긴다.
GET /api/v1/stocks/content?symbol=005930.KS                          # 뉴스·리포트
GET /api/v1/stocks/fundamentals?symbol=005930.KS                     # 재무 탭·밸류에이션
```

한 번에 받아도 되면 `include_content`를 생략(기본 `true`)하고 `/history`만 호출한다.
`/fundamentals`는 `/history`에 합쳐지지 않는다 — 종목당 1~2초라 차트를 잡아둔다.

프런트는 `/content`와 `/fundamentals`의 실패를 모두 삼킨다(빈 목록 · `null`). 재무 한 칸
때문에 상세 페이지가 에러 화면이 되면 안 되기 때문이다.

**AI 판단**

```
POST /api/v1/stocks/advice/stream    # 진행 단계를 보여줄 때 (권장)
POST /api/v1/stocks/advice           # 결과만 필요할 때
```

스트리밍은 stage 1에서 차트, stage 3마다 에이전트 카드, stage 4에서 최종 판단을 채우는
식으로 화면을 점진적으로 완성한다. `X-Owner-Key` 를 함께 보내고 그 소유자에게 프로파일이
있으면 `personal`(2축 판단)이 실린다 — **화면이 실제로 부르는 경로는 스트리밍 쪽**이므로,
개인화 결과도 이쪽에 실려야 사용자에게 도달한다.

**종목 탐색 · 스크리너**

```
GET /api/v1/markets/ranking?sort=market_cap&board=KOSPI    # 목록·페이지네이션
GET /api/v1/markets/screener?per_min=0&per_max=15&sort=per  # 조건 검색
GET /api/v1/markets/movers?limit=5                          # 홈의 급등·급락 카드
GET /api/v1/markets/calendar?days=7                         # 오늘의 일정
```

넷 다 즉시 응답한다(적재된 값을 읽을 뿐이다). 목록이 비면 `covered`/`universe_size` 로
"없음"과 "수집 중"을 구분해 표시한다.

**관심종목 · 프로파일 (로그인 전후)**

```
GET  /api/v1/watchlist            # X-Owner-Key: anon:<uuid>  (로그인 전)
POST /api/v1/watchlist            # 추가 → 목록 전체가 돌아온다
# 로그인 직후 한 번, 같은 from_key 로 나란히
POST /api/v1/watchlist/claim      { "from_key": "anon:<uuid>" }   # X-Owner-Key: user:<uuid>
POST /api/v1/profile/claim        { "from_key": "anon:<uuid>" }
```

**관리자 화면**

```
GET /api/v1/admin/ops                 # 배치·캐시·자물쇠 상태
GET /api/v1/admin/users?q=&limit=50   # 회원 목록
GET /api/v1/admin/audit?limit=50      # 감사 로그 (거절 포함)
```

---

## 19. 참고: 현재 없는 기능

- `docs/product-plan.md` 7.5의 `POST /conversations/{id}/stock-advice`(인증된 대화방 투자
  판단)는 구현돼 있지 않다. 대화방 관련 엔드포인트는 라우터에 없다.
- **백엔드에 로그인·세션 엔드포인트가 없다.** 인증은 프런트(NextAuth)가 하고, 백엔드는
  그 결과를 `X-Owner-Key`(`user:<uuid>`)와 `X-Admin-Actor` 라는 **검증하지 않는 문자열**로
  전달받는다(1.6). 따라서 사용자별 요금·한도처럼 백엔드가 신원을 신뢰해야 하는 기능은
  아직 만들 수 없다.
- 알림 발송 경로가 없다. `alert.condition` 은 저장만 되는 자유 텍스트다(14.4).
- 사주 엔진 연동은 없다. `/profile` 은 숫자 5개를 받을 뿐이고, 사주 → 숫자 매핑은
  `integrations/saju/` 경계가 생긴 뒤 그쪽이 이 PUT 을 부른다.
