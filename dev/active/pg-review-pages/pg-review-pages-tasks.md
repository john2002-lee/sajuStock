# pg-review-pages — 체크리스트

**Last Updated:** 2026-09-21

## 1단계 — 결제 복구 ✅
- [x] `lib/config/payment-mode.ts` — `isTestPaymentKey`, 고지 문구 (+테스트 9건)
- [x] 무료 이벤트 **삭제** (`model/event.ts`·테스트·barrel·두 페이지 호출부)
      — 계획은 "남긴다" 였으나, paywall 게이트가 생기면서 다시 켜는 순간
      고장 나는 덫이 되어 지우는 쪽으로 바꿨다
- [x] `NoticePopup.tsx` (구 `EventPopup`) — 테스트 결제 고지, 새 dismiss 키
- [x] `PayButton.tsx` — 무료 분기 제거, 테스트 고지, `disabled` prop
- [x] `TeaserView.tsx` — 구매 카드를 `PurchaseCard` 로 분리
- [x] `PurchaseCard.tsx` (신규) — 결제 전 고지 + 청약철회 동의 + 세 가지 상태
- [x] `model/types.ts` — `PaymentState` (loading / ready / unreachable)
- [x] `TeaserScreen.tsx` — 설정 조회 **실패**와 "서버가 껐다" 를 분리 + 재시도

## 1단계 — paywall 게이트 ✅
- [x] `_deny_unpaid_full_reading` — `/report`, `/report/jobs`, `/followup`,
      `/followup/jobs` 넷. `birth` 를 들고 오면 미결제 요청
- [x] `tests/test_saju_paywall.py` — 5건 통과
- [x] `POST /chart` 는 열어 둔다 (실제 무료 상품)
- [x] `ReportScreen.tsx` — 402 를 일반 실패와 다르게 안내

## 2단계 — 사업자 정보·문의처 ✅
- [x] `shared/legal/business.ts` — `NEXT_PUBLIC_BIZ_*` (ASCII), `IS_PLACEHOLDER`
      파생화, 전부 아니면 전무, `000-00-00000` 거부, 전화번호·호스팅 추가
- [x] `shared/legal/business.test.ts` — 16건 (주석이 약속만 하던 그 테스트)
- [x] `.env.deploy` — `NEXT_PUBLIC_SUPPORT_EMAIL=maverock@daum.net` + BIZ 자리

## 3단계 — 법적 페이지 ✅
- [x] `app/(legal)/_components/Section.tsx` — 두 벌 중복 통합 + `DocHeading`
- [x] `app/(legal)/_components/BusinessInfoTable.tsx` — 표 + 임시값 고지 + 공정위 링크
- [x] `shared/legal/refund.ts` — 약속 문장·접수 항목·상황별 기준
- [x] `app/(legal)/refund/page.tsx` (신규)
- [x] `app/(legal)/support/page.tsx` (신규)
- [x] `terms/page.tsx` — 제1·2조에서 주식·성향결합 삭제, 제3조 회원→계정 없음,
      제6조가 `/refund` 를 가리킴, 제10조 표를 공용 컴포넌트로
- [x] `privacy/page.tsx` — 공용 컴포넌트 적용, 고객센터 링크
- [x] `(legal)/layout.tsx` — 내비에 환불정책·고객센터
- [x] `PaySuccessScreen`·`PaidReportScreen` — `/support` 링크 **무조건**

## 4단계 — 구매 전 고지·가격 노출 ✅
- [x] `lib/config/public.ts` — `REPORT_PRICE` (정적. 백엔드 조회 안 함)
- [x] `back/tests` — `saju_report_price == 1000` 을 못박아 복사본 동기화 강제
- [x] `IntroStory.tsx` — 공개 경로에 가격·제공 시점·보관·환불 (`#가격` 앵커)
- [x] `model/product.ts` — 상품명·구성·제공 시점 한 벌
- [x] `PurchaseCard` — 결제 **전** 상품 고지

## 5단계 — 입력 화면 개인정보 고지 ✅
- [x] `BirthForm.tsx` — 수집 항목·목적·보관 + `/privacy`, 모바일에서도 보임

