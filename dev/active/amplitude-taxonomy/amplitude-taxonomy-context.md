# 사주 Amplitude 택소노미 — 컨텍스트

**Last Updated: 2026-09-14**

## 핵심 파일

| 파일 | 왜 중요한가 |
|---|---|
| `front/src/shared/analytics/AmplitudeProvider.tsx` | 분석 SDK 를 아는 **유일한** 파일. 오토캡처 3종(page view·session·attribution)만 켜져 있고 form/element/download 는 꺼져 있다. 주석이 "제품 행동은 taxonomy 설계 후 명시 이벤트로" 라고 명시 |
| `front/src/shared/analytics/redact.ts` | URL 에서 리포트 토큰·결제키를 지우는 enrichment 플러그인. **초기화 이후** 등록해야 마지막에 돈다 (그러지 않으면 `pageUrlEnrichment` 가 되살림) |
| `front/src/features/saju/components/TeaserView.tsx` | 결제 CTA 와 무료 CTA 가 갈리는 분기점 (`payment.enabled`) |
| `front/src/features/saju/components/PayButton.tsx` | 토스 `requestPayment` — 수단은 `CARD` \| `TRANSFER` 두 가지 |
| `front/src/features/saju/components/PaySuccessScreen.tsx` | 승인(confirm) → `/saju/reports/{token}` 리다이렉트. 409 는 중복 승인 |
| `front/src/features/saju/components/ReportScreen.tsx` | **무료** 경로. sessionStorage 기반 잡 폴링 |
| `front/src/features/saju/components/PaidReportScreen.tsx` | **유료** 경로. 토큰으로 조회, 409 `saju_report_generating` 이면 재시도 |
| `front/src/features/saju/components/FollowUpChat.tsx` | 추가질문. 최대 3개, 프리셋 8종 + 자유입력 |
| `back/app/domain/saju/followup.py` | 프리셋 키 8종 · `MAX_FOLLOW_UPS=3` · `MAX_FREE_TEXT=200` 의 원천 |
| `back/app/integrations/amplitude.py` | 사주 LLM 호출이 `metadata_only` 인 이유 = **네 기둥은 생년월일시로 역산된다**. 이 문서의 PII 경계가 여기서 나왔다 |
| `back/app/core/config.py:192` | `saju_report_price = 1000` |

## 의사결정 기록

1. **주식 제외** — 사용자 지시(세션 중). 주식 이벤트는 설계하지 않는다.
2. **최종 전환 = 열람** — 네이버 시리즈의 "충전이 아니라 열람" 논리. 이 제품에서는
   리포트 생성이 비동기 잡이라 승인과 열람 사이에 진짜 이탈 구간이 존재한다.
3. **핵심 퍼널은 오토캡처 page view 로 대체하지 않는다** — 퍼널 차트 조립 클릭 수,
   리댁션으로 가공된 경로 값의 신뢰도, 그리고 이것이 유일한 매출 퍼널이라는 점.
4. **사주 속성은 전부 이벤트 프로퍼티** — 한 기기로 가족·친구 사주를 대신 보는
   행태가 지배적이므로 `gender` `day_master` 등은 유저 고유값이 아니다.
   (버거킹 배달주소 사례와 같은 구조)
5. **상속은 5종으로 제한** — 상속이 늘면 퍼널 순서가 고정되어 경로 변경이 막힌다.
6. **`saju_followup_exhausted` 미생성** — `turn_index=3 AND remaining_after=0` 으로 파생.

## 의존성 / 제약

- 사주는 **로그인이 없다.** 분석 단위는 Device ID. User Property 는 기기 단위로 쌓인다.
- 세션 리플레이가 `/saju/*` 에서 `conservative` 마스킹 중 — 택소노미가 이 결정을
  우회하면 안 된다.
- 배포는 main 푸시 → Vercel 자동. 로컬 렌더 확인은 완료 증명이 아니다.
- `env.download` 는 실제 키가 든 파일. 공개 저장소이므로 `git add -A` 금지.

## 현재 상태 (2026-09-14)

설계 문서 3종 + 계측 구현 완료.

