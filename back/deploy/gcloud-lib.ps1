#Requires -Version 5.1
<#
  gcloud 호출 헬퍼. `deploy.ps1` 과 `setup-cicd.ps1` 이 dot-source 로 가져간다.

      . (Join-Path $PSScriptRoot "gcloud-lib.ps1")
      $gcloud = Resolve-Gcloud

  두 스크립트에 같은 함수를 복사해 두지 않는 이유는 아래 stderr 함정이다 — 그 회피가
  한 곳에만 있어야, 다음에 물렸을 때 고칠 자리가 하나다.
#>

# --- gcloud 찾기 ------------------------------------------------------------
# PATH 에만 의존하지 않는다. Cloud SDK 설치 직후에는 이미 떠 있던 셸(과 그 셸이
# 띄우는 자식 프로세스)의 PATH 에 아직 항목이 없다 — 설치 프로그램은 레지스트리를
# 고치지만 살아 있는 프로세스의 환경은 못 바꾼다. 그러면 "gcloud 를 인식할 수 없다"
# 로 죽는데, 원인이 스크립트가 아니라 셸의 나이라서 재실행해도 계속 실패한다.
function Resolve-Gcloud {
  foreach ($name in @("gcloud.cmd", "gcloud")) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
  }
  $tail = "Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd".Replace("/", [IO.Path]::DirectorySeparatorChar)
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA $tail),
    (Join-Path $env:ProgramFiles $tail),
    (Join-Path ${env:ProgramFiles(x86)} $tail)
  )
  foreach ($p in $candidates) { if ($p -and (Test-Path $p)) { return $p } }
  throw "gcloud 를 찾지 못했다. 새 PowerShell 창을 열어 다시 실행하거나 Cloud SDK 설치 경로를 확인하라."
}

# --- gcloud 호출 래퍼 -------------------------------------------------------
# **stderr 를 실패 신호로 쓰지 않는다.** `$ErrorActionPreference = "Stop"` 아래에서
# 네이티브 명령이 stderr 에 한 줄이라도 쓰면 PowerShell 이 그것을 종료성 에러로
# 승격시킨다. 그런데 gcloud 는 정상 동작 중에도 stderr 를 쓴다 — 빌드 진행 로그,
# "Creating...", 그리고 `secrets describe` 의 NOT_FOUND(=우리가 알고 싶었던 답)까지.
# 그래서 성공 판정은 **종료 코드 하나로만** 한다.
#
# 호출자는 dot-source 후 `$gcloud = Resolve-Gcloud` 를 먼저 해 둔다 — 아래 함수들이
# 그 변수를 읽는다.
function Invoke-Gcloud {
  param([Parameter(Mandatory = $true)][string[]]$GcArgs, [switch]$Quiet)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    if ($Quiet) { & $gcloud @GcArgs 2>&1 | Out-Null }
    else        { & $gcloud @GcArgs 2>&1 | ForEach-Object { Write-Host $_ } }
    return $LASTEXITCODE
  } finally { $ErrorActionPreference = $prev }
}

function Invoke-GcloudOrDie {
  param([Parameter(Mandatory = $true)][string[]]$GcArgs, [string]$What, [switch]$Quiet)
  $code = Invoke-Gcloud -GcArgs $GcArgs -Quiet:$Quiet
  if ($code -ne 0) { throw "$What 실패 (exit $code)" }
}

# 값을 되받아야 하는 호출용 — stdout 만 취한다.
function Get-GcloudValue {
  param([Parameter(Mandatory = $true)][string[]]$GcArgs, [string]$What)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $out = & $gcloud @GcArgs 2>$null
    if ($LASTEXITCODE -ne 0) { throw "$What 실패 (exit $LASTEXITCODE)" }
    return ($out | Out-String).Trim()
  } finally { $ErrorActionPreference = $prev }
}

# 줄 목록을 돌려주는 호출용. gcloud `--format=value(...)` 는 0건일 때 빈 문자열을
# 내는데, PowerShell 에서 `"" -split` 은 **빈 문자열 하나가 든 배열**이 된다 —
# 그대로 `-notcontains` 에 쓰면 "없는데 있다" 로 오판한다.
function Get-GcloudLines {
  param([Parameter(Mandatory = $true)][string[]]$GcArgs, [string]$What)
  $raw = Get-GcloudValue -GcArgs $GcArgs -What $What
  if ([string]::IsNullOrWhiteSpace($raw)) { return @() }
  return @($raw -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
}

# --- secret-keys.txt ------------------------------------------------------------
# 바인딩할 Secret Manager 키 목록의 단일 출처를 읽는다 (`deploy/secret-keys.txt`).
# 워크플로의 bash 쪽도 같은 규칙으로 파싱한다 — `#` 뒤는 주석, 빈 줄은 무시.
function Get-SecretKeys {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path $Path)) { throw "secret-keys.txt 가 없다: $Path" }
  $keys = @()
  foreach ($line in Get-Content $Path -Encoding UTF8) {
    $t = ($line -replace "#.*$", "").Trim()
    if ($t -ne "") { $keys += $t }
  }
  if ($keys.Count -eq 0) { throw "secret-keys.txt 에 키가 하나도 없다: $Path" }
  return $keys
}
