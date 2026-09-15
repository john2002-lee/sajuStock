# 관리자 화면 · AI 토큰 사용량 표기

## 요구

관리자 운영 현황 화면에 **사용한 토큰량**을 표기한다.

## 확정된 결정 (2026-09-14, 사용자 선택)

| 질문 | 결정 | 근거 |
|---|---|---|
| "남은 토큰량" 기준 | **표기하지 않는다** | Gemini API 가 잔여 할당량을 응답으로 주지 않고, 월 예산도 두지 않기로 함 |
| 집계 시작점 | **지금부터 누적** | 과거 사용량은 DB 에 없다 (Amplitude 로만 나갔음). 화면이 "집계 시작일"을 함께 밝힌다 |
| 집계 대상 | 모든 LLM 호출 | 사주 리포트 · RAG · 주식 AI 판단 에이전트가 전부 `integrations/llm.py` 한 곳을 지난다 |
| 표기 위치 | `/admin` 운영 현황 (`OpsPanel`) | 이미 "AI 판단" 블록이 있고 성격이 같다 |

## 표기 내용

- 오늘 (KST) · 이번 달 (KST) · 누적 — 각각 호출 수 / 입력 / 출력(사고 포함) / 합계 토큰
- 모델별 누적 분해 (모델을 바꿔 가며 쓰는 저장소라 필요)
- 집계 시작일

## 저장 설계 — 일별 롤업

**호출 한 건당 한 행이 아니다.** `visit_days` 와 같은 판단이다: 화면이 묻는 것은
오늘·이번 달·누적 합계뿐이고, 호출 단위 상세는 이미 Amplitude 가 갖고 있다.
(모델, KST 날짜) 유니크로 upsert 하면 테이블이 하루 몇 행으로 유지된다.

## 계층 문제와 해법

`integrations/` 는 `core`·`domain` 만 import 한다 (실측: 기존 import 전부 그 둘).
`repositories` 를 부르면 의존이 **위로** 흐른다. 그래서 **싱크 주입**을 쓴다:

```
main.py (lifespan) ──register──▶ llm.set_usage_sink(llm_usage_service.record)
integrations/llm.py ──await sink(model, tokens)──▶ services ──▶ repositories ──▶ DB
```

`amplitude.active_session()` 이 "없으면 조용히 아무것도 하지 않는다" 로 도는 것과
같은 자세다. 싱크가 없으면(테스트·배치) 기록하지 않는다.

## 단계

1. `domain/llm_usage.py` — 순수 dataclass `LlmTokens`
2. `models/llm_usage_day.py` — `llm_usage_days` ORM
3. alembic 마이그레이션 (head `b7c1a5f39e02` 위에)
4. `repositories/llm_usage.py` — upsert + 집계
5. `services/llm_usage_service.py` — 싱크 구현 (자체 세션) + 요약
6. `integrations/llm.py` — 싱크 훅 + 성공 경로에서 기록
7. `main.py` — lifespan 에서 싱크 등록/해제
8. `schemas/admin.py` + `api/v1/endpoints/admin.py` + `services/admin_service.py` — OpsSnapshot 확장
9. 프런트 `model/types.ts` + `components/OpsPanel.tsx`
10. 검증 — pytest · ruff · tsc · lint · 실제 화면
