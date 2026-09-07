# back CI/CD — 승인된 계획

`back/` 을 GitHub push 만으로 Cloud Run 에 빌드·배포한다.

## 결정 사항 (사용자 승인)

| 항목 | 선택 | 근거 |
|---|---|---|
| GCP 인증 | Workload Identity Federation | GitHub 에 장기 자격증명을 남기지 않는다. 저장소가 **공개** 라 더 중요하다. |
| 마이그레이션 | Cloud Run Job 자동 실행 | `DATABASE_URL` 이 Secret Manager 밖으로 나가지 않는다. 실패 시 배포를 막는다. |
| 배포 전 게이트 | ruff + DB 불필요 테스트 364개 | 외부 시크릿 없이 CI 에서 돈다. |

## 핵심 원칙

`deploy.ps1` 이 어렵게 알아낸 것을 하나도 잃지 않는다 — BuildKit 필요(`--mount=type=cache`),
port 8000, `--no-cpu-throttling` + `--min-instances 1`(백그라운드 작업), `--max-instances 3`
(프로세스 로컬 캐시), `--env-vars-file`(CORS_ORIGINS 의 JSON 배열).

`deploy.ps1` 은 **삭제하지 않는다.** 비밀 *값* 을 `.env` 에서 Secret Manager 로 올리는
역할은 CI 가 대신할 수 없다.

| | 하는 일 |
|---|---|
| `deploy.ps1` (로컬·수동) | 비밀 **값** 갱신, API 활성화, 런타임 IAM |
| `setup-cicd.ps1` (로컬·1회) | WIF 풀·프로바이더·배포 SA 부트스트랩 |
| GitHub Actions (자동) | 검사 → 빌드 → 마이그레이션 → 배포 → 스모크 |

## 파이프라인

1. 트리거 — `main` push 중 `back/**` 변경 + `workflow_dispatch`, `concurrency` 로 앞 실행 취소
2. 게이트 — `uv sync --frozen` → `ruff check .` → `pytest` (`SKIP_DB_TESTS=1`)
3. 인증 — `google-github-actions/auth@v2` + WIF (**GitHub 시크릿 0개**)
4. 빌드 — `gcloud builds submit --config deploy/cloudbuild.yaml`, 태그 `<short-sha>-<run>`
5. 마이그레이션 — 같은 이미지로 Cloud Run Job `alembic upgrade head`, `--execute-now --wait`
6. 배포 — `gcloud run deploy` + `deploy/env.yaml` + `deploy/secret-keys.txt` 바인딩
7. 확인 — 새 URL `/health` 200 (재시도 10회)

## 보안 경계

- WIF 신뢰 대상은 **주체 하나**: `repo:john2002-lee/sajuStock:ref:refs/heads/main`.
  포크 PR·다른 브랜치·다른 저장소는 토큰을 못 받는다.
- 프로바이더에 `assertion.repository=='john2002-lee/sajuStock'` 조건을 이중으로 건다.
- 배포 SA 에 `secretmanager.secretAccessor` 를 **주지 않는다** — CI 가 비밀 *값* 을
  읽을 이유가 없다. 목록 조회용 `viewer`(메타데이터만) 만 준다.
