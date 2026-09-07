#Requires -Version 5.1
<#
  GitHub Actions 가 이 프로젝트에 배포할 수 있게 만든다. **한 번만 돌리면 된다.**

  왜 키가 아니라 Workload Identity Federation 인가:
    저장소가 **공개** 다. 서비스 계정 JSON 키를 만들면 만료가 없는 자격증명이
    GitHub 에 남고, 그것이 새는 경로(포크된 워크플로, 액션 로그, 잘못 붙인 붙여넣기)는
    우리가 다 통제할 수 없다. WIF 는 GitHub 이 발급한 짧은 OIDC 토큰을 GCP 가
    교환해 주는 방식이라 **저장할 비밀이 없다** — 그래서 이 워크플로는 GitHub
    시크릿을 하나도 쓰지 않는다.

  신뢰 범위를 얼마나 좁혔는가 (두 겹이다):
    ① 프로바이더 조건 — `assertion.repository=='<Repo>'`.
       다른 저장소는 이 풀에 들어오지도 못한다.
    ② 서비스 계정 바인딩 — 주체 **하나** 만 허용한다:
         repo:<Repo>:ref:refs/heads/<Branch>
       GitHub 이 `sub` 클레임에 넣는 문자열 그대로다. 포크의 PR(`refs/pull/N/merge`),
       다른 브랜치, 태그는 모두 이 문자열과 다르므로 토큰을 못 받는다.
       `attribute.repository/...` 같은 principalSet 로 넓게 묶지 않은 이유가 이것이다.

  권한을 얼마나 좁혔는가:
    배포 SA 에 `secretmanager.secretAccessor` 를 **주지 않는다.** CI 는 비밀 *값* 을
    읽을 이유가 없다 — 값을 읽는 것은 컨테이너를 돌리는 런타임 SA 고, 그쪽은
    deploy.ps1 이 이미 권한을 줬다. CI 에는 목록 조회용 `secretmanager.viewer`
    (메타데이터만) 만 준다 — secret-keys.txt 에 선언됐지만 아직 Secret Manager 에 없는
    키를 경고로 알려주기 위한 것이다.

    스토리지도 프로젝트 전체가 아니라 빌드 버킷 하나로 좁힌다.

  사용:
    cd C:\AIOT21\SajuStock\back
    .\deploy\setup-cicd.ps1

  여러 번 돌려도 안전하다 — API 활성화·SA 생성·IAM 바인딩·풀/프로바이더 생성이
  모두 멱등이고, 이미 있는 프로바이더는 매핑/조건을 다시 덮어써서 드리프트를 지운다.
#>
param(
  [string]$Project  = "project-b6d7001f-3a61-4b53-a5d",
  [string]$Region   = "asia-northeast1",
  # GitHub 이 OIDC 클레임에 넣는 **정확한** 이름이어야 한다 — 대소문자까지.
  # (`gh api repos/<owner>/<repo> --jq .full_name` 로 확인한 값)
  [string]$Repo     = "john2002-lee/sajuStock",
  [string]$Branch   = "main",
  [string]$Pool     = "github",
  [string]$Provider = "github-actions",
  [string]$Deployer = "github-deployer",
  [string]$ArRepo   = "cloud-run-source-deploy"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "gcloud-lib.ps1")
$gcloud = Resolve-Gcloud
Write-Host "gcloud: $gcloud" -ForegroundColor DarkGray

# --- 1. API 활성화 ----------------------------------------------------------
# `sts` 와 `iamcredentials` 가 WIF 의 실제 교환 경로다. 둘 중 하나가 꺼져 있으면
# 워크플로가 `auth` 스텝에서 403 으로 죽는데, 메시지가 권한처럼 보여서 IAM 을
# 한참 뒤지게 된다. `cloudresourcemanager` 는 add-iam-policy-binding 이 쓴다.
Write-Host "== API 활성화" -ForegroundColor Cyan
Invoke-GcloudOrDie -What "services enable" -GcArgs @("services","enable",
  "iam.googleapis.com","iamcredentials.googleapis.com","sts.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "run.googleapis.com","cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com","secretmanager.googleapis.com",
  "--project",$Project)

$num = Get-GcloudValue -What "projectNumber 조회" -GcArgs @("projects","describe",$Project,
  "--format=value(projectNumber)")
