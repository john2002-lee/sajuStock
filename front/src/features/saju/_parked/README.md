# `_parked` — 얼려 둔 투자 성향 온보딩

**이 폴더의 코드는 빌드되지 않습니다.** `tsconfig.json` 과 `eslint.config.mjs` 가
`src/features/**/_parked/**` 를 제외합니다.

## 무엇이 들어 있나

| 파일 | 무엇이었나 |
|---|---|
| `SajuOnboarding.tsx` | 입력 → 사주 → 6축 초안 → 보정 → 저장의 전체 흐름을 한 화면에서 |
| `ProfileEditor.tsx` | 6축 슬라이더 보정 + `source` 를 `saju`/`user_edited` 로 가르는 저장 |
| `PillarGrid.tsx` | 4기둥 격자 (주식 쪽 에디토리얼 팔레트 버전) |
| `WuxingBars.tsx` | 오행 빈도 막대 (같은 팔레트) |
| `LuckTimeline.tsx` | 대운 타임라인 (같은 팔레트) |

## 왜 지우지 않고 얼렸나

`사주 → 투자 성향 6축 → 종목 판단`은 **이 저장소가 존재하는 이유**입니다
([통합 기획](../../../../../docs/saju-integration-plan.md) 1절). 지금은 사주 화면을
SajuService 원본과 같은 모양(입력 → 티저 → 웹툰 리포트)으로 되돌리면서 그 단계를
화면에서 뺐지만, 연결 자체가 사라진 것은 아닙니다.

**아직 살아 있는 것:**

- 백엔드 `POST /api/v1/saju/chart` 응답의 `profile` 필드 (6축 초안)
- 백엔드 `domain/saju/profile_mapping.py` (매핑 규칙 + 테스트)
- 백엔드 `PUT /api/v1/profile` (저장)
- 프런트 BFF `/api/profile`
- `domain/fit.py` · `domain/verdict.py` (성향 × 종목 결합)

즉 **화면만 빠져 있습니다.** 되살리려면 이 폴더의 컴포넌트를 다시 붙이면 됩니다.

## 되살릴 때 고쳐야 하는 것

이 코드는 얼리기 **전** API 를 기준으로 합니다. 그 뒤로 바뀐 것:

1. **`BirthForm` 의 계약이 다릅니다.** 지금 것은 SajuService 디자인이고
   `onSubmit(values: BirthFormValues)` 를 받습니다. 얼린 `SajuOnboarding` 은 옛
   `onSubmit(input: BirthInput)` 를 기대합니다.
2. **팔레트가 다릅니다.** `PillarGrid`·`WuxingBars`·`LuckTimeline` 은 주식 쪽 토큰
   (`border-line-18`·`text-muted-55`)을 씁니다. 사주 화면은 이제
   `data-service="saju"` 아래 금빛 팔레트라, 같은 자리에 쓰려면
   `components/ChartPanels.tsx` 쪽(이미 금빛)을 쓰는 편이 낫습니다.
3. **진입 경로를 정해야 합니다.** 논의했던 후보는 리포트 끝의 CTA
   (`/saju/report` → `/saju/profile`) 또는 주식 쪽 독립 화면입니다.

## 관련 문서

- [사주 화면 현황](../../../../../docs/saju-frontend-status.md) — 무엇이 언제 왜 바뀌었나
- [사주 → 성향 매핑 규칙](../../../../../docs/saju-profile-mapping.md) — 6축이 어떻게 나오나
