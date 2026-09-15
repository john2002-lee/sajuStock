# 관리자 접속 통계 — 체크리스트

Last Updated: 2026-09-07

## 1. 데이터

- [ ] `back/app/models/visit_day.py` — `visit_days` 모델
      (`owner_key` String(80) · `visit_date` Date · `first_seen_at`/`last_seen_at` · `hits`)
- [ ] `UniqueConstraint(owner_key, visit_date)` + `Index(visit_date)` + `Index(owner_key)`
- [ ] `back/app/models/__init__.py` 에 등록 (alembic autogenerate 가 보게)
- [ ] 마이그레이션 신규 리비전 (부모 `a1e6f38b72d4`)
- [ ] `alembic check` drift 0

## 2. 백엔드 기록

- [ ] `back/app/domain/visits.py` — KST 날짜 계산 **순수 함수** (DB 없이 테스트 가능하게)
- [ ] `back/app/repositories/visit.py` — `touch(owner_key)` upsert (`ON CONFLICT DO UPDATE`)
- [ ] `back/app/api/v1/endpoints/visits.py` — `POST /visits/touch` (`X-Owner-Key`)
- [ ] `back/app/api/v1/router.py` 에 라우터 등록

## 3. 백엔드 조회

- [ ] `repositories/visit.py` — 집계: 총 방문자/방문일, 오늘(KST), 30일 추이, 익명·회원 분리
- [ ] `repositories/visit.py` — 회원별: `user:` 필터 → `users` 조인 → 접속수·최근 접속일시
      (**결정적 타이브레이크 `u.id` 필수**)
- [ ] `back/app/schemas/admin.py` — `VisitStats` 스키마
- [ ] `back/app/api/v1/endpoints/admin.py` — `GET /admin/visits`

## 4. 프런트 기록

- [ ] `front/src/app/api/visit/route.ts` — 쿠키에서 owner 읽어 백엔드로 (본문 금지)
- [ ] `front/src/shared/analytics/VisitBeacon.tsx` — 탭당 1회, 실패 삼킴
- [ ] `front/src/app/layout.tsx` 에 마운트 (**남이 수정 중인 파일 — 충돌 주의**)

## 5. 프런트 화면

- [ ] `AdminShell` 탭 추가 (`"ops" | "users" | "visits"`)
- [ ] `features/common/admin/model/types.ts` — `VisitStats` 타입 + wire 타입
- [ ] `features/common/admin/services/adminApi.ts` — `fetchVisits(actor)`
- [ ] `features/common/admin/components/VisitPanel.tsx`
- [ ] `features/common/admin/index.ts` 재수출
- [ ] `front/src/app/admin/visits/page.tsx` — `requireAdmin()` 를 페이지가 부른다

## 6. 테스트

- [ ] `back/tests/test_visits.py`
      - [ ] KST 날짜 경계 (UTC 15:00 → KST 다음날) — 순수 함수라 DB 불필요
      - [ ] upsert 멱등 (같은 날 두 번 → 1행, `hits` 2)
      - [ ] 익명·회원 분리 집계
      - [ ] 회원 조인이 `user:` 접두사만 집는지
- [ ] 관리자 키 없이 접근 차단 확인

## 7. 검증

- [ ] `ruff check .`
- [ ] `pytest -q --tb=no` — **기준선 364 passed / 183 errors 대비 실패 0 유지**
- [ ] `tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npm test` — cancelled 7 유지 (기존 flake)
- [ ] 실제 브라우저: 시크릿 창 방문 → `anon:` 행 1건 → 새로고침 → 행 안 늘고 `hits` 증가
- [ ] `/admin/visits` 숫자가 DB 와 일치

## 보류

- [ ] 개인정보처리방침 문구 + 보관 기간 상수 + 정리 스크립트 (**사용자 결정 대기**)