$deployerEmail = "$Deployer@$Project.iam.gserviceaccount.com"
$runtimeSa     = "$num-compute@developer.gserviceaccount.com"
$buildBucket   = "gs://${Project}_cloudbuild"

# --- 2. 배포용 서비스 계정 --------------------------------------------------
Write-Host "== 배포 SA: $deployerEmail" -ForegroundColor Cyan
$sas = Get-GcloudLines -What "service-accounts list" -GcArgs @("iam","service-accounts","list",
  "--project",$Project,"--format=value(email)")
if ($sas -notcontains $deployerEmail) {
  # 설명을 ASCII 로 둔다 — gcloud.cmd 배치 래퍼를 지나는 인자에 한글을 실으면
  # 콘솔 코드페이지(CP949)에서 깨져 들어간다. 파일 안 주석은 BOM 덕에 안전하지만
  # **명령 인자는 다른 경로** 다.
  Invoke-GcloudOrDie -What "service-accounts create" -GcArgs @("iam","service-accounts","create",$Deployer,
    "--display-name=GitHub Actions deployer",
    "--description=Used only via Workload Identity Federation. Do not create keys.",
    "--project",$Project)
  # SA 생성 직후의 IAM 전파를 기다린다 — 바로 바인딩을 걸면 "해당 주체가 없다" 로
  # 실패할 수 있고, 그때 원인이 오타처럼 보인다.
  Write-Host "   SA 전파 대기 10초..." -ForegroundColor DarkGray
  Start-Sleep -Seconds 10
} else {
  Write-Host "   이미 있다" -ForegroundColor DarkGray
}

# --- 3. 배포 SA 권한 --------------------------------------------------------
# 프로젝트 범위로 주는 것은 이 셋뿐이다.
#   run.admin                 — 서비스/잡 배포 + --allow-unauthenticated(setIamPolicy)
#   cloudbuild.builds.editor  — builds submit
#   secretmanager.viewer      — 목록/메타데이터만. **값은 못 읽는다**
Write-Host "== 배포 SA 권한 (프로젝트 범위)" -ForegroundColor Cyan
foreach ($role in @("roles/run.admin","roles/cloudbuild.builds.editor","roles/secretmanager.viewer")) {
  Write-Host "   + $role" -ForegroundColor Green
  Invoke-GcloudOrDie -Quiet -What "add-iam-policy-binding ($role)" -GcArgs @(
    "projects","add-iam-policy-binding",$Project,
    "--member=serviceAccount:$deployerEmail","--role=$role","--condition=None","--quiet")
}

# 런타임 SA 로 **가장할** 권한. Cloud Run 서비스/잡은 이 계정으로 돌고, 빌드도 이
# 계정으로 돈다 — 그 계정을 지정해 리소스를 만들려면 actAs 가 필요하다. 프로젝트
# 전체가 아니라 **이 계정 하나** 에 대해서만 준다.
Write-Host "== 런타임 SA 가장 권한 (계정 범위): $runtimeSa" -ForegroundColor Cyan
Invoke-GcloudOrDie -Quiet -What "serviceAccountUser 바인딩" -GcArgs @(
  "iam","service-accounts","add-iam-policy-binding",$runtimeSa,
  "--member=serviceAccount:$deployerEmail","--role=roles/iam.serviceAccountUser",
  "--project",$Project,"--quiet")

# 빌드 소스 업로드와 로그가 이 버킷 하나에 들어간다 (`gs://<project>_cloudbuild/source`,
# `/deploy-logs`). 워크플로가 두 경로를 **명시** 하므로 gcloud 가 다른 버킷을 새로
# 만들 일이 없고, 그래서 권한도 이 버킷으로 좁힐 수 있다.
#
# objectAdmin 이 아니라 admin 인 이유: gcloud 는 업로드 전에 `storage.buckets.get`
# 으로 버킷을 확인하는데 objectAdmin 에는 그 권한이 없다.
Write-Host "== 빌드 버킷 권한 (버킷 범위): $buildBucket" -ForegroundColor Cyan
Invoke-GcloudOrDie -Quiet -What "버킷 IAM 바인딩" -GcArgs @(
  "storage","buckets","add-iam-policy-binding",$buildBucket,
  "--member=serviceAccount:$deployerEmail","--role=roles/storage.admin","--quiet")

