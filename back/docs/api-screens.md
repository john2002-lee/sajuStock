# API × 화면 매핑

**화면을 새로 짤 때 보는 문서다.** "이 화면을 만들려면 어떤 API를 어떤 순서로 부르나"에 답한다.

- 파라미터·오류 코드·응답 필드 전체는 [`api-spec.md`](api-spec.md)에 있다. 이 문서는 그 요약이 아니라
  **다른 관점**이다 — 저쪽은 엔드포인트별, 이쪽은 화면별.
- 기준 코드: `back/app/api/v1/` · `front/src/app/` · `front/src/features/*/services/`
- 갱신일: 2026-08-04 (랭킹 API·탐색 화면 추가 반영)

---

## 1. 전체 API 한눈에

11개가 전부다. **인증은 없다** — 현재 모든 엔드포인트가 공개다.

| 경로 | 무엇을 주나 | 속도 | 토큰 | 캐시 |
|---|---|---|:---:|---|
| `GET /markets/overview` | 지수·환율·원자재 시세 + 스파크라인 | 빠름 | — | 프런트 60s/900s |
| `GET /markets/movers` | 등락률 상위/하위 랭킹 | **즉시** | — | 서버 5분(배경 갱신) |
| `GET /markets/ranking` | 시총·등락률 순 종목 목록 + 시장 필터 | **즉시** | — | movers와 **같은 스냅샷** |
| `GET /stocks/history` | OHLCV + 보조지표 + 지표요약 | 0.13초 | — | 프런트 60s/900s |
| `GET /stocks/content` | 뉴스 3 + 애널리스트 리포트 3 | **2.2초** | — | 프런트 1시간 |
| `GET /stocks/fundamentals` | PER·PBR·ROE·배당·연간실적 | 1~2초 | — | **서버 15분** |
| `GET /stocks/suggestions` | 종목 자동완성 (이름·코드·초성) | 빠름 | — | 없음 |
| `GET /stocks/listed-companies` | 상장사 수집 준비 상태 | 즉시 | — | 없음 |
| `POST /stocks/advice` | AI 판단 (결과만) | **수십 초** | 💰 4회 | 없음 |
| `POST /stocks/advice/stream` | AI 판단 (SSE 4단계) | **수십 초** | 💰 4회 | 없음 |
| `GET /health` | 헬스체크 | 즉시 | — | — |

> 💰 = LLM 토큰을 쓴다. **종목 1개당 4회**(분석가 3인 병렬 + 최종 판단 1회). 나머지 9개는 전부
> yfinance·KRX 조회라 토큰 비용이 0이다.

**Base URL**: `http://127.0.0.1:8000` · **prefix**: `/api/v1` (`/health`만 예외)

---

## 2. 화면별 매핑

### 2.1 현재 있는 화면

| 화면 | 경로 | 호출하는 API | 목(mock)으로 채우는 부분 |
|---|---|---|---|
| 홈 | `/` | `markets/overview?category=home`<br>`markets/movers` | 없음 (등락 상위가 워밍업 전일 때만 일시적) |
| 종목 탐색 | `/stocks` | `markets/ranking` | 없음 |
| 종목 상세 | `/stocks/[symbol]` | `stocks/history`<br>`stocks/content`<br>`stocks/fundamentals`<br>`markets/overview?category=home` | 좌측 워치리스트 레일 |
| 관심종목 | `/watchlist` | **없음** | 전체 |

### 2.2 홈 `/`

```
getMarketHome()
├─ GET /markets/overview?category=home   지수 4카드 (KOSPI·KOSDAQ·S&P500·USD/KRW)
└─ GET /markets/movers?limit=5           상승/하락 상위          ← 둘은 병렬
```

