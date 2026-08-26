# 프런트 구조 규칙

Next.js 16 App Router 기준. **서비스 → 도메인(feature)** 순으로 코드를 모으고, 라우팅은
`app/`에만 둔다. 새 화면·기능을 만들 때는 이 문서의 트리와 의존 방향을 그대로 따른다.

## 이 제품은 서비스가 둘이다

| 서비스 | 하는 일 | 코드 | 라우트 |
|---|---|---|---|
| **주식** | 시장을 읽는다 — 지수·랭킹·종목 상세·관심종목·AI 판단 | `features/stock/*` | `app/(stock)/` → `/stock` · `/stocks/**` · `/dashboard/**` |
| **사주** | 당신을 읽는다 — 생년월일시로 투자 성향 프로파일 | `features/saju/` | `app/(saju)/` → `/saju` |
| *(공통)* | 어느 서비스에도 속하지 않는 것 | `features/common/*` · `shared/` · `lib/` · `store/` | `/`(서비스 선택) · `(account)/` · `/admin` |

**`/`는 어느 서비스도 아니다** — 둘 중 하나를 고르는 화면이다. 예전에는 시장 현황이
거기 있었는데, 사주로 들어온 사람에게 첫 화면이 코스피 지수인 것은 다른 제품을 연
것과 같다. 시장 현황은 주식 서비스의 홈(`/stock`)으로 내려갔다.

두 서비스는 **종목 판단에서만 만난다.** 사주가 만든 숫자 6개가 AI 판단의 개인 축이
되고(`PersonalVerdict`), 그 결합은 **백엔드가 한다.** 그래서 프런트에서는
`features/saju`와 `features/stock/advice`가 서로를 import하지 않는다 — 실제로 지금
한 줄도 없고, 그 상태를 유지하는 것이 이 분리의 목적이다.

## 5가지 원칙

1. **`app/`은 라우팅만** — 페이지는 데이터를 받아 feature 컴포넌트를 조립하는 얇은 껍데기다.
   비즈니스 UI·로직을 `app/` 안에 쌓지 않는다.
2. **기능은 `features/<service>/<domain>/`에 수직으로 모은다** — 하나의 도메인을 고칠 때
   열어야 할 폴더가 하나다. `components/`가 전역에 하나뿐인 구조는 파일이 200개를 넘기면
   탐색이 불가능해진다.
3. **서비스끼리 직접 import하지 않는다** — `features/saju`와 `features/stock/*`는 서로를
   모른다. 필요하면 `app/`에서 조립하거나 `shared/`로 승격한다. 아래 '서비스 경계' 참고.
4. **아래 계층은 위를 모른다** — `app → features → shared → lib`. 역방향 import는 금지다.
   백엔드의 `api → services → repositories → domain` 규칙과 같은 방향이다.
5. **경계는 배럴로만 노출한다** — feature 내부 파일을 외부에서 깊게 import하지 않는다.
   배럴은 **런타임에 따라 둘**이다: `index.ts`(브라우저에 실려도 되는 것)와
   `server.ts`(서버 전용). 아래 '배럴을 둘로 가르는 이유' 참고.

## 트리

