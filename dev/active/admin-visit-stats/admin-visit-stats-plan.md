# 관리자 접속 통계 — 승인된 계획

Last Updated: 2026-09-07

## 요구

관리자 화면에서 볼 수 있어야 하는 것 넷:

1. 총접속자수
2. 일일접속자수
3. 회원별 접속수
4. 최근 접속일시

## 승인된 결정

| 질문 | 결정 |
|---|---|
| "접속 1회" | **하루 1회** — 같은 사람이 하루에 여러 번 와도 1회 |
| 익명 방문자 | **포함** — `ledger.owner` 쿠키로 센다 |
| anon → user 승계 | **하지 않는다** (기본값). 승계하면 "회원별 접속수"에 로그인 전 익명 방문이 섞여 숫자의 뜻이 흐려진다 |

## 지금 없는 것 / 이미 있는 것

- **없다**: 접속 이력 테이블. 현재 `active_sessions` 는 NextAuth `sessions` 의
  미만료 세션 수(`repositories/admin.py:154`)로 "지금 로그인 중"에 가깝다
- **있다**: 방문자 신원. `proxy.ts` 가 `ledger.owner` 쿠키를 굽는다 —
  `anon:<uuid>` httpOnly 1년, 로그인 시 `user:<uuid>`
  (`lib/watchlist/anon-cookie.ts`). `watchlist_items.owner_key` 와 같은 규약
- **무관**: 작업 트리의 Amplitude 작업. 백엔드는 LLM 호출 분석,
  프런트는 페이지뷰를 Amplitude 로 보내지만 **우리 DB 에는 남지 않아**
  관리자 화면에서 조회·조인이 불가

## 구현 순서

1. `visit_days` 모델 + 마이그레이션 (부모 = head `a1e6f38b72d4`)
2. 백엔드 upsert 경로 (`POST /api/v1/visits/touch`, `X-Owner-Key`)
3. 백엔드 조회 (`GET /api/v1/admin/visits`, `X-Admin-Key`)
4. 프런트 BFF (`/api/visit`) + `VisitBeacon` (루트 레이아웃)
5. 프런트 화면 (`/admin/visits` 탭 + `VisitPanel`)
6. 테스트

## 타임존 — 이 작업의 유일한 함정

DB 는 UTC, "일일 접속자수"는 KST 자정 기준. `visit_date` 를 **쓰는 시점에 KST 로
환산해 저장**한다. 조회할 때마다 `at time zone` 을 붙이면 인덱스를 못 타고,
한 곳만 빠뜨려도 날짜가 9시간 밀린다.

## 보류 — 사용자 결정 대기

**개인정보처리방침.** 방문 이력은 개인정보다. 이 저장소는 보관 기간을 명시하는
관례가 있고(`saju_order_retention_days=30`, 화면이 같은 숫자를 말한다), 방문 이력도
기간·수집 항목을 방침에 적어야 한다. 기간이 정해지면 상수 + 정리 스크립트를
`scripts/cleanup_orphans.py` 형태로 만든다.
