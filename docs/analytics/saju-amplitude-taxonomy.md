# 사주 서비스 Amplitude 이벤트 택소노미

> 대상: **사주 서비스만** (루트 `/` 와 `/saju/*`). 주식 서비스는 이번 범위에서 제외한다.
> 기준일: 2026-09-14 · 설계 버전 `v1`

---

## 0. 이 문서가 답하는 질문

> **"천 원짜리 사주 리포트를, 사람들은 어디서 사기를 포기하는가?"**

택소노미 자체가 목적이 아니다. 이 제품에서 돈이 오가는 유일한 지점이 사주 유료
리포트(1,000원)이고, 그 퍼널의 어느 칸에서 사람이 새는지 모르면 고칠 곳도 모른다.
이벤트는 그 질문에 답하는 데 필요한 만큼만 만든다.

---

## 1. 설계 원칙

이 문서가 따르는 여섯 가지. 모든 개별 판단은 이 중 하나로 환원된다.

| # | 원칙 | 이 문서에서의 적용 |
|---|---|---|
| P1 | **Critical Path 만 이벤트로** | 최종 전환에 이르는 경로에 필요 없는 화면은 오토캡처 page view 에 맡긴다 |
| P2 | **경로 분기는 이벤트가 아니라 프로퍼티로** | 입력 화면 도달 경로 4종을 이벤트 4개로 쪼개지 않고 `root_path` 하나로 흡수 |
| P3 | **파생 가능한 것은 만들지 않는다** | "질문 3개 소진"은 `turn_index=3 AND remaining_after=0` 으로 나온다 → 이벤트 없음 |
| P4 | **View 는 정당화가 필요하다** | 도달 경로가 여럿이거나, 화면에 뜬 정보가 전환을 좌우할 때만 view 로 잡는다 |
| P5 | **유저 프로퍼티 = 행동과 무관하게 유지되는 값** | "유저가 입력했는가"가 아니라 "유저 고유 속성으로 유지되는가"가 기준 |
| P6 | **상속은 Holding Constant 가 필요한 축만** | 일간·오행·시간모름 3종만 퍼널 전 구간에 싣는다 |

---

## 2. 이 서비스의 실제 구조 (설계의 전제)

코드에서 확인한 사실이다. 추측이 아니다.

```
/saju  --307-->  [ / ]  루트가 곧 생년월일시 입력 화면  <- 필수 관문
                   ^
                   |     (dev/active/saju-as-main — 사주가 제품의 메인이 된다)
   +- /saju/intro  +     웹툰 소개 (선택 경유지)
          |  POST /api/v1/saju/chart   (DB·LLM 없음, 순수 계산)
          v
       /saju/teaser  여덟 글자 + 무료 요약
          |
          +-- payment.enabled = true ---> PayButton (토스, CARD | TRANSFER)
          |        |                        1,000원 · retention_days 일 보관
          |        v
          |   /saju/pay/success  -> POST /payments/confirm (서버 승인 = 매출 인식)
          |        |              실패 시 /saju/pay/fail
          |        v
          |   /saju/reports/{token}   유료 리포트 + 추가질문 (토큰이 곧 자격증명)
          |
          +-- payment.enabled = false --> /saju/report   무료 리포트 + 추가질문
                                             (sessionStorage 기반, 재열람 불가)
```

- **로그인이 없다.** `/api/v1/saju/*` 어느 엔드포인트에도 인증 의존성이 없다.
  비회원 결제이므로 분석 단위는 Amplitude **Device ID** 다.
- **루트(`/`)가 곧 사주 입력 화면이다.** 옛 `/saju` 는 `proxy.ts` 에서 307 로 넘어온다.
  그래서 진입 이벤트는 루트에서 나고, 옛 주소로 들어온 사람은 `root_path=legacy_saju`
  로 구분된다 — 북마크와 외부 링크가 아직 살아 있는지를 재는 값이다.
