# 사주 × AI 주식 분석

**사주는 "이 종목이 오를까"가 아니라 "당신은 어떤 투자자인가"에 답한다.**
거기서 얻은 성향 프로파일을 종목 판단과 결합해 최종 매수 판단을 사람마다 다르게 낸다.

> AI의 역할은 수익을 보장하거나 매매를 지시하는 것이 아니라, 분산된 정보를 정리하고
> 판단 근거를 이해하기 쉽게 보여주는 것이다. 투자자문이 아니다.

이 저장소는 두 프로젝트를 합친 것이다 — 주식 분석(`StockProject`)의 구조를 기저로
사주 서비스(`SajuService`, Next.js 단독 앱)의 엔진을 옮겨 왔다. 합치는 방향은
[통합 기획](docs/saju-integration-plan.md)이 미리 정해 두었고, 그 문서의 5.3 절이
요구한 `integrations/saju/` 경계가 실제 접점이다.

## 구성

| 디렉터리 | 스택 | 역할 |
|---|---|---|
| [`back/`](back/) | FastAPI · SQLAlchemy(async) · Pydantic v2 · Gemini · **lunar-python** | 시세·검색·지표·AI 판단 **+ 사주 엔진** |
| [`front/`](front/) | Next.js 16 (App Router) · Tailwind v4 · axios | SSR 리서치 화면 **+ 성향 온보딩** |
| [`docs/`](docs/) | — | [통합 기획](docs/saju-integration-plan.md) · [사주→성향 매핑 규칙](docs/saju-profile-mapping.md) |

## 실행

두 개의 터미널이 필요하다. **백엔드를 먼저 띄운다** — 프런트가 SSR 단계에서 호출한다.

```bash
# 1) 백엔드 → http://127.0.0.1:8000  (문서: /docs)
cd back
uv sync --all-groups
cp .env.example .env          # 전체 기능용. 사주만 볼 거면 .env.saju-only.sample 로 충분하다
uv run fastapi dev

# 2) 프런트 → http://localhost:3000
cd front
npm install
cp .env.local.example .env.local
npm run dev
```

사주 화면(`/saju`)과 `/api/v1/saju/*` 는 **DB 도 LLM 도 쓰지 않는다** — 순수 계산이라
`.env` 없이도 돈다. `/saju/report` 만 `GEMINI_API_KEY` 를 쓰고, 없으면 규칙 기반 간이
리포트로 내려간다.

## 화면과 API

| 화면 | 경로 | 사용하는 API |
|---|---|---|
| 시장 현황 | `/` | `GET /api/v1/markets/overview` |
| 종목 상세 | `/stocks/[symbol]` | `GET /api/v1/stocks/history` · `/content` · `/fundamentals` |
| AI 투자 판단 | 종목 상세 내 | `POST /api/v1/stocks/advice` |
| **투자 성향 온보딩** | **`/saju`** | **`POST /api/v1/saju/chart` · `PUT /api/v1/profile`** |

## 사주가 하는 일 — 그리고 하지 않는 일

```
[가입 1회]  생년월일시 → 사주엔진 → 성향 초안 → 사용자 보정 → DB 영구 저장
                                                    ↓  (LLM 비용 0, 재계산 없음)
[종목 분석] 시세·지표·뉴스 → 에이전트 3인 → 판단 → ① MarketVerdict
              InvestorProfile × StockMetrics ────→ ② FitScore   (순수 함수)
                                        ①+② ────→ ③ PersonalVerdict (결정론적)
```

지켜지는 선이 둘이다. **둘 다 코드가 강제한다.**

1. **사주 원문은 판단 컨텍스트에 절대 들어가지 않는다.** 사주는 프로파일 초안까지만
   관여하고, 판단이 보는 것은 사용자가 확인한 숫자 6개뿐이다.
   `domain/fit.py` 도 `domain/verdict.py` 도 `saju_summary` 를 읽지 않는다.
2. **단방향 보정** — 성향은 판단을 보수적인 쪽으로만 민다. 적합도가 아무리 높아도
   `AVOID` 가 `BUY` 로 올라가지 않는다 (`domain/verdict.py`). 프로파일은
   브레이크지 액셀이 아니다.

그래서 "사주가 매수를 추천하나요?"에 **"아니요. 프로파일은 매수를 만들어내지 못하고
보류시킬 수만 있습니다"** 라고 답할 수 있다.