## 6단계 — 광고 표현 ✅
- [x] `SajuEntry.tsx` — "정확하게 읽습니다" → "시간부터 바로잡습니다"
- [x] `app/opengraph-image.tsx` — 같은 문구 (함께)

## 7단계 — 보관 기간 통일 ✅
- [x] `Footer.tsx` — 30일 하드코딩 → `RETENTION_DAYS`, 사업자 정보, 신규 링크
- [x] `IntroStory.tsx` — 같은 처리
- [x] 낡은 주석 셋 정정 (방침·config·env.deploy 의 "파기 코드 없음"·"백엔드 30")

## 검증 ✅
- [x] `npm test` — 339건 통과 (신규 25건)
- [x] `pytest` — 408 통과 / 183 에러(죽은 `TEST_DATABASE_URL`, 기존 그대로)
- [x] `npx tsc --noEmit` · `eslint` — 깨끗
- [x] `npm run build` — 성공, `/refund`·`/support` 라우트 생성 확인
- [x] 브라우저: 입력 → 티저에 가격·고지·동의·결제 버튼 → 주문 200 →
      토스 SDK 로드·결제창 요청 (SDK `window.TossPayments` 확인)
- [x] `/saju/report` 직접 접근 → **402**, 구매 안내 화면
- [x] 동의 전 결제 버튼 `disabled`, 동의 후 활성화
- [x] `/refund`·`/support` 렌더, 푸터 링크 전 화면, 보관 7일로 통일

## 남은 일 (코드 아님)
- [x] **Vercel 환경변수** — `NEXT_PUBLIC_SUPPORT_EMAIL`,
      `NEXT_PUBLIC_SAJU_RETENTION_DAYS=7`. 빌드 시점에 박히므로 **넣고 재배포**
- [x] 사업자등록증 발급 후 `NEXT_PUBLIC_BIZ_*` 채우기 (2026-10-19, 통신판매업은 간이과세자 면제)
      → 그 순간 임시값 고지가 내려가고 푸터 사업자 정보가 켜진다
- [ ] 심사 통과 후 라이브 키 교체 → 테스트 고지가 저절로 사라짐
      (백엔드 시크릿과 프런트 키를 **함께** 바꾸고 재배포)
- [x] 커밋·배포 완료 (2026-09-22)

## 2026-10-19 — 심사 신청 직전 보강

- [x] 약관 제5조의2 (미성년자의 결제) + 환불 기준표 같은 문장 (`MINOR_CANCELLATION`, 테스트 2건)
- [x] 소개 페이지 가격 박스에 상품 이미지 — 예시 생년월일(1990-05-15 09:30 서울)로 실제
      생성한 리포트 화면 캡처 `front/public/saju/report-sample.webp`
- [x] 공유 OG 이미지에 남아 있던 "정확하게 읽습니다" 제거
- [x] `docs/pg-심사-서비스설명서.md` — 계약 담당자 전달용. 사업자 칸은 `[ ]`
- [x] 사업자등록 (584-06-03695, 에이아이오티(AIOT)) → Vercel `NEXT_PUBLIC_BIZ_*` 5개 + 문의 이메일 cs@aiot21.com
- [x] 통신판매업 번호가 비면 그 칸만 "신고 준비 중" (나머지는 실제 값). 공정위 조회 링크는 숨김
- [x] 간이과세자 확인(등록증) → 통신판매업 신고 면제. `NEXT_PUBLIC_BIZ_ECOMMERCE_NO=간이과세자 신고 면제`,
      주소는 등록증 그대로. 공정위 링크는 신고번호 형식일 때만(`ecommerceListed`)
- [ ] **소유자**: 토스 계약 신청 (설명서 전달)
- [ ] **소유자 결정 대기**: `/stocks` 가 공개로 열려 있음 (AI 투자 판단). 같은 도메인이라
      '유사투자자문' 업종으로 분류될 위험 — 심사 전 비공개 처리 여부
- 주의: 로컬 백엔드는 운영 DB 를 본다. 띄우면 파기 배치가 돌아 만료 주문을 지운다
  (2026-10-19 에 2건, 7일 보관 정책상 어차피 지워질 주문)
