# 체크리스트

## 1. 라우팅
- [x] `src/lib/routing/legacy-paths.test.ts` 작성 (RED)
- [x] `src/lib/routing/legacy-paths.ts` 구현 (GREEN)
- [x] `proxy.ts` 에 `/saju` → `/` 307 연결
- [x] `app/(saju)/page.tsx` 신규 (기존 `saju/page.tsx` 내용)
- [x] `app/(saju)/saju/page.tsx` 삭제
- [x] `app/page.tsx` 삭제

## 2. 내비게이션
- [x] `SajuHeader` — 계정 항목 추가 · 링크 `/saju` → `/`
- [x] `ServiceBar.tsx` 삭제 + `(saju)/layout.tsx` 에서 제거 + 하단 패딩 제거
- [x] `Footer` 서비스 이동 줄 제거
- [x] `not-found.tsx` 주식 항목 제거
- [x] `SajuBand` 링크 `/saju` → `/`
- [x] `AdminShell` 주식 입구 버튼

## 3. 이름 · 메타
- [x] 천명 → FEEL (`SajuHeader` · `PayButton` orderName · `globals.css` 주석 · `(saju)/layout` 주석)
- [x] 종목 원장 → FEEL (`Wordmark` · `app/layout` · `(saju)/layout` · `(stock)/layout` · `(legal)/*` · `signup.ts`)
- [x] `robots.ts` — `/stock` · `/stocks/screener` allow → disallow

## 4. 검증
- [x] `npm test`
- [x] `npm run lint`
- [x] `npm run build`
- [x] dev 서버 실측: `/` 사주 렌더 · `/saju` 307 · `/saju/teaser` 생존 · `/stock` 열림 · `/admin` 버튼

## 실측 결과 (2026-09-14)

```
/                     200
/saju                 307 → /
/saju/                308 → /saju → 307 → /   (Next 가 슬래시를 먼저 정규화)
/saju/teaser          200
/saju/report          200
/saju/intro           200
/saju/reports/abc123  200   ← 구매자 주소가 살아 있다
/saju/pay/success     200
/stock                200   ← 링크만 감췄으므로 열린다(의도)
/sajustock            404   ← 접두 일치로 번지지 않는다
/admin                404   ← 익명 차단(기존 동작 유지)
```

- 루트 렌더: 사주 입력 화면 · 제목 `사주팔자 · FEEL` · 워드마크 FEEL
- 헤더 메뉴: 화면 밝기 / 이동(사주 보기 · 서비스 소개) / 계정(로그인) — 주식 없음
- 공개 루트의 `a[href^="/stock"]` = **0개**, 하단 바 없음
- 푸터: 이용약관 · 개인정보처리방침 · 서비스 소개 (서비스 이동 줄 사라짐)
- 404: 주식 링크·검색 팔레트·탭바·시가총액 조회 전부 제거됨
- robots.txt: `/stock` · `/stocks` disallow 확인
- `/stock` 회귀 없음: 제목 `주식 · FEEL`, SajuBand → `/`

## 남은 확인 — 사용자 몫

**관리자 화면의 "주식 서비스 →" 버튼은 로그인한 관리자 세션이 필요해 실측하지
못했다.** 빌드 타입체크·lint 는 통과했다. `/login` 으로 관리자 계정 로그인 후
`/admin` 에서 탭 줄 우측을 확인할 것.

## 후속

- 친구 공유 버튼 (설계 완료, 미착수) — 공유 주소는 이제 origin 루트
- 법적 문서 본문의 서비스명을 FEEL 로 바꿨다. **사업자 정보와 일치하는지 확인 필요**

---

# 친구 공유 버튼 (이어서 · 완료)

## 결정

- 공유되는 것은 **주소 하나**. 사주 결과·생년월일시·식별자를 링크에 싣지 않는다.
  그래서 서버도 저장도 공유 토큰도 없다 — 주식 쪽 `/verdict/{shareId}` 와 다른 점.