- 리포트 생성은 **비동기 잡**이다 (`POST /report/jobs` → 폴링). 대기 시간이 이탈
  요인이므로 별도 이벤트로 잡는다.
- 추가질문은 리포트당 **최대 3개**, 프리셋 8종 + 자유입력(200자).
  응답 상태는 `answered` 또는 `refused`(정책 거절) 두 가지다.

---

## 3. 이벤트 카테고리 (= 최종 전환 퍼널)

| Label | 퍼널 | 최종 전환 이벤트 |
|---|---|---|
| `saju_purchase` | 유입 → 입력 → 계산 → 티저 → 결제 → **열람** | `saju_report_viewed` |
| `saju_engagement` | 열람 → 추가질문 → 재열람 | `saju_followup_answered` |

### 왜 최종 전환이 "결제"가 아니라 "열람"인가

네이버 시리즈에서 쿠키 충전이 아니라 도서 열람이 최종 전환이었던 것과 같은 이유다.
결제는 카드 승인이 남는 시점이지만, **결제만 하고 리포트를 읽지 않은 사람은
재구매도 추천도 하지 않는다.** 리포트 생성이 비동기 잡이라 승인과 열람 사이에
실제로 사람이 새는 구간(대기·실패)이 존재하므로, 이 구분은 개념이 아니라 실측 대상이다.

매출 인식 시점은 `saju_payment_confirmed` 가 따로 들고 있다 (Amplitude Revenue).

---

## 4. 이벤트 목록

`★` = 최종 전환 · `Phase 2` = 지금 구현하지 않음

### C1 `saju_purchase`

| 이벤트 | 트리거 | 중요도 |
|---|---|---|
| `saju_entry_viewed` | 루트(`/`) 입력 화면 렌더 | High |
| `saju_birth_submitted` | 입력 폼 제출 | High |
| `saju_chart_calculated` | `/saju/chart` 200 응답 | High |
| `saju_chart_failed` | `/saju/chart` 실패 | Medium |
| `saju_teaser_viewed` | `/saju/teaser` 에 계산 결과 렌더 | **Critical** |
| `saju_purchase_clicked` | 결제 CTA 클릭 | **Critical** |
| `saju_checkout_opened` | 주문 생성 성공 + 토스 결제창 오픈 | High |
| `saju_payment_confirmed` | `/payments/confirm` 200 = 매출 인식 | **Critical** |
| `saju_payment_failed` | 주문·결제창·승인 중 실패 | High |
| `saju_report_viewed` ★ | 리포트 본문 첫 렌더 | **Critical** |
| `saju_report_failed` | 리포트 생성/조회 실패 | High |
| `saju_intro_completed` | 웹툰 마지막 패널 도달 | Phase 2 |

### C2 `saju_engagement`

| 이벤트 | 트리거 | 중요도 |
|---|---|---|
| `saju_followup_asked` | 프리셋 칩 클릭 또는 자유질문 전송 | High |
| `saju_followup_answered` ★ | 추가질문 응답 수신 | **Critical** |
| `saju_followup_failed` | 추가질문 실패 — 유료 사용자가 산 슬롯을 잃는 자리 | High |
| `saju_report_reopened` | 구매한 리포트 2회차 이상 열람 | High |
| `saju_site_shared` | 공유 버튼 클릭 종료 (취소·미지원 포함). `share_kind` 가 리포트 링크·여덟 글자 링크·사이트 주소를 가른다 | High |
| `saju_expired_report_opened` | 만료 토큰 접근 | Phase 2 |
| `saju_followup_input_abandoned` | 자유입력 작성 후 미전송 이탈 | Phase 2 |

### 만들지 않기로 한 이벤트, 그리고 이유

