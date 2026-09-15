# 컨텍스트

Last Updated: 2026-09-14

## 핵심 파일

### 루트 라우팅
| 파일 | 역할 | 할 일 |
|---|---|---|
| `front/src/app/page.tsx` | 서비스 선택(갈림길) | **삭제** |
| `front/src/app/(saju)/saju/page.tsx` | 사주 입력 화면 | `(saju)/page.tsx` 로 이동 |
| `front/src/proxy.ts` | Next 16 미들웨어(이름이 `middleware.ts` 가 아님) | `/saju` → `/` 307 추가 |
| `front/src/app/(saju)/layout.tsx` | 사주 셸 · `data-service="saju"` 팔레트 | ServiceBar 제거 · 하단 패딩 제거 · title |

### 내비게이션
| 파일 | 할 일 |
|---|---|
| `front/src/shared/components/layout/ServiceBar.tsx` | **삭제** |
| `front/src/shared/components/layout/Footer.tsx` | 서비스 이동 줄 제거(법적 문서 줄은 유지) |
| `front/src/features/saju/components/SajuHeader.tsx` | 워드마크 FEEL · 계정 항목 추가 · `/saju` → `/` |
| `front/src/app/not-found.tsx` | 주식 항목 제거 |
| `front/src/app/(stock)/stock/_components/SajuBand.tsx` | `/saju` → `/` |
| `front/src/app/admin/_components/AdminShell.tsx` | 탭 줄 우측에 주식 입구 |

### 이름 · 메타
`app/layout.tsx` · `(saju)/layout.tsx` · `(stock)/layout.tsx` · `(legal)/layout.tsx` ·
`(legal)/terms|privacy` · `lib/auth/signup.ts` · `shared/components/layout/Wordmark.tsx` ·
`features/saju/components/PayButton.tsx`(orderName) · `app/globals.css`(주석) · `app/robots.ts`

## 반드시 지킬 제약

1. **`/saju` 하위는 건드리지 않는다.** `/saju/teaser` · `/saju/report` · `/saju/intro` ·
   `/saju/reports/{token}` · `/saju/pay/*` 는 그대로 살아 있어야 한다.
   리다이렉트는 `pathname === "/saju"` 정확 일치만.
2. **로그인 길을 잃지 않는다.** `app/page.tsx` 가 사주 표면에서 `AccountMenu` 를 든
   유일한 자리였다. 지우기 전에 `SajuHeader` 메뉴에 계정 항목을 넣는다.
   그러지 않으면 관리자가 로그인할 문이 없어지고, 그러면 주식 입구에도 못 간다.
3. **페이지 `redirect()` 금지.** 위 plan 의 Suspense 함정.
4. `app/page.tsx` 와 `app/(saju)/page.tsx` 는 **둘 다 `/`** 다. 공존하면 빌드가 깨진다.

## 테스트

프런트 러너는 `node --test` + `src/**/*.test.ts` 뿐 — **`.tsx` 는 테스트할 수 없다.**
그래서 리다이렉트 **경로 판정만** 순수 함수로 빼서 `src/lib/routing/legacy-paths.ts` 에 두고
`legacy-paths.test.ts` 로 덮는다. `proxy.ts` 는 그 함수를 부르기만 한다.

## 제품 이름

- 공개 표면(사주): `SajuHeader` 워드마크 = **FEEL**
- `Wordmark` 컴포넌트(계정·관리자·주식·404): "종목 원장. The Stock Ledger" → **FEEL.**
  영문 부제는 주식 전용 문구라 뗀다.
- 법적 문서 본문의 서비스명도 FEEL — **사업자 정보와 일치하는지 사용자 확인 필요**
