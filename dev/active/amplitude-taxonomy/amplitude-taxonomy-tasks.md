# 사주 Amplitude 택소노미 — 체크리스트

## Phase 0 · 설계 (완료)

- [x] 블로그 5편 방법론 정리 (마티니 — 네이버 시리즈 2편 · 버거킹 3편)
- [x] 코드에서 실제 사주 유저 플로우 확인 (무료/유료 경로 분기 포함)
- [x] 기존 Amplitude 설정 파악 (오토캡처 3종 · 리댁션 · 세션 리플레이 마스킹)
- [x] 이벤트 카테고리 2개 정의
- [x] 이벤트 18개 정의 (Required 15 · Phase 2 3)
- [x] 상속 컨텍스트 5종 정의
- [x] PII 경계 정의 (금지 목록 · 허용 근거)
- [x] 유저 프로퍼티 12개 + 금지 항목 8개 정의
- [x] `docs/analytics/saju-amplitude-taxonomy.md`
- [x] `docs/analytics/saju-event-properties.csv`
- [x] `docs/analytics/saju-user-properties.csv`

## Phase 1 · 계측 기반 (완료 · 40개 테스트 통과 · tsc 통과)

- [x] `shared/analytics/events.ts` — 이벤트명 상수 · 프로퍼티 타입 · `buildPayload` (SDK 를 모르는 순수 모듈)
- [x] `shared/analytics/track.ts` — SDK 를 부르는 유일한 자리
- [x] `features/saju/model/analytics.ts` — `trackSaju()` 래퍼
- [x] `features/saju/model/analytics-context.ts` — 상속 컨텍스트 sessionStorage 보관/병합
- [x] `shared/analytics/redact.ts` — 금지 키 하드 블록 (테스트 먼저: `redact.test.ts`)
- [x] `AmplitudeProvider.tsx` — `Viewed Home Page` 제거

## Phase 2 · 구매 퍼널 계측 (C1) — 완료

- [x] `saju_entry_viewed`
- [x] `saju_birth_submitted`
- [x] `saju_chart_calculated` / `saju_chart_failed`
- [x] `saju_teaser_viewed`
- [x] `saju_purchase_clicked`
- [x] `saju_checkout_opened`
- [x] `saju_payment_confirmed` (+ Amplitude Revenue)
- [x] `saju_payment_failed`
- [x] `saju_report_viewed`
- [x] `saju_report_failed`

## Phase 3 · 심화 계측 (C2) — 완료

- [x] `saju_followup_asked`
- [x] `saju_followup_answered`
- [x] `saju_report_reopened`
- [x] `saju_followup_failed` (추가)
- [x] `saju_site_shared` (추가 — 공유 버튼이 새로 생겼다)

## Phase 4 · 유저 프로퍼티 — 완료

- [x] `setOnce` 3종 (`first_root_path` `first_seen_at` `first_purchased_at`)
- [x] `add` 4종 (`saju_chart_count` `saju_purchase_count` `lifetime_revenue_krw` `followup_total_count`)
- [x] `set` 3종 (`last_purchased_at` `is_payer`)
- [x] `preInsert` 1종 (`report_tier_seen`)
- [x] `preferred_calendar_type` · `theme` 는 **빼기로 결정** — 이력을 보관하지 않아 최빈값을 낼 수 없다

## Phase 5 · QA (완료 증명)

- [ ] 로컬에서 무료 경로 전 구간 이벤트 적재 확인
- [ ] 로컬에서 유료 경로 전 구간 이벤트 적재 확인 (토스 테스트 키)
- [ ] 금지 키가 단 하나도 나가지 않는지 네트워크 페이로드로 확인
- [ ] Amplitude 에서 퍼널 차트 1개 실제 조립 (티저 → 열람)

## Phase 6 · 선택 (Phase 2 이벤트)

- [ ] `saju_intro_completed`
- [ ] `saju_expired_report_opened`
- [ ] `saju_followup_input_abandoned`
