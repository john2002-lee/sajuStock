# back CI/CD — 컨텍스트

Last Updated: 2026-09-07 (첫 실행 실패 분석 반영)

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

## 첫 실행 실패 분석 (run 34092974343)

게이트·WIF 인증·setup-gcloud 는 전부 성공. `비밀 바인딩 결정` 에서 죽었고 이후
스텝은 skip 됐다 — **배포는 일어나지 않았다.**

증상: 선언된 8개가 전부 "Secret Manager 에 없음" 으로 분류되고
`DATABASE_URL 없음` 으로 exit 1. annotation 10건이 그것을 말해 줬다
(로그 API 는 미인증으로 403, `check-runs/<id>/annotations` 는 공개로 읽힌다).

### 근본 원인 두 개

1. **정규화가 양쪽에서 달랐다.** 선언 목록만 `tr -d ' \t\r'` 를 지나고 gcloud
   출력은 그대로 읽었다. 키가 `DATABASE_URL<CR>` 로 들어가 8개를 받아 놓고도
   조회가 전부 빗나갔다. → `normalize()` 하나로 양쪽을 같은 방식으로 다듬는다.
   (CI 와 같은 셸 플래그로 로컬 재현됨: "Secret Manager: 8개 / 바인딩 0 / 누락 8")

2. **실패를 데이터로 오인했다.** `mapfile -t present < <(gcloud ...)` 는 프로세스
   치환의 종료 코드를 보지 않는다. 호출이 실패해 stdout 이 비면 "시크릿이 0개" 로
   읽히고, 원인인 stderr 는 어디에도 남지 않는다. → exit 코드와 stderr 를 붙잡고,
   실패했거나 0건이면 `gcloud auth list`·`config list` 까지 찍고 멈춘다.

### 왜 로컬 검증을 통과했는가 (이게 진짜 교훈이다)

처음 로컬 하네스가 `bash -e` 였다. Actions 의 리눅스 기본 셸은
`bash --noprofile --norc -e -o pipefail` 이다. 플래그가 다른 셸에서 검증하면
검증한 것이 아니다. 이후 하네스를 그 플래그로 맞췄고, 그러자 원인 1이 즉시 재현됐다.

부수적으로 `pipefail` 아래에서는 `grep -v '^$'` 가 전부 걸러졌을 때 exit 1 로
스텝을 죽인다 — 그래서 필터를 sed 한 개로 합쳤다.

### 함께 반영한 것

`auth`/`setup-gcloud` 에 `project_id` 를 넘긴다. 없으면 액션이
`CLOUDSDK_CORE_PROJECT` 를 export 하지 않고, WIF 외부 계정 자격증명은 일부 API
호출에서 그 값을 쿼터 프로젝트로 쓴다.

## 두 번째 실행 실패 — **진짜 근본 원인** (run 34093679072)

`setup-gcloud` 가 죽었고, 그 메시지가 처음부터의 원인을 그대로 말해 줬다:

    'Unable to acquire impersonated credentials'
    Permission 'iam.serviceAccounts.getAccessToken' denied on resource

즉 **WIF 토큰 교환 자체가 한 번도 성공한 적이 없었다.** 첫 실행에서
`gcloud secrets list` 가 빈 결과였던 것도 이것이었다 — `auth` 액션은
`create_credentials_file` 로 파일만 쓰고 교환은 첫 API 호출 때 일어나므로,
"auth 성공" 은 교환 성공을 뜻하지 않는다. `project_id` 를 넘긴 것이 결과적으로
도움이 됐다: `setup-gcloud` 가 더 이른 시점에 API 를 호출해 원인을 드러냈다.

### 원인

서비스 계정 바인딩을 `principal://.../subject/repo:owner/name:ref:refs/heads/main`
로 걸었다. GitHub 의 `sub` 는 `/` 와 `:` 가 섞인 문자열이고, 그것을
`principal://.../subject/` 자리에 넣으면 실제 주체와 맞지 않는다.
`roles/iam.workloadIdentityUser` 는 `getAccessToken` 을 포함하므로 **역할은 맞았고,
주체가 안 맞았다** — 그래서 에러가 권한 문제처럼만 보였다.

Google 의 GitHub Actions 문서가 이 자리에 예외 없이
`principalSet://.../attribute.repository/OWNER/REPO` 를 쓰는 이유다.

### 고친 방법 (보안 등가)

  * 바인딩 → `principalSet://.../attribute.repository/john2002-lee/sajuStock`
  * 브랜치 제한 → **프로바이더 조건으로 이동.** 저장소와 ref 를 둘 다 본다.
  * 옛 `principal://.../subject/` 바인딩은 제거했다 (스크립트도 더는 만들지 않는다).

남은 주의: 이 풀에 조건 없는 프로바이더를 추가하면 바인딩이 넓어진다.

### 그 과정에서 만난 세 번째 함정 — cmd.exe

조건을 `A&&B` 로 이었더니:

    Updated workload identity pool provider [github-actions].
    'assertion.ref' is not recognized as an internal or external command

`gcloud` 는 Windows 에서 배치 파일(`gcloud.cmd`)이고 cmd.exe 가 인자 안의 `&&` 를
명령 구분자로 읽는다. **조건의 앞 절반만 저장돼 브랜치 제한이 조용히 사라졌다** —
성공 메시지까지 찍혀서 눈치채기 어려웠다. 인자에 공백이 없으면 PowerShell 이
따옴표를 붙이지 않아 cmd 가 그대로 본다.

그래서 두 절을 문자열 하나로 이어 등식 하나로 만들었다:

    assertion.repository+'@'+assertion.ref=='john2002-lee/sajuStock@refs/heads/main'

`&&` 가 없고, 남은 문자에 cmd 메타문자가 없다. 큰따옴표 대신 작은따옴표를 쓴 것도
같은 이유다. **저장된 값은 gcloud 출력이 아니라 `providers describe` 로 확인했다.**