```
front/
├── src/
│   ├── app/                          # 라우팅 전용 (URL = 폴더, 괄호 폴더는 URL 에 없다)
│   │   ├── layout.tsx                #   루트 레이아웃 — 프로바이더만 (푸터 없음)
│   │   ├── globals.css               #   Tailwind v4 엔트리 + 테마 토큰
│   │   ├── page.tsx                  #   / 서비스 선택 — 주식 · 사주 갈림길
│   │   ├── not-found.tsx · error.tsx · loading.tsx · robots.ts
│   │   │                             #     셋 다 **서비스를 모르는** 폴백이다
│   │   ├── _data/                    #   신원 × 도메인 조립 — 아래 '예외적 배치' 참고
│   │   │   ├── watchlist.ts          #     관심종목 한 벌 (요청 단위 캐시)
│   │   │   ├── owner.ts              #     소유자 키 (로그인이면 계정, 아니면 브라우저)
│   │   │   ├── advice.ts             #     AI 판단 게이트 · 소유자 키
│   │   │   └── admin.ts              #     requireAdmin()
│   │   │
│   │   ├── (stock)/                  # ── 주식 서비스 ──
│   │   │   ├── layout.tsx            #   서비스 셸 — 제목 템플릿 + Footer service="stock"
│   │   │   ├── stock/                #   /stock 시장 현황 (주식 서비스의 홈)
│   │   │   │   ├── page.tsx · loading.tsx · error.tsx
│   │   │   │   └── _components/      #     FindBand · ProfileBand · RecentStocks
│   │   │   ├── stocks/
│   │   │   │   ├── page.tsx          #   /stocks 랭킹
│   │   │   │   ├── screener/page.tsx #   /stocks/screener 조건 검색
│   │   │   │   └── [symbol]/         #   종목 상세 (+ loading·error·_components)
│   │   │   └── dashboard/            #   로그인 필요 — 관심종목 작업대
│   │   │       ├── layout.tsx        #     앱 셸 (사이드바 + 시장 타일)
│   │   │       ├── page.tsx · [code]/#     상세 칸
│   │   │       └── _components/
│   │   │
│   │   ├── (saju)/                   # ── 사주 서비스 ──
│   │   │   ├── layout.tsx            #   서비스 셸 — ServiceBar + Footer service="saju"
│   │   │   └── saju/page.tsx         #   /saju 투자 성향 온보딩
│   │   │
│   │   ├── (account)/                # ── 어느 서비스도 아님 ──
│   │   │   ├── layout.tsx            #   Footer service="both"
│   │   │   └── login/ · signup/ · verify/
│   │   │
│   │   ├── admin/                    #   관리자 (requireAdmin 로 404 게이트, 그룹 밖)
│   │   └── api/                      #   BFF 라우트 핸들러 (브라우저 → Next → FastAPI)
│   │       ├── auth/[...nextauth]/
│   │       ├── saju/{chart,report}/ · profile/     # 사주 서비스
│   │       ├── stocks/{suggestions,listed-companies,advice}/
│   │       └── watchlist/            #     route · [code] · order · _helpers.ts
│   │
│   ├── features/                     # 서비스 → 도메인 모듈 — 이 프로젝트 코드의 대부분
│   │   ├── stock/                    # ── 주식 서비스 도메인 ──
│   │   │   ├── market/               #   시장 현황 · 랭킹 · 조건 검색
│   │   │   │   ├── components/       #     이 도메인 전용 UI (browse · screener · table)
│   │   │   │   ├── services/         #     백엔드 API 호출 (서버에서 실행)
│   │   │   │   ├── model/            #     types.ts · 쿼리 파싱 · 페이징 · 파생 계산
│   │   │   │   └── index.ts          #     공개 API
│   │   │   ├── stocks/               #   종목 상세·차트
│   │   │   ├── advice/               #   AI 투자 판단 (+ server.ts)
│   │   │   ├── search/               #   종목 자동완성 (+ server.ts)
│   │   │   └── watchlist/            #   관심종목 (+ server.ts)
│   │   │
│   │   ├── saju/                     # ── 사주 서비스 도메인 ── (+ server.ts)
│   │   │   ├── components/           #   SajuOnboarding · PillarGrid · WuxingBars …
│   │   │   ├── model/                #   간지 · 오행 · 타입
│   │   │   └── services/             #   출생지 목록 · 와이어 변환
│   │   │
│   │   └── common/                   # ── 어느 서비스도 아닌 도메인 ──
│   │       └── admin/                #   관리자 화면 데이터
│   │
│   ├── shared/                       # 도메인을 모르는 재사용 UI 레이어
│   │   ├── ui/                       #   원자 UI — 직접 손으로 쓴다 (shadcn 아님)
│   │   │                             #     Icon · Delta · Sparkline · StatRow · Chip …
│   │   ├── components/               #   ui/ 를 조합한 자체 공통 컴포넌트
│   │   │   ├── layout/               #     Masthead · Wordmark · Footer
│   │   │   │                         #     MobileTabBar(주식) · ServiceBar(사주)
│   │   │   └── feedback/             #     Skeleton · ErrorScreen · Notice · SampleFrame
│   │   ├── hooks/                    #   도메인 무관 훅 (useDebouncedValue 등)
│   │   ├── query/                    #   React Query 프로바이더 + 쿼리 키 단일 출처
│   │   ├── theme/ · auth/            #   테마 · 세션 프로바이더
│   │   └── types/                    #   여러 도메인이 공유하는 타입 (Currency · Market)
│   │
│   ├── lib/                          # 프레임워크·외부 연동 어댑터 — **위를 모른다**
│   │   ├── api/                      #   서버 → FastAPI 클라이언트 · 에러 정규화 · 상한기
│   │   ├── http/browser.ts           #   브라우저 → 우리 BFF 클라이언트 (fetch)
│   │   ├── format/                   #   숫자·통화·퍼센트·날짜·등락 방향
│   │   ├── config/                   #   env 파싱 · 장 운영 시간
│   │   ├── auth/ · watchlist/        #   순수 정책·쿠키 (세션은 보지 않는다)
│   │   └── stocks/symbol.ts          #   심볼 모양 판정
│   │
│   ├── store/                        # 전역 클라이언트 상태 (여러 도메인이 공유할 때만)
│   │   └── recentSearches.ts         #   최근 본 종목 (localStorage)
│   │
│   ├── auth.ts · proxy.ts            # NextAuth 설정 · Next 16 미들웨어
│
├── public/                           # 정적 파일
├── CONVENTIONS.md                    # 이 문서
├── AGENTS.md · CLAUDE.md             # 에이전트 규칙
├── next.config.ts · tsconfig.json · eslint.config.mjs · postcss.config.mjs
└── package.json
```

