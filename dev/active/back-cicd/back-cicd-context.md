# back CI/CD — 컨텍스트

Last Updated: 2026-09-07

## GCP 현재 상태 (실측)

| 항목 | 값 |
|---|---|
| 프로젝트 ID | `project-b6d7001f-3a61-4b53-a5d` |
| 프로젝트 번호 | `997442788415` |
| 리전 | `asia-northeast1` (Supabase 옆 — DB 왕복이 사용자 왕복보다 많다) |
| Cloud Run 서비스 | `sajustock-back` → https://sajustock-back-nxphe5tmeq-an.a.run.app |
| 런타임 SA | `997442788415-compute@developer.gserviceaccount.com` |
| Artifact Registry | `cloud-run-source-deploy` (DOCKER, asia-northeast1) |
| 빌드 로그/스테이징 버킷 | `gs://project-b6d7001f-3a61-4b53-a5d_cloudbuild` (US) |
| Secret Manager | 8개: DATABASE_URL, GEMINI_API_KEY, ADVICE_API_KEY, ADMIN_API_KEY, TOSS_SECRET_KEY, SAJU_ACCESS_TOKEN_SECRET, KRX_ID, KRX_PW |
| WIF 풀 | (없었음 → `github` 생성) |
| 배포 SA | (없었음 → `github-deployer@…` 생성) |

## GitHub

- 저장소 `john2002-lee/sajuStock` — **public**, 기본 브랜치 `main`
- `gh` CLI 미인증 → 시크릿을 CLI 로 넣을 수 없다. **WIF 를 고른 이유 중 하나** (시크릿 0개)

## 핵심 파일

| 파일 | 역할 |
|---|---|
| `back/Dockerfile` | `RUN --mount=type=cache` → **BuildKit 필수**. CMD 포트 8000. alembic·scripts 포함 |
| `back/deploy/cloudbuild.yaml` | `DOCKER_BUILDKIT=1` + `--progress=plain`. `_IMAGE` 치환 |
| `back/deploy/env.yaml` | 비밀 아닌 env. CORS_ORIGINS JSON 배열 때문에 파일이어야 한다 |
| `back/deploy/secret-keys.txt` | **신규** 바인딩 키 목록 단일 출처 |
| `back/deploy/gcloud-lib.ps1` | **신규** gcloud 호출 헬퍼 (deploy.ps1 에서 추출) |
| `back/deploy/setup-cicd.ps1` | **신규** WIF·배포 SA 1회 부트스트랩 |
| `.github/workflows/back-deploy.yml` | **신규** 파이프라인 |
| `back/tests/conftest.py` | DB 의존이 `pg_engine` 픽스처 하나로 모임 → CI 선별의 판정 기준 |

## 의사결정 기록

- **이미지 태그를 타임스탬프 → `<short-sha>-<run>`**: 도는 리비전이 어느 커밋인지
  이름으로 보여야 롤백 지점을 가리킬 수 있다.
- **`--source` 금지**: 레거시 빌더로 돌아 `--mount` 에서 죽는다 (cloudbuild.yaml 머리말).
- **DB 테스트 선별을 파일명/마커가 아니라 `pg_engine` 픽스처 클로저로**: 테스트가
  추가될 때마다 목록이 어긋나지 않는다. 183(DB) / 364(무DB) 로 정확히 갈린다.
- **`SKIP_DB_TESTS` 플래그 없이는 conftest 동작 불변**: 개발자가 `TEST_DATABASE_URL`
  을 빠뜨린 채 "183개가 조용히 skip 됐다" 를 못 보는 일을 만들지 않는다.
- **CI 는 secret-keys.txt 를 Secret Manager 목록과 교집합**하고 없는 키는 **경고**로
  남긴다. 하드 실패로 두면 키 하나 때문에 배포 전체가 죽고, 조용히 넘기면
  Amplitude 처럼 "운영에서만 꺼져 있는" 상태가 다시 생긴다.

## 미해결 / 사용자 판단 필요

- `AMPLITUDE_AI_API_KEY` 가 `.env`·`.env.example` 에는 있으나 Secret Manager 에 없다.
  → **지금 운영 백엔드는 Amplitude 키 없이 돈다.** 올리려면 `secret-keys.txt` 에 한 줄
  추가하고 `deploy.ps1` 을 로컬에서 한 번 돌려야 한다 (값 업로드는 CI 가 못 한다).