| 만들지 않음 | 이유 |
|---|---|
| `saju_intro_viewed` | `/saju/intro` 는 오토캡처 page view 로 충분하다. 필수 관문이 아니다 (P1) |
| `saju_followup_exhausted` | `turn_index=3 AND remaining_after=0` 으로 파생된다 (P3) |
| `saju_report_generated` | 무료 경로에서는 잡이 끝나는 순간이 곧 렌더되는 순간이고, 유료 경로에서는 생성이 서버에서 끝나 있어 관측되지 않는다. 기다린 시간은 `saju_report_viewed` 의 `generation_ms` 가 들고 있고, "결제했는데 못 읽은 사람" 은 확정 이벤트와의 차이로 나온다 (P1·P3) |
| `saju_order_created` | `saju_checkout_opened` 와 실제로 같은 순간이다. 둘로 쪼개면 유사 이벤트 중복 (P1) |
| `saju_payment_method_selected` | 토스 결제창 **내부**라 추적 불가. 수단은 `saju_purchase_clicked` 에 싣는다 |
| `saju_calendar_type_toggled` 등 폼 조작 | 폼 상호작용 오토캡처를 끈 결정과 같은 이유. 최종 제출값만 본다 |
| 화면별 `*_page_viewed` 전부 | 오토캡처 page view 가 이미 잡는다 |

### 핵심 퍼널 6단계를 오토캡처 page view 로 대체하지 않은 이유

오토캡처가 이미 `/saju/teaser` 방문을 잡는데도 `saju_teaser_viewed` 를 따로 만든다.
근거가 셋이다.

1. **퍼널 차트 조립 비용.** page view 로 퍼널을 그리려면 매 단계마다
   `[Amplitude] Page Viewed` 를 고르고 → 프로퍼티를 고르고 → 경로 값을 고르는
   3클릭이 필요하다. 6단계면 18클릭이다. 명시 이벤트면 6클릭이다.
2. **경로 값의 신뢰도.** 이 앱은 URL 에서 자격증명을 지운다
   (`shared/analytics/redact.ts`). `/saju/reports/{token}` 은 `/saju/reports/[token]`
   으로 치환되어 들어가므로 page view 의 경로 값은 이미 가공된 값이다.
3. **매출 퍼널이다.** 제품에서 돈이 오가는 유일한 경로에 이벤트 비용을 쓰지 않을
   이유가 없다. 대신 그 밖의 모든 화면은 오토캡처에 전부 맡긴다.

---

## 5. 상속 컨텍스트 (P6)

퍼널 전 구간에 함께 실리는 프로퍼티. 그 외에는 상속하지 않는다.

| 프로퍼티 | 상속 시작 | 왜 상속하는가 |
|---|---|---|
| `root_path` | 첫 진입 | 제품 안에서 **어느 문으로 들어왔는가** (`root` / `intro` / `legacy_saju` / `share`). 세션 내내 고정된다 |
| `report_tier` | 티저 이후 | `free` / `paid` 모드가 갈리는 지점부터 끝까지 |
| `day_master` | 계산 성공 이후 | 퍼널 차트 **Holding Constant** 로 "일간별 결제 전환율" 을 재려면 전 구간에 있어야 한다 |
| `dominant_element` | 계산 성공 이후 | 위와 동일 |
| `is_time_unknown` | 입력 제출 이후 | 시간을 모르는 사람이 더 이탈하는지가 실제 가설이다 |

**`root_path` 는 마케팅 채널이 아니다.** `ad` 나 `naver_search` 같은 값을 넣지 않는 이유는
오토캡처의 attribution 이 이미 utm·referrer 를 채워 주기 때문이다. 같은 것을 두 번
수집하면 두 값이 언젠가 어긋나고, 그때 어느 쪽이 맞는지 아무도 모른다.

**진입 이벤트에는 `entry_point` 를 따로 싣지 않는다.** 루트가 사주 화면이 된 뒤로
그 값은 `root_path` 와 같은 것을 말한다 — 한 이벤트에 같은 사실을 두 이름으로
담지 않는다 (P3).

상속을 늘리면 퍼널 순서가 고정되어 경로를 바꾸기 어려워진다. 그래서 상속은 다섯
개뿐이고, 그중 **Holding Constant 로 실제로 쓰는 축은 사주 3종**이다. 나머지 둘은
세그먼트를 가르는 값이다.