- 두 호출은 서로를 기다리지 않는다. 둘 다 실패를 예외로 올리지 않고 빈 값으로 degrade한다.
- `movers`는 **항상 즉시 응답**한다. 스캔(수 초)은 배경에서 돌고 최신 스냅샷만 자른다.
  스냅샷이 아직 없으면 `gainers`/`losers`가 빈 배열 → 화면은 예시 데이터로 내려가고
  `moversAreSample` 이 켜져 '예시' 뱃지가 붙는다.
- 나머지 블록(초보자 진입 가이드)은 데이터가 없는 순수 링크라 API를 부르지 않는다.
- 예전에 있던 업종 등락 · 오늘의 뉴스 · AI 아침 브리핑은 **대응 API가 없어 걷어냈다.**
  첫 화면의 절반이 예시 값인 편보다 진짜인 것만 보여주는 편이 낫다는 판단이다.

### 2.2b 종목 탐색 `/stocks`

```
GET /markets/ranking?sort=market_cap&board=ALL&limit=50
```

- **필터·정렬 상태는 URL이 들고 있다** (`?sort=`, `?board=`). 화면 전체가 서버 컴포넌트이고
  칩은 `<Link>`다 — 공유 가능한 주소와 뒤로가기가 공짜로 따라온다.
- `/markets/movers`와 **같은 스냅샷**을 다르게 자를 뿐이라 스캔이 추가로 돌지 않는다.
  따라서 `?sort=change`의 순서는 홈 등락 상위와 정확히 일치한다.
- 모집단은 시가총액 상위 200종목이다. 그 밖의 종목은 목록에 없다 —
  화면이 `universe_label`("시가총액 상위 200종목")을 그대로 노출해 그 사실을 밝힌다.
- 알 수 없는 `?sort=` 값은 400이 아니라 기본값으로 떨어진다(오래된 북마크 배려).

### 2.3 종목 상세 `/stocks/[symbol]` — 가장 복잡하다

```
1단계   GET /stocks/history?symbol=005930&limit=504&include_content=false
        └─ 0.13초. 차트·지표를 즉시 그린다.
        └─ 응답의 symbol(= "005930.KS")을 다음 단계에 그대로 넘긴다.

2단계   GET /stocks/content?symbol=005930.KS       ┐
        GET /stocks/fundamentals?symbol=005930.KS  ┘ 병렬 — 벽시계 시간이 늘지 않는다

사용자가 'AI 분석' 버튼을 누를 때만
3단계   POST /api/stocks/advice  (Next BFF) → POST /stocks/advice/stream
```

**왜 나눠 부르나** — `include_content=true`(기본값)로 한 번에 받으면 응답이 2.2초가 된다.
뉴스·리포트가 소요 시간의 95%다. 차트를 먼저 그리려고 셋으로 쪼갰다.

**실패 정책** — 셋의 처리가 다르다.

| 호출 | 실패하면 | 화면 |
|---|---|---|
| `history` 404 | `{status:"not-found"}` | 후보 종목 고르기 화면 |
| `history` 503·타임아웃 | 예외 / `{status:"timeout"}` | 에러 화면 |
| `content` 실패 | 빈 배열로 흡수 | 뉴스 탭 "표시할 뉴스가 없습니다" |
| `fundamentals` 실패 | `null`로 흡수 | 재무 탭 "재무 정보를 불러오지 못했습니다" |

즉 **차트만 성공하면 페이지는 뜬다.**

### 2.4 관심종목 `/watchlist`

**백엔드 API가 하나도 없다.** 그룹·순서·보유·평단·알림은 전부 사용자 소유 데이터라 저장소가 새로 필요하다.
현재는 전부 목 데이터이고, 검색 팔레트의 관심 추가(⇥)는 `localStorage`에만 쌓인다.

화면을 다시 짤 때 필요한 엔드포인트(아직 없음):

```
GET    /watchlist                  목록 (그룹·순서 포함)
PATCH  /watchlist/order            순서 변경
PATCH  /watchlist/{code}/alert     알림 조건
DELETE /watchlist/{code}
```

단, 이 화면의 '전체 AI 분석'은 기존 `advice/stream`을 종목 수만큼 부른다 — **N종목 × 4회**다.

