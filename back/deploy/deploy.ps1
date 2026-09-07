#Requires -Version 5.1
<#
  back/ 를 Cloud Run 에 배포한다.

  비밀은 `.env` 에서 읽어 Secret Manager 로 올린다 — 저장소에도, 이미지 레이어에도,
  셸 히스토리에도 남지 않는다. 비밀 아닌 값은 `deploy/env.yaml` 이 갖는다.

  전제:
    1. 프로젝트에 **결제 계정이 연결돼 있다** (없으면 API 활성화부터 막힌다)
    2. `alembic upgrade head` 가 이미 돌았다 — 앱은 스키마를 만들지 않는다

  사용:
    cd C:\AIOT21\SajuStock\back
    .\deploy\deploy.ps1

  여러 번 돌려도 안전하다 — API 활성화·IAM 바인딩·시크릿 버전 추가·배포가 모두
  멱등이다(시크릿은 같은 값이면 새 버전이 하나 더 쌓일 뿐이다).
#>
param(
  [string]$Project = "project-b6d7001f-3a61-4b53-a5d",
  # DB 와 같은 리전이다. 요청 하나가 DB 를 여러 번 왕복하지만 사용자는 한 번만
  # 왕복하므로, 서울(asia-northeast3)보다 Supabase 옆(ap-northeast-1)이 빠르다.
  [string]$Region  = "asia-northeast1",
  [string]$Service = "sajustock-back"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# --- gcloud 헬퍼 ------------------------------------------------------------
# 함수 정의는 `deploy/gcloud-lib.ps1` 에 있다. setup-cicd.ps1 도 같은 파일을 쓴다.
#
# 여기 복사해 두지 않는 이유: 그 안에는 "stderr 를 실패 신호로 쓰지 않는다" 는
# 비직관적인 회피가 들어 있다(그 파일 머리말에 이유가 적혀 있다). 같은 회피가 두
# 파일에 있으면 한쪽만 고치는 날이 오고, 그때 증상은 "어떤 스크립트에서는 되고
# 어떤 스크립트에서는 안 된다" 가 된다.
. (Join-Path $PSScriptRoot "gcloud-lib.ps1")
$gcloud = Resolve-Gcloud
Write-Host "gcloud: $gcloud" -ForegroundColor DarkGray

# --- 1. .env 파싱 -----------------------------------------------------------
$envPath = Join-Path $root ".env"
if (-not (Test-Path $envPath)) { throw "back/.env 가 없다: $envPath" }

$vals = @{}
foreach ($line in Get-Content $envPath -Encoding UTF8) {
  $t = $line.Trim()
  if ($t -eq "" -or $t.StartsWith("#")) { continue }
  $i = $t.IndexOf("=")
  if ($i -lt 1) { continue }
  # 값에 '=' 가 들어가는 경우가 있다 (base64 패딩) — 첫 '=' 에서만 쪼갠다.
  $vals[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim()
}

# --- 2. API 활성화 ----------------------------------------------------------
Write-Host "== API 활성화" -ForegroundColor Cyan
Invoke-GcloudOrDie -What "services enable" -GcArgs @("services","enable",
  "run.googleapis.com","artifactregistry.googleapis.com",
  "cloudbuild.googleapis.com","secretmanager.googleapis.com",
  "--project",$Project)

# --- 3. 비밀 등록 -----------------------------------------------------------
# 목록은 `deploy/secret-keys.txt` 가 갖는다 — 워크플로의 배포 스텝도 **같은 파일** 을
# 읽는다. 배열을 여기 두면 새 비밀을 추가할 때 한쪽만 고치게 되고, 그 증상은 배포된
# 컨테이너에서만 나타난다 (그 파일 머리말의 AMPLITUDE 사례).
$secretKeys = Get-SecretKeys -Path (Join-Path $PSScriptRoot "secret-keys.txt")

# 존재 여부를 키마다 `describe` 로 묻지 않는다 — 없을 때 stderr 를 쓰는 호출이라
# 위의 함정을 매번 건드린다. 목록을 한 번 받아 대조하면 stderr 가 아예 없다.
Write-Host "== 시크릿 등록" -ForegroundColor Cyan
$existing = Get-GcloudLines -What "secrets list" -GcArgs @("secrets","list",
  "--project",$Project,"--format=value(name.basename())")

$bound = @()
foreach ($k in $secretKeys) {
  $v = $vals[$k]
  if ([string]::IsNullOrWhiteSpace($v)) {
    Write-Host "   - $k : .env 에 값이 없어 건너뛴다" -ForegroundColor DarkYellow
    continue
  }

  if ($existing -notcontains $k) {
    Invoke-GcloudOrDie -What "secrets create $k" -GcArgs @("secrets","create",$k,
      "--replication-policy=automatic","--project",$Project)
  }

  # **파이프가 아니라 임시 파일로 넣는다.** PowerShell 의 `"x" | gcloud --data-file=-`
  # 은 값 끝에 CRLF(인코딩에 따라 BOM 까지)를 붙인다. 그러면 DB 비밀번호나 HMAC 키가
  # 눈에 안 보이는 한 글자 때문에 틀리고, 증상은 "비밀번호가 틀렸다" 로만 나온다.
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($tmp, $v, (New-Object System.Text.UTF8Encoding($false)))
    Invoke-GcloudOrDie -What "secrets versions add $k" -GcArgs @("secrets","versions","add",$k,
      "--data-file=$tmp","--project",$Project)
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }

  $bound += "$k=${k}:latest"
  Write-Host "   + $k" -ForegroundColor Green
}

if ($bound.Count -eq 0) { throw ".env 에서 올릴 비밀을 하나도 못 찾았다 — 파싱을 확인하라." }

# --- 4. Compute 기본 서비스계정 권한 ----------------------------------------
# 이 계정 하나가 **두 가지 역할**을 한다: Cloud Build 가 빌드를 돌리는 신분이자,
# Cloud Run 컨테이너가 실행되는 신분이다. 그래서 필요한 권한도 두 갈래다.
#
#   secretmanager.secretAccessor  — 런타임이 --set-secrets 를 읽는다
#   cloudbuild.builds.builder     — 빌드가 소스 zip(GCS)을 읽고, 이미지를
#                                   Artifact Registry 에 밀고, 빌드 로그를 쓴다
#
# 두 번째가 없으면 `run deploy --source` 가 소스 업로드까지 성공한 뒤 빌드 단계에서
# `storage.objects.get denied` 로 죽는다. 예전 프로젝트는 이 계정이 자동으로
# `roles/editor` 를 받아 문제가 드러나지 않았지만, 신규 프로젝트는 받지 않는다 —
# 그래서 "예제 그대로 했는데 나만 안 되는" 증상이 된다.
$num = Get-GcloudValue -What "projectNumber 조회" -GcArgs @("projects","describe",$Project,
  "--format=value(projectNumber)")
$sa = "$num-compute@developer.gserviceaccount.com"

$roles = @("roles/secretmanager.secretAccessor", "roles/cloudbuild.builds.builder")
foreach ($role in $roles) {
  Write-Host "== $sa 에 $role 부여" -ForegroundColor Cyan
  Invoke-GcloudOrDie -Quiet -What "add-iam-policy-binding ($role)" -GcArgs @(
    "projects","add-iam-policy-binding",$Project,
    "--member=serviceAccount:$sa","--role=$role","--condition=None","--quiet")
}

# IAM 전파는 즉시가 아니다. 방금 준 권한으로 바로 빌드를 걸면 같은 403 을 다시
# 볼 수 있고, 그때는 원인이 "권한이 없음" 이 아니라 "아직 안 보임" 이라 헷갈린다.
Write-Host "   IAM 전파 대기 20초..." -ForegroundColor DarkGray
Start-Sleep -Seconds 20

# --- 5. 이미지 빌드 ---------------------------------------------------------
# **`run deploy --source` 를 쓰지 않는다.** 그쪽은 빌드 스텝을 gcloud 가 자기 마음대로
# 만들고, 그 스텝은 BuildKit 없이 레거시 빌더로 돈다. 우리 Dockerfile 은
# `RUN --mount=type=cache` 를 쓰므로 6번째 스텝에서 즉시 죽는다:
#
#   the --mount option requires BuildKit.
#
# 빌드를 `deploy/cloudbuild.yaml` 로 분리하면 BuildKit·타임아웃·머신타입을 우리가
# 정한다. 어차피 `--source` 는 빌드에 `--no-cache` 를 강제로 붙여서 레이어 캐시
# 이득도 없었다. 선택 근거는 그 파일 머리말에 적어 뒀다.
$repo = "cloud-run-source-deploy"
$repos = Get-GcloudLines -What "repositories list" -GcArgs @("artifacts","repositories","list",
  "--project",$Project,"--location",$Region,"--format=value(name.basename())")
if ($repos -notcontains $repo) {
  Write-Host "== Artifact Registry 저장소 생성: $repo" -ForegroundColor Cyan
  Invoke-GcloudOrDie -What "repositories create" -GcArgs @("artifacts","repositories","create",$repo,
    "--repository-format=docker","--location",$Region,"--project",$Project,"--quiet")
}

# 리비전마다 다른 태그를 준다. 같은 태그를 재사용하면 "지금 도는 것이 어느 빌드인지"
# 를 다이제스트로만 알 수 있고, 롤백할 때 되돌릴 지점을 이름으로 못 가리킨다.
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$image = "$Region-docker.pkg.dev/$Project/$repo/${Service}:$stamp"

# 로그를 GCS 로 명시한다. 기본값(CLOUD_LOGGING_ONLY)에서 빌드 로그가 한 줄도 안 남는
# 경우를 실제로 만났다 — 그때는 실패 원인이 `exit 1` 뿐이라 아무것도 알 수 없었다.
$logDir = "gs://${Project}_cloudbuild/deploy-logs"

Write-Host "== 이미지 빌드 (BuildKit · 첫 빌드 5~8분)" -ForegroundColor Cyan
Write-Host "   $image" -ForegroundColor DarkGray
Invoke-GcloudOrDie -What "builds submit" -GcArgs @("builds","submit",$root,
  "--project",$Project,"--region",$Region,
  "--config",(Join-Path $PSScriptRoot "cloudbuild.yaml"),
  "--substitutions=_IMAGE=$image",
  "--gcs-log-dir=$logDir")

# --- 6. 배포 ---------------------------------------------------------------
Write-Host "== Cloud Run 배포" -ForegroundColor Cyan
Invoke-GcloudOrDie -What "run deploy" -GcArgs @("run","deploy",$Service,
  "--image",$image,
  "--project",$Project,
  "--region",$Region,
  # Dockerfile 의 CMD 가 8000 고정이다. Cloud Run 기본값은 8080 이라 빼면 기동 실패다.
  "--port","8000",
  # pandas·numpy·langgraph 가 함께 올라온다. 1Gi 는 기동 중에 넘칠 수 있다.
  "--memory","2Gi","--cpu","2",
  # 시총·스냅샷 배치와 기동 워밍업은 응답을 보낸 **뒤에** 도는 백그라운드 작업이다
  # (`app/core/background.py`). Cloud Run 기본값은 요청 중에만 CPU 를 주므로 이 둘이
  # 없으면 그 작업들이 응답 직후 얼어붙고 DB 가 영원히 안 채워진다.
  "--no-cpu-throttling","--min-instances","1",
  # 인메모리 캐시가 프로세스 로컬이라 인스턴스가 늘면 LLM 비용이 그만큼 곱해진다.
  "--max-instances","3",
  # SSE 스트리밍(/advice/stream)용. 판단 예산 90초 + 하트비트가 이 안에 들어간다.
  "--timeout","300","--concurrency","40",
  "--env-vars-file",(Join-Path $PSScriptRoot "env.yaml"),
  "--set-secrets",($bound -join ","),
  # 프런트 BFF 가 호출한다. 민감한 경로는 ADVICE_API_KEY / ADMIN_API_KEY 가 지킨다.
  "--allow-unauthenticated","--quiet")

# --- 7. 확인 ---------------------------------------------------------------
$url = Get-GcloudValue -What "서비스 URL 조회" -GcArgs @("run","services","describe",$Service,
  "--project",$Project,"--region",$Region,"--format=value(status.url)")

Write-Host ""
Write-Host "배포 완료: $url" -ForegroundColor Green
Write-Host "  헬스체크 : $url/health"
Write-Host "  API 문서 : $url/docs"
Write-Host ""
Write-Host "다음: front/.env.local 의 STOCK_API_BASE_URL 을 $url/api/v1 로 바꾸고," -ForegroundColor Yellow
Write-Host "      프런트 배포 오리진을 deploy/env.yaml 의 CORS_ORIGINS 에 추가한 뒤 다시 배포한다." -ForegroundColor Yellow