---

## 6. 개인정보 경계 (이 설계에서 타협 불가한 선)

백엔드는 사주 LLM 호출을 `metadata_only` 로 보낸다. 이유는
`back/app/integrations/amplitude.py` 에 적혀 있다 — **네 기둥과 대운의 조합은
생년월일시로 역산된다.** 프런트 택소노미가 그 결정을 우회하면 안 된다.

### 절대 전송 금지

`birth_year` `birth_month` `birth_day` `birth_hour` `birth_minute`
`birth_place_code` `birth_place_label` `four_pillars` `day_pillar` `luck_cycle`
`access_token` `order_id` `payment_key` · 리포트 본문 · 추가질문 자유 텍스트 원문

### 허용하는 것과 그 근거

| 보내는 값 | 왜 안전한가 |
|---|---|
| `day_master` (일간 1글자) | 10분의 1로만 좁힌다. 날짜를 특정하지 못한다 |
| `dominant_element` (오행 최다) | 5분의 1. 일간과 합쳐도 역산 불가 |
| `is_time_unknown` · `calendar_type` · `is_leap_month` | 날짜 정보를 담지 않는 입력 **형식**이다 |
| `gender` | 재식별 기여도가 없고, 사주 계산의 필수 입력이라 이탈 분석에 직접 쓰인다 |
| `text_length` (자유질문 길이) | 원문 대신 길이만. 질문 성의와 만족도의 상관을 볼 수 있다 |

### 안전망

`redact.ts` 에 위 금지 키를 **하드 블록**으로 추가한다. 지금의 URL 리댁션은 값이
URL 처럼 보일 때만 동작하므로 `birth_year: 1990` 같은 실수를 막지 못한다.
설계 문서는 실수를 막지 못하고, 코드만 막는다.

---

## 7. 유저 프로퍼티

로그인이 없으므로 **Device ID 단위**로 쌓인다.

| 프로퍼티 | 연산 | 예시 | 갱신 시점 |
|---|---|---|---|
| `first_seen_at` | setOnce | `2026-09-14` | 진입 |
| `first_root_path` | setOnce | `intro` | 진입 |
| `saju_chart_count` | add | `3` | 계산 성공 |
| `saju_purchase_count` | add | `1` | 승인 |
| `lifetime_revenue_krw` | add | `2000` | 승인 |
| `first_purchased_at` | setOnce | `2026-09-14` | 승인 |
| `last_purchased_at` | set | `2026-09-20` | 승인 |
| `is_payer` | set | `true` | 승인 |
| `report_tier_seen` | preInsert | `free` / `paid` | 리포트 열람 |
| `followup_total_count` | add | `3` | 추가질문 응답 |

날짜는 **KST 기준 `YYYY-MM-DD`** 다. UTC 로 찍으면 밤 9시 이후의 결제가 다음 날로
넘어가는데, 결제가 몰리는 시간대가 하필 거기라 코호트가 통째로 하루씩 어긋난다.

연산자를 고르는 것이 곧 값의 의미다. 누적을 `set` 으로 넣으면 화면이 세던 숫자를
덮어써서 조용히 틀려진다 — 탭이 둘이면 특히.

### 유저 프로퍼티로 두면 안 되는 것 — 이 설계의 가장 중요한 판단

`gender` `day_master` `dominant_element` `calendar_type` `is_time_unknown`

배달 주소가 유저 프로퍼티가 아닌 것과 **정확히 같은 구조**다. 겉보기엔 개인
식별 정보라 유저에게 붙일 것 같지만, 사주 서비스는 **한 기기로 본인·배우자·자녀·
친구의 사주를 대신 보는 행태가 지배적**이다. 그러므로 이 값들은 유저의 고유
속성이 아니라 **조회 건별 값**이고, 이벤트 프로퍼티다.