### 2.5 헤더 검색 (모든 화면 공통)

```
GET /api/stocks/listed-companies  (BFF)  ready=false면 준비 배너 + 폴링
GET /api/stocks/suggestions?query=삼성  (BFF)  입력 디바운스 250~400ms 후
```

**첫 호출은 느릴 수 있다.** 저장된 상장사가 100건 미만이면 외부 수집(KRX CSV → KIND HTML → 내부
기본 목록)을 먼저 수행한다. 그동안 `listed-companies`를 폴링해 안내 배너를 띄운다.

---

## 3. BFF 규칙 — 브라우저는 FastAPI를 직접 부르지 않는다

클라이언트 컴포넌트가 데이터를 필요로 하면 Next 라우트 핸들러를 경유한다. 백엔드 주소·키를
브라우저에 노출하지 않기 위해서다.

| 브라우저가 부르는 것 | 실제로 가는 곳 |
|---|---|
| `GET /api/stocks/suggestions` | `GET /api/v1/stocks/suggestions` |
| `GET /api/stocks/listed-companies` | `GET /api/v1/stocks/listed-companies` |
| `POST /api/stocks/advice` | `POST /api/v1/stocks/advice/stream` (SSE 그대로 중계) |

서버 컴포넌트에서 부르는 것(`history`·`content`·`fundamentals`·`markets/*`)은 BFF가 필요 없다.
서버끼리의 호출이라 이미 브라우저 밖이다.

---

## 4. 응답 스키마 (화면에서 쓸 필드 중심)

### 시세·차트

**`MarketOverview`** — `category` `label` `rows[]` `chart_points[]` `chart_labels[]` `updated_at`
→ `rows[]`: `name` `symbol` `value` `change` `change_percent` `tone`(up/down) `highlight` `chart_points[]`

**`MarketMovers`** — `as_of` `source` `universe_label` `universe_size` `scanned` `gainers[]` `losers[]` `updated_at`
→ `gainers/losers[]`: `name` `symbol` `code` `market` `price` `change` `change_percent` `spark[]`

**`StockHistory`** — `name` `symbol` `query` `timeframe` `period` `interval` `rows[]` `news[]` `reports[]` `metrics`
→ `rows[]`: `date` `open` `high` `low` `close` `volume` `sma5` `sma20` `sma60` `bb_upper` `bb_lower` `cross_signal`

**`StockMetrics`** (= `history.metrics`) — 화면의 '투자 지표' 6행이 여기서 나온다
`latest_close` `day_change` `day_change_pct` `return_20d_pct` `return_60d_pct` `trend`
`bollinger_position` `volume_ratio_20d` `recent_cross_signal` `week52_position_pct` `volatility_20d_pct`

> ⚠️ **지표는 백엔드가 계산해서 준다.** 프런트에서 같은 공식을 다시 구현하지 않는다.

### 콘텐츠·재무

**`StockContent`** — `symbol` `news[]` `reports[]`
→ `news[]`: `title` `publisher` `published_at` `summary` `url` `thumbnail`
→ `reports[]`: `title` `publisher` `published_at` `summary` `url`
> 값이 없으면 `null`이 아니라 **빈 문자열**이다. 화면에서 `|| undefined`로 접는다.

**`StockFundamentals`** — `symbol` `currency` `per` `pbr` `eps` `bps` `roe_pct` `market_cap`
`dividend_yield_pct` `dividend_per_share` `ex_dividend_date` `next_earnings_date` `annual[]`
→ `annual[]`: `fiscal_year` `revenue` `operating_income` (최신 연도부터, 최대 4개년)

> ⚠️ **단위 규약이 필드마다 다르다.** `roe_pct`는 백분율로 정규화된 값(30.79 = 30.79%),
> `dividend_yield_pct`도 백분율(0.57 = 0.57%)이다. **화면에서 ×100 하지 마라.**
> `operating_income`은 **음수(영업손실)가 정상적으로 나온다** — 금액 포맷이 음수를 처리해야 한다.
> `eps`/`bps`는 국내 종목에서 `현재가 ÷ PER` 역산값이라 공시 EPS와 다르다.