## 배럴을 둘로 가르는 이유 — `index.ts` / `server.ts`

feature 의 공개 경계는 하나가 아니라 **런타임이 다른 둘**이다.

| 배럴 | 담는 것 | 부르는 쪽 |
|---|---|---|
| `index.ts` | 컴포넌트·훅·모델 타입 — 브라우저에 실려도 되는 것 | 아무나 |
| `server.ts` | `services/`, 목 데이터, 백엔드 와이어 타입 | 서버 컴포넌트·라우트 핸들러 |

**실측으로 확인한 문제다.** `getWatchlist` 가 `index.ts` 에 함께 있던 동안, 대시보드의
클라이언트 컴포넌트가 `WatchRow` 하나를 가져오려고 `@/features/watchlist` 를 부르는
것만으로 서버 HTTP 계층(axios 인스턴스)이 브라우저 번들에 실렸다 — `/dashboard`
첫 로드에 56KB. 모듈 최상단에서 인스턴스를 만드는 코드는 사이드이펙트라 번들러가
버리지 못하므로, 트리셰이킹에 기대는 대신 **애초에 안 닿게** 한다.

서비스 호출이 없는 feature(`stock/stocks`)는 `server.ts` 를 만들지 않는다. 필요해질 때 만든다.

## 서비스 경계 — 두 서비스는 프런트에서 만나지 않는다

`features/saju` 와 `features/stock/*` 는 서로를 import 하지 않는다. **지금 한 줄도
없다** — `features/saju` 는 `@/features/` 를 아예 부르지 않고, 사주가 만든 성향을
쓰는 `features/stock/advice` 도 사주 코드를 모른다.

가능한 이유는 **결합이 백엔드에서 일어나기 때문**이다. 사주 온보딩이 저장하는 것은
숫자 6개와 문장 하나이고(`/api/profile` → 백엔드 `investor_profile`), 종목 판단은
그 저장된 값을 백엔드가 읽어 `PersonalVerdict` 로 내려 준다. 프런트에서 보면 사주는
**쓰기**만 하고 주식은 **읽기**만 한다 — 둘이 같은 타입을 공유할 일이 없다.

이 상태를 유지한다. 서비스를 가로지르는 것이 생기면 셋 중 하나다.

1. 화면에서만 잇는다 — `ProfileBand`(주식 홈 → `/saju`)처럼 **링크 하나**로 끝낸다.
2. 진짜 공용이면 `shared/` 로 올린다 — `Masthead` · `Footer` 가 그렇다.
3. 데이터 결합이면 **백엔드가 한다.** 프런트에서 두 도메인의 값을 합치는 코드를 쓰기
   전에 그 계산이 백엔드에 있어야 하는 것은 아닌지 먼저 본다 (지표 계산은 백엔드
   소유라는 규칙과 같은 방향이다).