마지막 값으로 유저에게 덮어쓰면 "여성 유저의 결제율" 같은 지표가 조용히 거짓이 된다.
다른 사람 사주를 한 번 본 순간 그 유저의 성별이 바뀌기 때문이다.

요약값(예: 최빈 달력 종류)도 두지 않았다. 그것을 내려면 조회 이력을 브라우저에
쌓아야 하는데, 이 제품은 사주를 저장하지 않기로 한 쪽이다. **없는 데이터를 지어내는
대신 이벤트 프로퍼티로 세그먼트를 나눈다.**

---

## 8. 네이밍 컨벤션

- **이벤트**: `saju_{객체}_{동사 과거형}` · snake_case
  - `saju_report_viewed`, `saju_payment_confirmed`
  - 접두사 `saju_` 는 주식 서비스가 합류할 때 `stock_` 과 이름만으로 갈리게 한다.
    프로퍼티 필터 없이 퍼널을 조립할 수 있고, 합쳐 볼 때는 Custom Event 를 만든다.
- **프로퍼티**: snake_case 명사.
  - 불리언 `is_` / `has_` · 시각 `_at`(ISO 8601) · 소요 `_ms` · 금액 `_krw` · 개수 `_count`
- **값**: 소문자 snake_case enum. **한글 라벨을 값으로 쓰지 않는다** — 문구가 바뀌면
  과거 데이터와 갈라진다.
- 기존 `track("Viewed Home Page", { prompt_version })` 은 **제거한다.** 오토캡처
  page view 와 중복이고, SDK 설치 검증용 잔재다.

---

## 9. 예상 이벤트 볼륨

| 유저 유형 | 1인당 이벤트 |
|---|---|
| 티저까지 보고 이탈 | 4 (entry · submit · chart · teaser) |
| 결제 완료 + 열람 | 9 |
| 추가질문 3개 소진 | +6 |
| 재열람 1회 | +1 |

MAU 10,000 · 결제율 2% 가정 → 월 약 **43,000 이벤트**. 오토캡처
`elementInteractions` 를 끈 현재 설정을 유지하는 것이 가장 큰 비용 절감이며,
이 설계는 그 결정을 바꾸지 않는다.

---

## 10. 구현 규약 (승인 후)

| 파일 | 역할 |
|---|---|
| `shared/analytics/events.ts` | 이벤트 이름·상품 id·프로퍼티 타입의 **계약**. SDK 를 모르는 순수 모듈 |
| `shared/analytics/track.ts` | SDK 를 부르는 유일한 자리 — `trackEvent` · `trackRevenue` · `identifyUser` |
| `shared/analytics/redact.ts` | URL 리댁션 + 금지 키 하드 블록 |
| `shared/analytics/AmplitudeProvider.tsx` | 초기화 전용 |
| `features/saju/model/analytics.ts` | `trackSaju()` — 화면이 쓰는 유일한 함수 |
| `features/saju/model/analytics-context.ts` | 상속 컨텍스트·시간 마크(sessionStorage) |
| `features/saju/model/analytics-values.ts` | 일간·오행·리퍼러·KST 날짜의 순수 변환 |
| `features/saju/model/report-views.ts` | 리포트 열람 회차(localStorage) — 첫 열람과 재열람을 가른다 |

계측이 들어간 화면: `SajuEntry` · `TeaserScreen` · `PayButton` · `PaySuccessScreen` ·
`ReportScreen` · `PaidReportScreen` · `FollowUpChat` · `ShareButton`.

SDK 를 아는 파일을 하나로 묶는 기존 규약을 그대로 따른다. 래퍼를 두는 이유는
취향이 아니라 **오타와 프로퍼티 드리프트가 조용히 데이터를 망가뜨리기 때문**이다.

---

## 11. 부속 시트

| 파일 | 내용 |
|---|---|
| `saju-event-properties.csv` | 개발 전달용 Event Property 시트 |
| `saju-user-properties.csv` | 개발 전달용 User Property 시트 |