- 이벤트 16개 계측 (Required). Phase 2 3개는 미착수.
- 유저 프로퍼티 10개 (setOnce·set·add·preInsert).
- 검증: 분석 관련 테스트 82개 통과 · `tsc --noEmit` 통과 · `eslint` 통과 · `next build` 통과.
- **남은 것: QA — 로컬 dev 서버에서 실제 이벤트 적재 확인** (Phase 5).

설계 후 바뀐 결정 세 가지:

1. `root_path` 에서 `legacy_saju`·`ad`·`share` 를 뺐다. 307 은 리퍼러를 바꾸지 않아
   브라우저에서 안 보이고, 채널은 attribution 이 이미 준다. 남은 값은 `root`·`intro`·`unknown`.
2. `saju_report_generated` 를 만들지 않았다. 무료 경로에서는 잡 완료가 곧 렌더이고,
   유료 경로에서는 생성이 서버에서 끝나 있어 관측되지 않는다.
3. `saju_followup_failed` 와 `saju_site_shared` 를 추가했다. 앞은 유료 사용자가 산
   질문 슬롯을 잃는 자리이고, 뒤는 이 작업 중에 공유 버튼이 새로 생겼다.

### 리뷰에서 고친 것

`redact.ts` 하드 블록이 `identify` 의 **중첩된** 유저 속성(`{$set: {...}}`)을 보지
못했다. 이벤트와 달리 유저 속성은 영구히 남으므로 한 겹 안쪽까지 검사하도록 고쳤다.

### 알려진 무관한 실패

`src/lib/api/client.test.ts` 의 7개가 단독 실행에서도 cancelled 로 끝난다. 이 작업이
건드리지 않은 파일이고, 타임아웃·오프라인 테스트라 Windows 에서 불안정한 것으로 보인다.

## 2026-09-15 — 백엔드 이벤트가 **전량 폐기되고 있었다**

`app/api/v1/endpoints/saju.py` 가 세션을 `user_id=None` 으로 열고 `device_id` 도 주지
않았다. Amplitude Python SDK 는 **둘 다 비면 이벤트를 버린다**:

```python
# amplitude/plugin.verify_event
if (not event["event_type"]) or (not event["user_id"] and not event["device_id"]):
    return False   # → InvalidEventError → 폐기
```

`user_id=None` 은 의도된 선택이었지만(주석: "없는 신원을 지어내지 않는다") 그 결과가
**사주 LLM 계측 전량 폐기**인 것은 의도가 아니었다. 토큰·지연·비용·오류가 한 건도
도착하지 않았다. 예외도 재시도도 없고 로그에 `Invalid event` 한 줄뿐이라 화면·API·
테스트 어디에도 흔적이 없었다.

**주식 경로(`endpoints/stocks.py`)는 `user_id=owner` 라 영향이 없었다.**

### 고친 방식 — 일회용 device_id (사용자 결정)

`integrations/amplitude._identity()` 가 신원이 비면 `throwaway:<uuid4>` 를 채운다.
저장되지 않고 다음 요청에서 다시 쓰이지 않으며 쿠키·헤더 어디에서도 오지 않는다 —
"없는 신원을 지어내지 않는다" 는 원칙은 유지된다.

**대가는 대시보드의 기기 수다.** 리포트 한 건 = 기기 하나로 세어지므로 이 경로에서
"사용자 수" 류 지표는 뜻이 없다. 그 숫자는 프런트 SDK 가 device ID 로 이미 센다.
여기서 보려는 것은 토큰·지연·오류이고, 그쪽은 이 값이 무엇이든 옳다.

검토했지만 고르지 않은 대안: 브라우저 device_id 를 BFF 헤더로 전달(프런트 퍼널과
백엔드 LLM 계측이 같은 타임라인으로 붙는다). 변경 범위가 넓어 보류.

### 증명

- 수정 전 마지막 실패 `11:11:22`, 수정 후 실행(`11:13:27`·`11:15:39`) **오류 없음**
- `tests/test_amplitude_identity.py` 5건이 "둘 중 하나는 반드시 있다" 를 고정
- 백엔드 396 통과 (실패 183건은 `TEST_DATABASE_URL` 부재로 기존부터)

### 남은 것

`[Agent] Cost USD` 를 Amplitude 가 직접 계산해 준다(실측: 리포트 1건 $0.0015~0.0079).
`llm_usage_days` 의 토큰 집계와 **교차 검증할 수 있는 값**이다.