## 데이터는 두 방향으로 흐른다

```
서버 컴포넌트 ──▶ features/*/server.ts ──▶ lib/api ──▶ FastAPI
클라이언트    ──▶ app/api/* (BFF)       ──▶ lib/api ──▶ FastAPI
              └─ lib/http/browser.ts 로만 부른다
```

- **브라우저는 FastAPI 를 직접 부르지 않는다.** 백엔드 주소·키가 노출되고,
  소유자 키 같은 값이 브라우저를 거치게 된다.
- 브라우저에서 BFF 를 부르는 통로는 `lib/http/browser.ts` **하나**다. 맨 `fetch` 를
  쓰지 않는다 — 실패 계약이 화면마다 갈라진다. 예외는 SSE 하나뿐이고 그 이유는
  파일 주석에 있다.

## 각 폴더를 그렇게 둔 이유

| 폴더 | 역할 | 왜 여기인가 |
|---|---|---|
| `src/` | 소스 루트 | 설정 파일(`next.config.ts`, `tsconfig.json`, `eslint.config.mjs`)과 소스가 루트에서 섞이지 않는다. Next가 공식 지원하는 선택지이고, `@/*` 별칭이 "소스 루트"라는 하나의 뜻만 갖는다. |
| `app/` | URL 정의 | Next는 폴더 이름을 URL로 쓴다. 즉 `app/`의 구조는 **제품 정보구조에 종속**된다. 도메인 코드를 여기 두면 URL이 바뀔 때 코드가 따라 움직인다. 그래서 라우팅만 남긴다. |
| `app/(stock)/` · `app/(saju)/` | 서비스 셸 | 괄호 폴더는 **URL에 나타나지 않는다.** 주소는 `/stock`·`/saju` 그대로 두면서, 서비스마다 다른 것(제목 템플릿·푸터 고지·하단 바)을 레이아웃 하나로 묶는다. 예전에는 푸터가 루트에 있어 사주 화면에도 "시세·재무·뉴스" 면책이 붙었다 — 그 화면은 시세를 그리지 않는다. |
| `features/<service>/<domain>/` | 도메인 수직 모듈 | 실무 변경은 "시장 현황 화면 고쳐줘"처럼 **도메인 단위**로 들어온다. 관련 UI·API 호출·타입이 한 폴더에 있으면 변경 범위가 폴더 하나로 닫힌다. 폐기할 때도 폴더째 지운다. 서비스 층을 하나 더 둔 것은 **폐기 단위가 서비스이기도 하기 때문**이다 — 사주를 접는다면 `features/saju/` 와 `app/(saju)/` 를 지우면 끝이고, 그때 무엇이 딸려 죽는지 폴더 이름만 봐도 안다. |
| `features/common/` | 서비스 무관 도메인 | `admin` 처럼 두 서비스 **위에** 있는 것. `features/admin/` 으로 두면 `@/features/admin` 과 `@/features/stock/market` 이 나란히 서서 깊이가 들쭉날쭉해진다 — `features/*` 는 전부 "그룹" 한 층으로 통일한다. |
| `features/*/*/services/` | 백엔드 호출 | 화면과 API 계약을 분리한다. 컴포넌트는 `getMarketOverview()`만 알고, 엔드포인트·재시도·폴백은 이 파일이 안다. 백엔드 응답 형태가 바뀌어도 컴포넌트는 손대지 않는다. |
| `features/*/*/model/` | 타입·파생 로직 | 타입을 전역 `types/`에 몰아넣으면 어느 도메인 것인지 알 수 없게 된다. 쓰는 곳 옆에 둔다. |
| `features/*/*/index.ts` | 공개 경계 (클라이언트) | 이게 없으면 외부가 내부 파일을 자유롭게 참조해 리팩터링이 막힌다. 내보내지 않은 것은 내부 구현이다. |
| `features/*/*/server.ts` | 공개 경계 (서버) | 서비스·목 데이터를 `index.ts`에 함께 두면 클라이언트 컴포넌트가 배럴 하나로 서버 HTTP 계층을 브라우저에 실어 보낸다. 위 '배럴을 둘로 가르는 이유' 참고. |
| `shared/ui/` | 원자 UI | **손으로 쓴 우리 소스다** (shadcn 생성물이 아니고 `components.json`도 없다). Icon·Delta·Sparkline처럼 도메인을 모르는 최소 조각만 둔다. 조판만 정하는 것은 컴포넌트가 아니라 **클래스 생성기**다 — `button()`·`segmented()`. 이 앱의 버튼·탭은 절반이 `<Link>` 라, 컴포넌트로 감싸면 `as` prop 층이 생기고 그 층이 `scroll`·`prefetch` 를 전부 다시 통과시켜야 한다. |
| `shared/components/` | 조합 컴포넌트 | `ui/`의 조각을 엮어 화면 단위 의미를 갖는 것(제호·푸터·안내 상자). 원자와 조합을 섞으면 "이건 어디까지 재사용되나"를 매번 파일을 열어 확인해야 한다. |
| `lib/` | 외부 세계 어댑터 | HTTP·env·포맷은 React와 무관한 순수 코드다. 분리해 두면 테스트가 쉽고, 어느 계층에서든 안전하게 쓸 수 있다. **세션을 읽지 않는다** — 신원을 엮는 일은 `app/_data/`의 몫이다. |
| `store/` | 전역 상태 | 이 프로젝트는 화면 대부분이 서버 컴포넌트다. 전역 상태는 **여러 도메인이 실제로 공유할 때만** 만든다. 도메인 하나에서만 쓰는 상태는 `features/<domain>/store/`에 둔다. |

