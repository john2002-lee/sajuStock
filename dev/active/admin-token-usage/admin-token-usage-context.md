# Context — 관리자 AI 토큰 사용량

**Last Updated:** 2026-09-14

## 핵심 파일

| 파일 | 역할 | 비고 |
|---|---|---|
| `back/app/integrations/llm.py` | **모든 LLM 호출의 유일한 경계** | `_usage()` 가 이미 Gemini `usage_metadata` 를 우리 어휘로 옮긴다. 지금은 Amplitude 로만 나감 |
| `back/app/integrations/amplitude.py` | 계측 경계 | "세션 없으면 조용히 아무것도 안 한다" — 싱크 설계가 따라야 할 자세 |
| `back/app/models/visit_day.py` | 일별 롤업 + KST 날짜의 선례 | 새 테이블이 그대로 따른다 |
| `back/app/domain/visits.py` | `korean_date()` | KST 환산은 **저장 시점에 한 번**. 재구현 금지 |
| `back/app/services/admin_service.py` | `get_ops_snapshot` (dataclass `OpsSnapshot` at L319) | 서비스 dataclass ↔ 스키마가 **따로**다 |
| `back/app/schemas/admin.py` | `OpsSnapshot` (Pydantic, L162) | 엔드포인트가 수동 매핑 |
| `back/app/api/v1/endpoints/admin.py` | `GET /ops` (L116) | 필드 추가 시 매핑도 함께 |
| `front/src/features/common/admin/model/types.ts` | Wire(snake) ↔ View(camel) | 변환 함수가 같은 배럴에 |
| `front/src/features/common/admin/components/OpsPanel.tsx` | 표기 자리 | `Stat` · `SectionTitle` 재사용 |

## 의존 방향 (back/README.md)

`api → services → repositories → integrations → domain/utils`.
**`integrations` 는 `core` 와 `domain` 만 import 한다** (기존 파일 전수 확인). 그래서
llm.py 가 repository 를 직접 부를 수 없고, 싱크 주입으로 뒤집는다.

## 알아 둘 것

- alembic head = `b7c1a5f39e02` (add_visit_days). 단일 head.
- 백엔드 파일은 CRLF/LF 가 섞여 있다. **새 파일은 LF**(`visit_day.py`·최근 마이그레이션과 동일), 기존 파일 편집은 그 파일의 줄끝 유지.
- 프런트 `src/**` 는 전부 CRLF.
- 로컬 백엔드 실행: 셸의 빈 `GEMINI_API_KEY` 가 `.env` 를 덮으므로 `env -u GEMINI_API_KEY -u GEMINI_MODEL` 로 띄운다.
- 사고(thinking) 토큰은 Gemini 에서 **출력으로 과금**된다 (`saju-llm-cost.xlsx` 실측: medium 에서 과금 출력의 절반 이상). 화면이 출력과 사고를 나눠 보여야 그 사실이 보인다.

## 결정 로그

- **일별 롤업 채택 / 호출별 행 기각** — 화면이 묻는 것은 합계뿐이고 호출 단위는 Amplitude 에 있다. advice 한 건이 LLM 4회라 호출별 행은 금세 불어난다.
- **"남은 토큰량" 미표기** — 사용자 결정. Gemini 가 잔여를 안 주고 예산도 두지 않음.
- **실패 호출은 기록하지 않는다** — 사용량 메타 자체가 없다. 실패율은 Amplitude 의 몫.
