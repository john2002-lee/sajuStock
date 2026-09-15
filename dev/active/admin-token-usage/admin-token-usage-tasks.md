# Tasks — 관리자 AI 토큰 사용량

- [x] 1. `back/app/domain/llm_usage.py` — `LlmTokens` 순수 dataclass
- [x] 2. `back/app/models/llm_usage_day.py` — `llm_usage_days`
- [x] 3. `back/alembic/versions/e7d4b1a9c250_add_llm_usage_days.py` (down_revision = `b7c1a5f39e02`)
- [x] 4. `back/app/repositories/llm_usage.py` — upsert + 집계
- [x] 5. `back/app/services/llm_usage_service.py` — 싱크 + 자체 세션
- [x] 6. `back/app/integrations/llm.py` — `set_usage_sink` · 성공/거절 경로 기록
- [x] 7. `back/app/main.py` — lifespan 등록/해제
- [x] 8. `schemas/admin.py` · `services/admin_service.py` · `api/deps.py` · `api/v1/endpoints/admin.py`
- [x] 9. 프런트 `model/types.ts` · `services/adminApi.ts` · `components/OpsPanel.tsx`
- [x] 10. 검증
  - [x] ruff 통과 · pytest 388 통과 (신규 13건)
  - [x] tsc 0 · eslint 0 · 프런트 225 통과
  - [x] `alembic upgrade head` 적용 (`b7c1a5f39e02` → `e7d4b1a9c250`)
  - [x] 실제 사주 리포트 2건 → `llm_usage_days` 한 행에 누적 (calls 2, total 14,764)
  - [x] `GET /admin/ops` 응답에 `token_usage` 정상
  - [x] `/admin` 화면 육안 확인 — 오늘/이번 달/누적 20,996 토큰 · 호출 3, 모델별 `gemini-2.5-flash`

## 검증 중 알게 된 것

- **`gemini-3-flash-preview` 가 지금 극단적으로 느리다.** 한 단어 응답에 **44.2초**
  (`llm_timeout_seconds=45` 바로 아래). 사주 리포트는 그래서 504 DEADLINE_EXCEEDED 로
  실패하고 매번 `source="fallback"` 로 내려간다. `gemini-2.5-flash` 는 같은 계정에서
  0.9초. **오픈 전에 봐야 할 문제다** — 코드 문제가 아니라 모델 가용성이다.
- 로컬 백엔드는 `back-dev-clean` 으로 띄운다 (`.claude/launch.json`). 셸의 빈
  `GEMINI_API_KEY` 와 이미지 모델 `GEMINI_MODEL` 을 걷어내는 런처를 거친다.
- `TEST_DATABASE_URL` 이 가리키는 테스트 Supabase 프로젝트가 존재하지 않는다
  (`ENOTFOUND tenant`). DB 를 쓰는 테스트 183건이 **이 변경 이전부터** 에러다.
- `alembic check` 은 FAILED 지만 전부 `saju_orders`/`saju_reports` 드리프트다
  (미커밋 상태인 다른 작업). `llm_usage_days` 관련 항목은 없다.

## 코드 리뷰 반영 (2026-09-14)

- **[HIGH] `/admin/ops` 전체 500 방지** — `llm_usage_days` 가 없으면 `UndefinedTable`
  이 그대로 500 이 되어 배치 상태와 **자물쇠 경고까지** 사라졌다.
  `admin_service._token_usage_or_empty` 가 `SQLAlchemyError` 만 접고 0 을 준다.
  `tests/test_admin_ops_degradation.py` 가 지킨다 (프로그래밍 오류는 안 삼킨다).
- **[MED] 모델별 합 ≠ 누적** — `by_model` 이 별도 쿼리라 그 사이 호출이 끼면 어긋났다.
  모델로 묶은 **한 문장**으로 합치고 합계는 파이썬에서 더한다 → 정의상 일치.
- **[MED] `calls` 주석이 사실과 반대** — 거절 호출도 센다(입력 토큰은 태웠으므로).
  모델·리포지터리·스키마·프런트 4곳 주석 수정.
- **[LOW] `last_seen_at` 역행** — `greatest()` 로 민다 (동시 커밋 순서 ≠ 시작 순서).
- **[LOW] 이번 달 상한 없음** — `usage_date <= today` 추가.
- **[LOW] `_persist` 의 계산이 try 밖** — SDK 타입 변경이 LLM 경로로 새지 않게 안으로.
- **[LOW] 프런트 필드 방어** — `?? 0` (없으면 화면에 "NaN 토큰").
- **[LOW] 빈 상태 문구** — 세 경우(호출 없음/스키마 없음/구버전 백엔드)를 구분해 말한다.
- **[LOW] 임베딩 제외 명시** — `embed_content` 는 토큰 수를 안 준다(과금 단위가 문자).

### 반영하지 않은 지적

- **기록이 LLM 응답 경로에 동기로 붙어 있다** (`await _persist`). NullPool 이라
  호출마다 새 커넥션이고, advice 는 한 요청에 4회다. 백그라운드 태스크로 빼면
  지연은 사라지지만 **종료 시 유실**과 태스크 수명 관리가 생긴다. 지금 비용은
  LLM 호출(수 초~수십 초) 대비 1% 수준이라 단순한 쪽을 택했다. 사용량이 늘면
  다시 볼 것.
- **누적 구성(입력+출력+사고)이 합계와 산술적으로 안 맞을 수 있다.** 합계는
  프로바이더가 셈한 `total_token_count` 이고 구성은 각각 저장한 값이다. 현재
  Gemini 회계에서는 일치한다.
