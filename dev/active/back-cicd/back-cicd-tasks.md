# back CI/CD — 체크리스트

- [x] 현재 GCP/GitHub 상태 실측 (프로젝트 번호, SA, 버킷, AR, 시크릿, WIF 풀, 저장소 공개 여부)
- [x] dev docs 생성
- [x] `back/deploy/gcloud-lib.ps1` — deploy.ps1 에서 gcloud 헬퍼 추출 (+ `Get-GcloudLines`·`Get-SecretKeys`)
- [x] `back/deploy/secret-keys.txt` — 바인딩 키 목록
- [x] `back/deploy/deploy.ps1` — dot-source + secret-keys.txt 로 교체 (255 → 204줄, 파싱 OK)
- [x] `back/deploy/setup-cicd.ps1` — WIF·배포 SA 부트스트랩 작성
- [x] `setup-cicd.ps1` 실행 → 풀/프로바이더/SA 생성, IAM 실측 검증 완료
- [x] `back/tests/conftest.py` — `SKIP_DB_TESTS` 수집 훅
- [x] 로컬 검증 (아래 "증거")
- [x] 액션 태그 실측 확인 (setup-uv 는 major 이동 태그가 없어 `v10.0.1` 고정)
- [x] `.github/workflows/back-deploy.yml` 작성 — YAML 파싱 + 10개 bash 블록 `bash -n` 통과
- [x] 비밀 해석 스텝을 실제 gcloud 로 실행 검증 (정상 8개 / 누락 경고 2개)
- [ ] 커밋 + push
- [ ] 실제 워크플로 실행 초록 확인 + `/health` 스모크 통과 증명

## 증거 (로컬 검증)

| 케이스 | 결과 |
|---|---|
| `ruff check .` | All checks passed |
| `SKIP_DB_TESTS=1` + 주소 없음 | **364 passed, 183 skipped** (5.63s) |
| 플래그 없음 + 주소 없음 | 기존 `RuntimeError` 그대로 (동작 불변) |
| 주소 있음 + 플래그 켜짐 | 플래그 무시, DB 테스트 시도됨 |
| 비밀 해석 (정상) | 8개 선언 / 8개 존재 / 바인딩 문자열이 deploy.ps1 과 동일 |
| 비밀 해석 (누락) | 2개 `::warning`, 나머지 8개는 정상 바인딩, exit 0 |

`.env` 의 `TEST_DATABASE_URL` 이 가리키는 Supabase 프로젝트는 현재 존재하지 않는다
(`tenant/user postgres.yagqtcbxrjxyymlbotav not found`). CI 는 그 DB 에 의존하지 않으므로
막히는 것은 없지만, 로컬에서 DB 테스트를 돌리려면 주소를 갱신해야 한다.

## push 전에 정리해야 할 것

작업 트리에 커밋 안 된 `back/app` 변경이 **337줄** 있다 (llm.py +233, stocks.py,
saju.py, config.py, main.py, prompts.py, agents/*) + `app/integrations/amplitude.py`
신규 + pyproject/uv.lock 의 amplitude 의존성.

CI 는 **커밋된 트리** 를 빌드한다. CI 파일만 커밋해 push 하면 그 337줄이 운영에서
사라진다 — 지금 도는 리비전(`20260903-132804`)은 그 변경이 로컬에 있던 상태에서
빌드된 것이다. 커밋 범위를 사용자와 정한 뒤 push 한다.