- `navigator.share`(OS 공유 시트) 우선 → 없으면 클립보드. **카카오 SDK 를 쓰지 않는다**:
  공유 시트가 모바일에서 카톡을 포함해 전부 커버하는데, SDK 는 카톡 하나만 커버하면서
  JS 키·도메인 등록·스크립트 로드를 요구한다.
- 취소(`AbortError`)는 실패가 아니며 **클립보드를 건드리지 않는다**.
- OG 카드 포함. 공유 기능의 결과물은 친구 채팅창에 도착하는 그 카드다.

## 파일

신규
- `src/features/saju/model/share.ts` · `share.test.ts` — 순수 로직(테스트 가능 경계)
- `src/features/saju/components/ShareButton.tsx` — `navigator` 를 집는 유일한 자리
- `src/app/opengraph-image.tsx` — 1200×630 정적 카드

수정
- `TeaserView`(관례 고지 앞) · `WebtoonReport`(대화 뒤·일러두기 앞) — 무료/유료 리포트가
  `WebtoonReport` 를 함께 쓰므로 한 곳이 두 화면을 덮는다
- `app/layout.tsx` — `metadataBase` + `openGraph`
- `lib/config/public.ts` — `APP_ORIGIN`
- `shared/ui/Icon.tsx` — `share` 아이콘
- `features/saju/index.ts` — 배럴

## 실측 결과 (2026-09-14)

테스트 205 통과(0 fail) · lint 클린 · build 성공 · `/opengraph-image` 정적 생성(○)

OG 메타 — `/` 응답에서 확인
```
og:title FEEL · 사주팔자   og:site_name FEEL   og:locale ko_KR
og:image /opengraph-image  og:image:width 1200  og:image:height 630
twitter:card summary_large_image
```
OG 카드 이미지: 한글 정상 렌더(빈 네모 아님), FEEL 워드마크·헤드라인·오행 다섯 점 확인.

티저 화면(`/saju/teaser`)에서 버튼 렌더 확인(44px 탭 영역). 동일 컴포넌트로 세 경로 확인:

| 상황 | 결과 |
|---|---|
| 공유 시트 있음 | `share({title:"FEEL · 사주팔자", text:…, url:"http://localhost:3000"})` 호출, 안내 문구 없음 |
| 사용자가 시트 닫음 | **클립보드 호출 0회**, 안내 문구 없음 |
| 시트 없음 | `writeText("http://localhost:3000")`, "링크 복사됨" |
| 클립보드 권한 거부 | "복사하지 못했습니다" (임베디드 브라우저 실제 `NotAllowedError` 로 확인) |

## 확인하지 못한 것

**`WebtoonReport`(무료/유료 리포트) 안의 버튼은 라이브 렌더로 확인하지 못했다.**
빌드 타입체크는 통과했고 티저와 **같은 컴포넌트**다.

막힌 이유는 이 작업과 무관하다 — 작업 트리에 커밋되지 않은 진행 중 변경
(`back/app/integrations/amplitude.py` · `back/app/api/v1/endpoints/saju.py`)에서
리포트 생성이 깨져 있다:

```
POST /api/v1/saju/report/jobs → 202 Accepted
amplitude.exception.InvalidEventError: Invalid event.   ← 여기서 작업이 죽는다
GET  /api/saju/report/jobs/{id} → 404                   ← 작업이 사라져 화면은 "풀이 실패"
```

`/saju/report` 를 열면 30초 뒤 "요청이 실패했습니다 (404)" 가 뜬다. 공유 버튼과 무관하며,
그 amplitude 계측이 정리되면 리포트 화면에서 버튼도 함께 보인다.

## 로컬 실행 메모

셸의 `GEMINI_API_KEY` 가 **빈 값**이라 `back/.env` 를 덮고 있었고 `GEMINI_MODEL` 도
이미지 모델(`gemini-3-pro-image-preview`)이었다. 백엔드는 이렇게 띄워야 한다:

```
env -u GEMINI_API_KEY -u GEMINI_MODEL uv run uvicorn main:app --port 8000
```
