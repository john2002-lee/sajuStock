# back CI/CD — 체크리스트 (완료)

- [x] GCP/GitHub 상태 실측
- [x] dev docs
- [x] `deploy/gcloud-lib.ps1` — gcloud 헬퍼 추출 (+ `Get-GcloudLines`·`Get-SecretKeys`)
- [x] `deploy/secret-keys.txt` — 바인딩 키 목록 (`secrets.*` gitignore 규칙을 뚫지 않고 이름을 정확히)
- [x] `deploy/deploy.ps1` — dot-source + secret-keys.txt (255 → 204줄)
- [x] `deploy/setup-cicd.ps1` — WIF·배포 SA 부트스트랩, 실행 완료
- [x] `tests/conftest.py` — `SKIP_DB_TESTS` 수집 훅
- [x] `.github/workflows/back-deploy.yml`
- [x] 커밋 + push
- [x] **실제 워크플로 초록 + GCP 실측 검증**

## 최종 검증 (run 34094189769 · cc96094)

전 스텝 success. 워크플로 자기보고가 아니라 GCP 에서 되읽은 값:

| 확인 | 값 |
|---|---|
| 새 리비전 | `sajustock-back-00004-hm2` (Ready=True) |
| 이미지 태그 | `…/sajustock-back:cc96094-3` — 커밋으로 되짚을 수 있다 |
| 마이그레이션 잡 | `sajustock-back-migrate-kt992` SUCCEEDED=1, FAILED=(없음) |
| `/health` | HTTP 200 `{"status":"ok"}` |
| 바인딩된 시크릿 | 8개 전부 + env.yaml 의 비밀 아닌 값들 |
| 게이트 | ruff 통과, pytest 347 passed / 200 skipped |

`dev/` 만 바꾼 커밋은 워크플로를 돌리지 않는다 (`paths: back/**`) — 경로 필터도
이 과정에서 실측으로 확인됐다.

## 세 번의 실패와 근본 원인 (자세한 분석은 context 파일)

| # | 겉으로 보인 것 | 실제 원인 |
|---|---|---|
| 1 | 시크릿 8개 전부 "없음" | ① 두 목록을 다르게 정규화 (CR) ② `mapfile < <(...)` 가 실패를 데이터로 오인 |
| 2 | `setup-gcloud` 실패 | **WIF 주체 불일치** — `principal://…/subject/` 에 GitHub `sub` 를 넣을 수 없다. 1번의 진짜 원인도 이것이었다 |
| 3 | "Updated" 뒤 정체불명 에러 | cmd.exe 가 gcloud 인자 안의 `&&` 를 명령 구분자로 먹어 브랜치 제한이 조용히 사라졌다 |

교훈 하나로 줄이면: **검증 환경을 실행 환경과 같게 맞춘다.** 로컬 하네스가
`bash -e` 였고 CI 는 `bash -e -o pipefail` 이었다. 그리고 **성공 메시지를 증거로
쓰지 않는다** — 저장된 값은 되읽어서 확인한다.

## 남은 것 (사용자 판단)

1. `AMPLITUDE_AI_API_KEY` 가 Secret Manager 에 없어 **운영에서 Amplitude 가 꺼져
   있다.** 켜려면 `deploy/secret-keys.txt` 에 한 줄 추가 후 로컬에서 `deploy.ps1`
   을 한 번 돌린다 (값 업로드는 CI 가 못 한다). 지금은 CI 가 경고로 알려준다.
2. `front/` 는 미커밋이다 — `TeaserView.tsx`(1,000원 표시의 짝), `shared/analytics/`,
   `layout.tsx`, `package.json`. 이 파이프라인 대상이 아니다.
3. `.env` 의 `TEST_DATABASE_URL` 이 가리키는 Supabase 프로젝트가 존재하지 않는다
   (`tenant/user postgres.yagqtcbxrjxyymlbotav not found`). 로컬에서 DB 테스트
   183개를 돌리려면 주소를 갱신해야 한다. CI 는 이 DB 에 의존하지 않는다.
