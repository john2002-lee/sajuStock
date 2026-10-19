# 태스크

Last Updated: 2026-10-19

- [x] 견본 미리보기 생성(`back/scripts/make_talisman_images.py`) + 디자인 시안 비교 → B안
- [x] 백엔드: 카탈로그·모델·마이그레이션(d8e3f5a17b42)·리포지토리·서비스·엔드포인트 (TDD, 31 tests)
- [x] 백엔드: 원본 업로드 스크립트(`scripts/upload_talisman_assets.py`, 기본 모의 실행)
- [x] 프런트: features/talisman (model 테스트), 카드 섹션, BFF, 성공/실패/주문 페이지
- [x] 법적 표시: 약관 제1·2·4·5·5의2·6조, 환불정책, 개인정보처리방침
- [x] pytest(474 pass, DB 194 skip — TEST_DATABASE_URL 죽어 있음)·ruff·npm test·tsc·lint
- [x] 코드 리뷰 반영 (paid_at 없을 때 영구 링크 · 동시 승인 덮어쓰기 · upsert updated_at · content-length · Strict Mode)
- [x] 로컬 E2E: Toss 샌드박스 계좌이체 결제 → 승인 → 다운로드 sha256 일치 (jinheung)
- [x] 사용자 요청: **일회 다운로드** (`downloaded_at`, 조건부 UPDATE, 410 `talisman_already_downloaded`) — E2E 확인 (silver)
- [x] 최종: pytest 484 pass/194 skip · ruff · tsc · lint · npm test 389 · next build
- [x] 사용자 추가 요청: 부적 설명 격 올림(만사형통·벽사수호·무병강녕), 추석·오픈 팝업 제거(`(saju)/page.tsx`), 로또 3→5세트(구름·번개 표식 추가)
- [x] 부적 원본·견본 오른쪽 아래 `aiot21.com` (테두리 색)
- [x] 메인 좌우 분위기 그림(`AmbientSides`, xl 이상, 라이트 0.14 multiply / 다크 0.28 screen). 두 번째 이미지는 문구 제거(push-pull 보간) 후 사용 — 스크립트는 스크래치패드 `ambient/remove_text.py`
- [ ] 커밋 (사용자 승인 대기 — `git add -A` 금지, 파일 지정)
- [ ] (사용자 승인 후) main 푸시 + 운영 DB 에 원본 업로드 `--apply`

## 로컬 E2E 환경 (운영 DB 미사용)
- 임시 Postgres: 스크래치패드 `pgdata`, 포트 5433, trust, DB `talisman_e2e`
  (pgvector 없음 → `alembic stamp c6a2e58b13df` 후 새 리비전만 upgrade)
- 백엔드 8010 / 프런트 3010 (`next build` + `next start`; 3000·8000 은 다른 세션 것)
- launch.json: `back-talisman-e2e`, `front-talisman-e2e` (C:\AIOT21\.claude\launch.json)