## 의존 방향

```
        ┌─ features/stock/*  ─┐
app  →  ├─ features/saju     ─┤  →  shared  →  lib
        └─ features/common/* ─┘        ↖
                                        store
```

- 아래 계층은 위 계층을 import하지 않는다. `shared/`가 `features/`를 참조하면 공통이 아니다.
- **서비스 간 직접 import 금지.** `features/saju` 와 `features/stock/*` 는 서로를 모른다.
  위 '서비스 경계' 참고 — 지금 한 줄도 없고, 그 상태를 유지한다.
- **feature 간 직접 import 금지.** 같은 서비스 안에서도 마찬가지다.
  `features/stock/advice`가 `features/stock/stocks`의 내부를 참조하면 안 된다.
  필요하면 둘 중 하나를 택한다.
  1. 페이지(`app/`)에서 두 feature를 조합한다 — 대부분 이 방법으로 해결된다.
  2. 정말 공용이면 `shared/`로 승격한다.
- `lib/`은 아무것도 import하지 않는다 (외부 패키지 제외).

## 경로 별칭

`tsconfig.json`에 설정되어 있다. 상대 경로 `../../..`는 쓰지 않는다.

| 별칭 | 실제 경로 | 예시 |
|---|---|---|
| `@/*` | `src/*` | `@/app/globals.css` |
| `@/features/*` | `src/features/*` | `@/features/stock/stocks` · `@/features/saju` |
| `@/shared/*` | `src/shared/*` | `@/shared/components/layout/Masthead` |
| `@/lib/*` | `src/lib/*` | `@/lib/format` |
| `@/store/*` | `src/store/*` | `@/store/recentSearches` |
| `@/app/*` | `src/app/*` | `@/app/_data/watchlist` |

**`@/domains/*` 같은 별칭을 새로 만들지 않았다.** 서비스 층은 `@/features/` 아래
한 마디가 늘어난 것뿐이라 별칭 표가 그대로 살고, 라우트 그룹 폴더는 `app/` 안에만
있어 별칭과 무관하다. 별칭이 늘면 "이건 어느 별칭으로 부르나" 를 매번 판단해야 한다.

규칙:

```ts
// ✅ feature는 공개 경계로만
import { StockChart } from "@/features/stock/stocks";

// ✅ 서버 전용은 server.ts 로
import { getWatchlist } from "@/features/stock/watchlist/server";

// ❌ 내부 파일 직접 참조
import { StockChart } from "@/features/stock/stocks/components/StockChart";

// ✅ 같은 feature 내부는 상대 경로 (모듈 이동에 안전)
import { toSeries } from "../model/series";

// ✅ 공통 레이어는 별칭
import { Delta } from "@/shared/ui";
import { price } from "@/lib/format";
```