### 검색·AI

**`StockSuggestion[]`** — `symbol` `name` `market` `initial_consonants`
> `symbol`을 `/stocks/history?symbol=`에 그대로 넣는다. 매칭이 없으면 404가 아니라 빈 배열이다.

**`ListedCompaniesStatus`** — `ready` `loaded` `total` `source`(KRX/KIND/INTERNAL) `steps[]`

**`StockAdviceResponse`** — `stock` `stock_data` `metrics` `agents[]` `verdict` `decision_label`
`confidence` `answer` `buy_conditions[]` `risk_notes[]` `decision_source` `updated_at`
→ `agents[]`: `agent`(AI 저널리스트/경제학자/애널리스트) `status`(done/fallback) `summary` `error`

| `verdict` | 화면 문구 | 색 |
|---|---|---|
| `BUY` | 매수 가능 | 상승색 |
| `WATCH` | 관망 | 중립 |
| `AVOID` | 매수 보류 | 하락색 |

> ⚠️ **`decision_source`가 `"fallback"`이면 LLM이 아니라 규칙 기반으로 답한 것이다.**
> '규칙 기반 판단' 배지와 재시도 버튼을 켜는 **유일한** 근거다 — `agents[].status`로는 알 수 없다
> (분석가가 모두 성공해도 최종 판단만 실패할 수 있다).

### SSE 스트리밍 단계

`POST /stocks/advice/stream`은 같은 결과를 4단계로 흘린다. **단계는 4개로 고정이다.**

| stage | 시점 | 동반 필드 | 횟수 |
|:---:|---|---|:---:|
| 1 | 주가 조회 완료 | — | 1 |
| 2 | 뉴스·리포트·재무 수집 완료 | — | 1 |
| 3 | 분석가 의견 1건 완료 | `agent` | **3** (끝난 순서대로) |
| 4 | 최종 판단 | `decision` | 1 |
| 0 | 복구 불가 실패 | `error` | 0 또는 1 |

> ⚠️ **HTTP 상태 코드로 오류를 판별할 수 없다.** 스트림이 시작된 뒤의 실패는 `stage:0` 프레임으로
> 오므로 상태 코드는 200이다. POST라 브라우저 `EventSource`도 못 쓴다 — `fetch` + `ReadableStream`.

---

## 5. 오류 형태 (전 엔드포인트 공통)

```json
{ "error": { "code": "stock_not_found", "message": "주가 데이터를 찾을 수 없습니다. 예: AAPL, MSFT, 005930.KS" } }
```

422(파라미터 검증 실패)만 `fields`가 추가된다.

| HTTP | 언제 | 화면이 할 일 |
|---:|---|---|
| 400 | timeframe·period·category·날짜 순서 오류 | 입력 UI를 고친다 (사용자 탓 아님) |
| 404 | 종목을 못 찾음 | 후보 고르기 화면 |
| 422 | 필수 누락·길이·범위 위반 | 입력 UI를 고친다 |
| 503 | yfinance 미설치 / 시장 데이터 전부 실패 | 재시도 버튼 있는 에러 화면 |

**오류로 나가지 않는 실패**가 있다는 점이 중요하다. 아래는 전부 200이다.

| 실패 | 응답 | 화면에서 감지하는 법 |
|---|---|---|
| 분석가 개별 실패 | 지표 기반 대체 의견 | `agents[].status == "fallback"` |
| 최종 판단 LLM 실패 | 규칙 기반 판단 | `decision_source == "fallback"` |
| 뉴스·리포트 실패 | 빈 배열 | `news == []` |
| 재무 항목 실패 | 해당 필드 `null` | `per == null` 등 |
| 등락률 스냅샷 없음 | 빈 배열 | `gainers == []` |