# `run deploy` 가 이미지 존재를 확인한다. 쓰기는 빌드(런타임 SA)가 하므로 읽기만.
Write-Host "== Artifact Registry 읽기 권한 (저장소 범위): $ArRepo" -ForegroundColor Cyan
Invoke-GcloudOrDie -Quiet -What "AR IAM 바인딩" -GcArgs @(
  "artifacts","repositories","add-iam-policy-binding",$ArRepo,
  "--location",$Region,"--project",$Project,
  "--member=serviceAccount:$deployerEmail","--role=roles/artifactregistry.reader","--quiet")

# --- 4. Workload Identity 풀 ------------------------------------------------
Write-Host "== Workload Identity 풀: $Pool" -ForegroundColor Cyan
$pools = Get-GcloudLines -What "pools list" -GcArgs @("iam","workload-identity-pools","list",
  "--location=global","--project",$Project,"--format=value(name.basename())")
$poolIsNew = $false
if ($pools -notcontains $Pool) {
  Invoke-GcloudOrDie -What "pools create" -GcArgs @("iam","workload-identity-pools","create",$Pool,
    "--location=global","--display-name=GitHub Actions",
    "--description=GitHub Actions OIDC","--project",$Project)
  $poolIsNew = $true
} else {
  Write-Host "   이미 있다" -ForegroundColor DarkGray
}

# --- 5. OIDC 프로바이더 -----------------------------------------------------
# `--attribute-condition` 은 첫 번째 방어선이다. 이것이 없으면 **모든** GitHub
# 저장소의 워크플로가 이 풀에 토큰을 제시할 수 있고, 남는 방어는 SA 바인딩 하나뿐이
# 된다. 조건에 공백을 넣지 않는다 — Windows 의 gcloud.cmd 배치 래퍼를 지나갈 때
# 인자 분리로 깨지는 것을 피한다 (CEL 은 `==` 주변 공백을 요구하지 않는다).
$mapping = "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref"

# **브랜치 제한이 여기 있다** (아래 6번의 바인딩이 아니라).
#
# 처음에는 서비스 계정 바인딩 쪽에 `principal://.../subject/` 로 주체 하나를
# 못박고, 조건은 저장소만 봤다. 그것이 토큰 교환 단계에서
# `iam.serviceAccounts.getAccessToken denied` / `Unable to acquire impersonated
# credentials` 로 죽었다 — GitHub 의 `sub` 는 `repo:owner/name:ref:refs/heads/main`
# 처럼 `/` 와 `:` 가 섞여 있고, 그 문자열을 `principal://.../subject/` 자리에 넣으면
# 바인딩이 실제 주체와 맞지 않는다. Google 의 GitHub Actions 문서가 이 자리에
# 예외 없이 `principalSet://.../attribute.repository/...` 를 쓰는 이유다.
#
# 그래서 좁히는 일을 조건이 맡는다. 저장소와 **브랜치** 를 둘 다 여기서 본다 —
# 포크의 PR(`refs/pull/N/merge`), 다른 브랜치, 태그는 풀에 들어오지 못한다.
# 보안 범위는 예전과 같고, 지키는 자리만 바뀌었다.
#
# **`&&` 를 쓰지 않는다.** 두 조건을 `A&&B` 로 이어 봤더니 이렇게 됐다:
#
#   Updated workload identity pool provider [github-actions].
#   'assertion.ref' is not recognized as an internal or external command
#
# `gcloud` 는 Windows 에서 **배치 파일**(`gcloud.cmd`)이고, cmd.exe 는 인자 안의
# `&&` 를 명령 구분자로 읽는다. 그래서 조건의 앞 절반만 저장되고(=브랜치 제한이
# 조용히 사라지고) 뒷 절반은 명령으로 실행됐다. 인자에 공백이 없으면 PowerShell 이
# 따옴표를 붙이지 않아 cmd 가 그대로 본다.
#
# 두 절을 문자열 하나로 이어 **등식 하나** 로 만들면 `&&` 가 아예 없어진다.
# CEL 은 문자열 `+` 를 지원하고, 작은따옴표 리터럴도 받는다 — 큰따옴표를 피하는
# 것도 같은 이유다(cmd 를 지나가야 한다).
#
# 남은 문자는 letters `.` `+` `'` `@` `/` `:` `=` 뿐이고 cmd 메타문자가 없다.
$condition = "assertion.repository+'@'+assertion.ref=='$Repo@refs/heads/$Branch'"