## 새 기능을 추가하는 절차

0. **어느 서비스인가부터 정한다.** 주식이면 `stock/`, 사주면 `saju/`, 둘 다 아니면
   `common/`. 여기서 헷갈리면 대개 기능이 둘로 쪼개져야 하는 신호다.
1. 도메인 이름을 정하고 `src/features/<service>/<domain>/`을 만든다.
2. `model/types.ts` — 백엔드 응답 타입부터 적는다. 백엔드 `app/schemas`와 이름을 맞춘다.
3. `services/` — API 호출 함수. 서버에서 실행되며 `lib/api`의 클라이언트를 쓴다.
4. `components/` — 기본은 서버 컴포넌트. 상호작용이 필요한 조각만 `'use client'`로 잘라낸다.
5. `index.ts` — 페이지가 쓸 것 중 **브라우저에 실려도 되는 것만** export한다.
   서비스·목 데이터는 `server.ts`로 나간다 (위 '배럴을 둘로 가르는 이유').
6. `app/<서비스 그룹>/`에 라우트를 만들고 3~4단계를 조립한다. 느린 조회는
   `<Suspense>`로 감싼다. **그룹을 고르는 것이 곧 셸을 고르는 것이다** — 어느
   푸터·하단 바·제목 템플릿이 붙을지가 거기서 정해진다.
7. 조회는 `apiGetCached`로 캐시 주기를 **명시한다.** 시세 계열은
   `marketRevalidate()`(장중 60초/장외 900초), 배치 지표는 30분, 종목 메타는 1시간이
   기준이다 (`lib/config/marketHours.ts`). 사용자별 데이터는 캐시하지 않는다 —
   Next 데이터 캐시의 키는 URL이라 **남의 데이터가 서빙된다.**

## 이 프로젝트에 한정된 제약

- **서버 컴포넌트가 기본이다.** `'use client'`는 사용자 입력이 필요한 최소 단위에만 붙인다.
- **차트는 예외적으로 클라이언트다.** 원래 "차트도 서버에서 SVG로" 였으나, 휠 줌·크로스헤어
  툴팁·프리셋 전환은 서버 렌더로 구현할 수 없어 `lightweight-charts`(캔버스)로 간다.
  데이터는 서버에서 받아 prop 으로 넘기고, 클라이언트는 그리기만 한다
  (`features/stock/stocks/components/StockChart.tsx`). 스파크라인처럼 상호작용이 없는 그래픽은
  계속 서버 SVG(`shared/ui/Sparkline.tsx`)로 그린다.
- **지표 계산은 백엔드 소유다.** `/stocks/history` 응답의 `metrics`를 쓰고, 프런트에서 같은 공식을
  다시 구현하지 않는다.
- **브라우저에서 FastAPI를 직접 호출하지 않는다.** 클라이언트 컴포넌트가 데이터를 필요로 하면
  `app/api/`의 BFF 라우트를 경유한다. 백엔드 주소·키를 브라우저에 노출하지 않기 위함이다.
- **글자 크기·반경은 토큰만 쓴다.** `style={{ fontSize }}` 도 `text-[13px]` 도 쓰지
  않는다 — 타입 스케일은 `text-10`~`text-48` 10단이고 반경은 `rounded-6/10/14/20`
  이다(`globals.css`). 원자에 크기를 넘길 때는 `TextSize` 유니온이라 **스케일 밖
  값은 컴파일 에러**가 된다. 인라인이 맞는 자리는 넷뿐이다: 동적 값(transform·
  width), safe-area `calc()`, 유동 `clamp()`, 차트 엔진 옵션.
- **액센트는 데이터 색이 아니다.** `--brand`(라임)는 CTA·활성·브랜드에만 쓰고
  **차트·표 안에 들어가지 않는다.** 등락 빨강/파랑과 이동평균 4색은 색각이상 ΔE
  검증을 통과한 값이라 건드리면 그 검증을 다시 해야 한다. 등락색을 옅게 깔아야
  하면 `--up-wash`/`--down-wash` 를 쓴다 — `bg-up/12` 같은 opacity modifier 는
  Tailwind 가 구형 브라우저용 **폴백으로 불투명 원색**을 먼저 깔아, 빨강 위 빨강이 된다.
