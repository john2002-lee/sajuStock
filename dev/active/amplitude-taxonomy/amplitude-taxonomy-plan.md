# 사주 Amplitude 택소노미 — 계획

## 범위

**사주 서비스만** (`/saju/*`). 주식 서비스는 사용자 지시로 제외.

## 목적

천 원짜리 사주 리포트 구매 퍼널에서 사람이 어디서 새는지 측정한다.
제품에서 돈이 오가는 유일한 경로이므로 여기에 이벤트 예산을 집중한다.

## 확정된 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 최우선 질문 | "어디서 사기를 포기하는가" | 1,000원 리포트가 유일 매출원 |
| 이벤트 카테고리 | `saju_purchase` · `saju_engagement` 2개 | 구매 퍼널이 6단계라 심화와 합치면 가독성 붕괴 |
| 최종 전환 | 결제가 아니라 **열람** (`saju_report_viewed`) | 생성이 비동기 잡이라 승인↔열람 사이에 실제 이탈 구간이 있다 |
| 네이밍 | `saju_{객체}_{동사 과거형}` snake_case | 주식 합류 시 `stock_` 과 이름만으로 갈림 |
| 서비스 구분 | 이벤트명 접두사 | 프로퍼티 필터 없이 퍼널 조립. 합칠 땐 Custom Event |
| 분석 단위 | Device ID | 사주는 로그인이 없다 (`/api/v1/saju/*` 에 auth 의존성 없음) |
| 상속 | `root_path` `report_tier` `day_master` `dominant_element` `is_time_unknown` 5종 | Holding Constant 가 실제로 필요한 축만 |

## 이벤트 규모

- Required 15개 + Phase 2 3개 = 18개
- 결제 1건당 약 15 이벤트, 이탈자 4 이벤트
- MAU 1만 · 결제율 2% → 월 약 43,000 이벤트

## 산출물

| 파일 | 상태 |
|---|---|
| `docs/analytics/saju-amplitude-taxonomy.md` | 완료 |
| `docs/analytics/saju-event-properties.csv` | 완료 |
| `docs/analytics/saju-user-properties.csv` | 완료 |
| 프런트 계측 코드 | **미착수 — 사용자 승인 대기** |

## 구현 단계 (승인 후)

1. `shared/analytics/events.ts` — 이벤트명·프로퍼티 타입 단일 정의 + `trackSaju()` 래퍼
2. `features/saju/model/analytics-context.ts` — 상속 컨텍스트 sessionStorage 보관
3. `shared/analytics/redact.ts` — 금지 키 하드 블록 추가 (테스트 먼저)
4. 퍼널 이벤트 15개 계측 (C1 13개 → C2 4개 순)
5. `AmplitudeProvider.tsx` 의 `Viewed Home Page` 제거
6. QA — 로컬에서 Amplitude 디버거로 적재 확인