Write-Host "== OIDC 프로바이더: $Provider" -ForegroundColor Cyan

# **갓 만든 풀에는 `providers list` 를 걸지 않는다.** 실제로 여기서 한 번 죽었다 —
# 풀 생성 직후의 조회가 전파를 못 기다려 exit 1 을 냈고, 몇 초 뒤 같은 명령은
# 정상이었다. 잠자기로 덮으면 "얼마나 자야 충분한가" 를 영원히 모른 채 살게 된다.
# 방금 만든 풀에 프로바이더가 없다는 것은 조회하지 않아도 아는 사실이므로,
# 그 경우 조회를 건너뛰어 경쟁 자체를 없앤다.
$verb = "create-oidc"
if (-not $poolIsNew) {
  $providers = Get-GcloudLines -What "providers list" -GcArgs @("iam","workload-identity-pools","providers","list",
    "--location=global","--workload-identity-pool=$Pool","--project",$Project,
    "--format=value(name.basename())")
  if ($providers -contains $Provider) { $verb = "update-oidc" }
}
Write-Host "   $verb (조건: $condition)" -ForegroundColor DarkGray
Invoke-GcloudOrDie -What "providers $verb" -GcArgs @("iam","workload-identity-pools","providers",$verb,$Provider,
  "--location=global","--workload-identity-pool=$Pool","--project",$Project,
  "--issuer-uri=https://token.actions.githubusercontent.com",
  "--attribute-mapping=$mapping",
  "--attribute-condition=$condition",
  "--display-name=GitHub Actions OIDC")

# --- 6. 이 저장소만 배포 SA 를 쓰게 묶는다 ----------------------------------
# `attribute.repository` 로 묶는다. 브랜치는 위 5번의 프로바이더 조건이 이미
# 걸렀으므로, 이 풀에 들어온 것 중 이 저장소인 것 = main 의 워크플로 뿐이다.
#
# 주의: 이 풀에 **조건 없는 프로바이더를 나중에 추가하면** 이 바인딩이 넓어진다.
# 프로바이더를 더 만들 일이 생기면 각자 조건을 걸거나 풀을 따로 쓴다.
$member = "principalSet://iam.googleapis.com/projects/$num/locations/global/workloadIdentityPools/$Pool/attribute.repository/$Repo"

Write-Host "== 배포 허용 범위" -ForegroundColor Cyan
Write-Host "   저장소 $Repo · 브랜치 refs/heads/$Branch (조건에서 제한)" -ForegroundColor Green
Invoke-GcloudOrDie -Quiet -What "workloadIdentityUser 바인딩" -GcArgs @(
  "iam","service-accounts","add-iam-policy-binding",$deployerEmail,
  "--member=$member","--role=roles/iam.workloadIdentityUser",
  "--project",$Project,"--quiet")

# --- 7. 워크플로에 넣을 값 --------------------------------------------------
# 둘 다 비밀이 아니다 — 프로바이더 리소스명과 SA 이메일만으로는 아무것도 못 한다
# (GitHub 이 서명한, 위 주체와 일치하는 OIDC 토큰이 있어야 교환이 된다).
# 그래서 워크플로에 평문으로 두고 GitHub 시크릿을 쓰지 않는다.
$providerResource = "projects/$num/locations/global/workloadIdentityPools/$Pool/providers/$Provider"

Write-Host ""
Write-Host "설정 완료." -ForegroundColor Green
Write-Host ""
Write-Host ".github/workflows/back-deploy.yml 의 env 와 아래가 일치해야 한다:" -ForegroundColor Yellow
Write-Host "  WIF_PROVIDER: $providerResource"
Write-Host "  DEPLOY_SA:    $deployerEmail"
Write-Host ""
Write-Host "GitHub 시크릿은 필요 없다. main 에 push 하면 배포가 돈다." -ForegroundColor Yellow