- **표시 서식은 `lib/format`이 소유한다.** 화면에서 `toLocaleString`을 직접 부르거나
  등락 색을 `value > 0 ? "text-up" : …`로 다시 쓰지 않는다. 색 반전 토글이나 자릿수
  규칙이 생기면 한 곳만 고쳐야 한다.
- **`export const dynamic = "force-dynamic"`을 쓰지 않는다.** 그 설정은 라우트의 모든
  fetch를 `no-store`로 강제해, 서비스가 붙여 둔 `force-cache` + revalidate를 통째로
  무력화한다(Next 16 `caching-without-cache-components.md`). 동적 렌더가 필요하면
  `export const revalidate = 0`이다 — 라우트는 매 요청 렌더하되 fetch 캐시는 산다.
  이 함정은 페이지뿐 아니라 **라우트 핸들러에도** 똑같이 걸린다.
- **Next 16은 학습 데이터와 다르다.** 프레임워크 API를 쓸 때는 `node_modules/next/dist/docs/`의
  해당 문서를 먼저 읽는다 (`AGENTS.md`).

## 예외적으로 허용되는 배치

- 한 라우트에서만 쓰이고 재사용 계획이 없는 조각은 `app/<route>/_components/`에 둔다.
  `_` 접두사 폴더는 라우팅에서 제외된다. 두 번째 사용처가 생기면 `features/`로 옮긴다.
- **신원(세션·쿠키)을 도메인과 엮는 조립은 `app/_data/`에 둔다.** `features/`로도
  `lib/`으로도 내릴 수 없다 — 둘 다 `@/auth`를 알면 안 되기 때문이다. 한쪽 라우트의
  `_components/`에 두면 다른 라우트가 남의 내부를 깊게 참조하게 된다. 지금 셋이 있다:

  | 파일 | 하는 일 | 왜 여기인가 |
  |---|---|---|
  | `_data/watchlist.ts` | 관심종목 한 벌 (요청 단위 캐시 + 익명 목록 승계) | 대시보드와 종목 상세가 공유 |
  | `_data/owner.ts` | 소유자 키 — 로그인이면 계정, 아니면 브라우저 | 규칙의 유일한 출처. 화면·BFF가 "로그인했나"를 다시 판단하지 않는다. **두 서비스가 같이 쓴다** — 사주 성향도 이 키로 저장된다 |
  | `_data/advice.ts` | AI 판단 게이트 · 소유자 키 | 상한 판정이 화면과 BFF 두 곳에 갈라지지 않게 |
  | `_data/admin.ts` | `requireAdmin()` — 관리자가 아니면 404 | 판단 **규칙**은 `lib/auth/admin`의 순수 함수, 세션을 읽는 일만 여기 |

  `_data/` 는 **서비스 그룹 밖, `app/` 바로 아래**다. 소유자 키를 두 서비스가 같이
  쓰기 때문이고, 한쪽 그룹에 넣으면 다른 그룹이 남의 내부를 깊게 참조하게 된다.

- BFF 라우트가 공유하는 응답 헬퍼는 그 폴더의 `_helpers.ts`에 둔다
  (`app/api/watchlist/_helpers.ts` — 401·502 봉투). `_` 접두사 파일은 라우트가 아니다.
- **`app/api/` 는 서비스 그룹으로 나누지 않았다.** URL 이 이미 도메인별로 갈려
  있고(`/api/saju/*` · `/api/stocks/*`), 라우트 핸들러에는 레이아웃이 없어 그룹으로
  묶어 얻을 것이 없다. 나누면 폴더만 두 층 깊어진다.
- 라우트 그룹 `(name)/`은 URL에 나타나지 않는다. 레이아웃을 공유하거나 화면을 묶을 때 쓴다.
  이 프로젝트는 셋이다 — `(stock)` · `(saju)` · `(account)`. `/admin` 은 어디에도
  넣지 않았다: 계정 흐름이 아니라 운영 화면이고, `proxy.ts` 와 `requireAdmin()` 이
  앞뒤로 막는 별도의 문이다.

## 검증

```bash
cd front && npx tsc --noEmit && npm run lint && npm run build
```