---

## 6. 새 화면을 짤 때 — 고르는 법

| 만들려는 것 | 부를 API | 주의 |
|---|---|---|
| 시세 카드·티커 | `markets/overview` | `category`로 지수/환율/원자재/해외주식 전환 |
| 급등락 랭킹 | `markets/movers` | 즉시 응답하지만 첫 기동 직후엔 빌 수 있다 |
| 종목 목록·탐색 | `markets/ranking` | movers와 같은 스냅샷. 시총 상위 200 밖은 없다 |
| 차트 | `stocks/history` + `include_content=false` | **반드시 false** — true면 20배 느리다 |
| 지표 요약 | `stocks/history`의 `metrics` | 별도 호출 불필요 |
| 뉴스·리포트 | `stocks/content` | 느리다(2.2초). `<Suspense>`로 분리 |
| PER·배당·실적 | `stocks/fundamentals` | 서버 15분 캐시라 반복 호출 부담 적음 |
| 종목 검색 | `stocks/suggestions` (BFF 경유) | 디바운스 필수, 초성 지원 |
| AI 판단 | `advice/stream` (진행 표시) / `advice` (결과만) | 💰 사용자가 **명시적으로 누를 때만** |

### 성능 예산

한 화면에서 `content`와 `advice`를 동시에 기본 로딩하면 안 된다.

```
즉시(~0.2초)   markets/overview·movers·ranking, stocks/history(include_content=false), suggestions
1~2초          stocks/fundamentals (캐시 미스일 때만)
2초+           stocks/content
수십 초 💰      stocks/advice*  ← 사용자 액션 뒤에만
```

---

## 7. 아직 API가 없는 것 — 화면 재구성 전에 알아야 한다

이 기능들을 화면에 넣으려면 **백엔드부터 만들어야 한다.**

| 기능 | 상태 | 데이터 확보 |
|---|---|---|
| 관심종목 저장 | 엔드포인트 0개 | 자체 DB + 로그인 필요 |
| 로그인 | NextAuth 설치만, `providers: []` | — |
| 아침 브리핑 | **화면에서 제거** | 종목 단위 advice는 있으나 시장 요약은 별도 |
| 업종·섹터 등락 | **화면에서 제거** | 업종 분류·집계 없음 |
| 시장 전체 뉴스 | **화면에서 제거** | 뉴스는 종목 단위만 있음 |
| 배당·실적 캘린더 | 없음 | `fundamentals`에 날짜는 있음 → 화면만 만들면 됨 |
| 수급(외국인·기관) | 없음 | yfinance에 **없음** — KRX/KIS 별도 연동 |
| 공시 | 없음 | DART OpenAPI 키 신청 필요 |
| 스크리너 | 없음 | 지표 배치 적재 필요 |

가장 가까운 것은 **배당·실적 캘린더**다. `fundamentals`가 이미 `ex_dividend_date`와
`next_earnings_date`를 주므로 화면만 만들면 된다.

---

## 8. 화면 설계 시 지켜야 할 제약

1. **브라우저 → FastAPI 직접 호출 금지.** 클라이언트에서 데이터가 필요하면 `app/api/` BFF 경유.
2. **지표 재계산 금지.** `metrics`·`fundamentals`는 백엔드가 계산·정규화까지 끝냈다.
3. **`symbol` 릴레이.** `history` 응답의 `symbol`(해석된 값)을 `content`·`fundamentals`에 그대로 넘긴다.
   원본 입력(`삼성전자`, `005930`)을 넘기면 조회가 실패한다.
4. **AI는 명시적 액션 뒤에만.** 페이지 진입만으로 `advice`를 부르면 종목당 4회씩 토큰이 나간다.
5. **폴링 금지.** 느린 조회는 `<Suspense>` 스트리밍으로 처리한다.
   (예외: `listed-companies`는 첫 수집 중에만 폴링한다.)