## 사주 엔진 — 포팅과 그 검증

원본 `SajuService` 는 TypeScript 로 쓰인 Next.js 단독 앱이었다. 엔진을 파이썬으로
옮기면서 유일한 외부 의존(`lunar-javascript`)은 **같은 저자(6tail)의 파이썬 포팅본**
`lunar-python` 으로 갈았다 — API 가 1:1 로 대응한다.

**포팅이 맞다는 것은 diff 가 판정했다.** 사주 계산은 틀려도 그럴듯해 보여 육안
검토로는 잡히지 않으므로, 두 엔진에 같은 입력을 주고 출력을 비교하는 하네스를 만들었다.

| 표본 | 결과 |
|---|---|
| 손으로 고른 경계 케이스 28건 (자시·입춘·서머타임·자오선 전환·음력/윤달·시각 미상) | **완전 일치** |
| 무작위 표본 1,500건 (1920-2024, seed 고정) | **완전 일치** |

```bash
# 재현
cd back && uv run python tests/gen_random_cases.py 1500 > cases.json
SAJU_CASES_PATH=cases.json npx tsx ../../SajuService/scripts/dump-charts-for-port.ts > ts.json
SAJU_CASES_PATH=cases.json uv run python tests/dump_python_charts.py > py.json
uv run python tests/compare_dumps.py ts.json py.json
```

두 덤퍼가 **같은 케이스 파일 하나**를 읽는다 — 한쪽에만 케이스를 추가하는 실수가
구조적으로 불가능하다.

### 엔진이 지키는 것들

원본이 여러 차례의 조사 끝에 굳힌 판단들이라 주석과 함께 그대로 옮겼다.

- **정자시설(sect 1)** — 23시부터 일주가 넘어간다. 한국 서비스들의 기본값이고,
  야자시설은 시두법으로 나올 수 없는 짝(경 일간에 무자시)을 만든다.
  `tests/test_saju_engine.py` 의 시두법 불변식이 전 시각에 대해 강제한다.
- **두 개의 시간 프레임** — 년·월주는 라이브러리의 UTC+8 절기표와 같은 프레임에서,
  일·시주는 한국 진태양시에서 뽑는다. 섞으면 절입 경계가 13~74분 어긋난다.
- **1920년 하한** — 엔진은 1908년부터 계산하지만 공개 API 는 1920년부터 받는다.
  독립 검증이 닿지 않는 12년을 팔지 않기 위해서다.
- **리포트 정책 검증기** — 의료·법률·투자·운명론·의식 권유 표현을 코드로 막는다.
  프롬프트 문구가 아니라 **모델의 실제 출력에** 매번 돌아간다.

## 검증

```bash
cd back  && uv run ruff check . && uv run pytest        # 사주 66개 포함
cd front && npx tsc --noEmit && npm run lint && npm test && npm run build
```

DB 를 쓰는 백엔드 테스트는 `TEST_DATABASE_URL`(Postgres) 이 있어야 돈다.
없으면 그 테스트들만 명시적으로 실패하고, 사주 엔진처럼 순수 계산인 것은 그대로 돈다.

## 원본과 달라진 것

합치면서 의도적으로 가져오지 않은 것이 있다.

| 원본 SajuService 에 있던 것 | 왜 안 옮겼나 |
|---|---|
| 결제(Toss)·주문·리포트 작업 큐 | 그쪽은 리포트를 **파는** 제품이었다. 여기서 사주는 온보딩 수단이라 결제 경로가 없고, 옮기면 쓰이지 않는 결제 코드가 남는다 |
| 생년월일시 저장(Order 30일 보관) | 저장 대상은 보정이 끝난 숫자 6개다. 재산정 허용 여부가 미결인 상태에서 민감정보를 미리 받아 두는 것은 안 받는 것보다 나쁘다 |
| 회원·관리자 화면 | 이 저장소에 이미 있다 (NextAuth + `/admin`) |
| 웹툰 렌더러 | 판단 영역과 재미 영역을 시각적으로 분리한다는 기획 5.7 과 맞지 않는다 |

자세한 것은 [사주→성향 매핑 규칙](docs/saju-profile-mapping.md)과
[통합 기획](docs/saju-integration-plan.md)을 본다.
