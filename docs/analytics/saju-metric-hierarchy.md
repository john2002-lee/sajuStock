# 사주 서비스 지표 하이라키

> 대상: **사주 서비스만** (루트 `/` 와 `/saju/*`). 주식 서비스는 개발 전용이라 이번 범위 밖이다.
> 기준일: 2026-09-16 · Amplitude project `858835` · 설계 버전 `v1`
> 계측 계약: [`saju-amplitude-taxonomy.md`](saju-amplitude-taxonomy.md) · [`front/src/shared/analytics/events.ts`](../../front/src/shared/analytics/events.ts)

---

## 0. 이 문서가 답하는 질문

> **"북극성 지표 하나를 올리려면, 오늘 무엇을 건드려야 하는가?"**

택소노미가 "어디서 새는지 볼 수 있게" 만들었다면, 이 문서는 **그 숫자들을 위계로 묶어
한 칸을 올렸을 때 맨 위가 얼마나 움직이는지를 계산으로 내놓는다.** 지표 목록이 목적이
아니다 — 곱해서 북극성이 되지 않는 지표는 여기 싣지 않는다.

---

## 1. 구조: 두 프레임워크를 겹친다

| 축 | 프레임워크 | 이 축이 정하는 것 |
|---|---|---|
| 세로 | **Metric Hierarchy** (Level 1 → Focus 구성요소 → Input) | 무엇이 무엇을 움직이는가 |
| 가로 | **AARRR** (유저 여정) | 어느 칸이 누구의 일인가 |

둘 중 하나만 쓰면 이렇게 무너진다.

- **AARRR 만** — 다섯 칸이 더해지지 않는다. Acquisition 이 올라도 북극성이 몇 % 움직이는지
  계산이 안 나오고, "다섯 칸을 동시에 개선하자" 외의 결론이 안 나온다.
- **Hierarchy 만** — 계산은 맞는데 담당이 안 붙는다. "티저 도달률"이 유입 문제인지 입력 폼
  문제인지 지표 이름만으로는 갈리지 않는다.

겹치면 **L2 다섯 칸의 곱이 정확히 L1** 이고, 각 칸에 AARRR 단계가 하나씩 붙는다.

---

## 2. Level 1 — 북극성 지표

### 월간 **읽힌** 유료 리포트 수

`saju_report_viewed` 중 `report_tier = paid` 인 이벤트의 월간 고유 건수.

**왜 매출이 아닌가.** 단가가 1,000원으로 고정이다(`saju_report_price: int = 1000`).
매출은 결제 건수를 원 단위로 바꿔 쓴 것뿐이고, 같은 정보를 두 칸에 두면 하이라키가 한 층
낭비된다. 매출(₩)은 `L1 × 1,000` 의 **파생 후행지표**로 옆에 둔다.

**왜 결제가 아니라 열람인가.** 리포트 생성이 비동기 잡이라 승인과 열람 사이에 실제로 사람이
샌다(대기·실패). 결제만 하고 못 읽은 사람은 재구매도 추천도 하지 않는다. 택소노미가 최종
전환(★)을 열람으로 잡은 것과 같은 판단이다.

**매출 인식 시점은 따로 산다.** `saju_payment_confirmed` 가 Amplitude Revenue 로 들고 있어,
회계 숫자와 제품 판단이 서로를 오염시키지 않는다.

---

## 3. Level 2 — Focus 구성요소 (MECE · 곱셈 분해)

```
월간 읽힌 유료 리포트
  = ① 진입 디바이스 수
  × ② 티저 도달률
  × ③ 결제 전환율
  × ④ 열람 완료율
  × ⑤ 구매 반복 계수
```

| # | AARRR | 지표 | 계산식 |
|---|---|---|---|
| ① | Acquisition | 진입 디바이스 수 | `saju_entry_viewed` 의 unique device |
| ② | Activation | 티저 도달률 | `saju_teaser_viewed ÷ saju_entry_viewed` |
| ③ | Revenue | 결제 전환율 | `saju_payment_confirmed ÷ saju_teaser_viewed` |
| ④ | Delivery | 열람 완료율 | `saju_report_viewed(paid) ÷ saju_payment_confirmed` |
| ⑤ | Retention | 구매 반복 계수 | `결제 건수 ÷ 구매 디바이스 수` |

### 왜 Referral 에 독립 칸을 주지 않았나

이 제품에서 공유는 **새 진입을 만드는 행동**이고, 그 결과는 `root_path = share` 로 ①에 이미
합류한다. 칸을 따로 세우면 같은 사람을 두 번 센다. 공유 자체는 ⑤의 Input 으로 내렸다.

### 왜 Delivery 라는 칸이 AARRR 에 없는데 있나

AARRR 그대로 다섯 칸을 쓰면 ④가 Revenue 안에 숨는다. 그런데 이 제품은 **결제와 가치 전달
사이에 비동기 잡이 끼는 구조**라 그 구간이 실측 대상이다. 프레임워크에 맞추려고 실재하는
이탈 구간을 지우지 않는다.

---

## 4. Level 3 — Input 지표 (선행지표)

`●` 수집 중 · `○` 정의됐으나 미발생 · `✕` Amplitude 밖

### ① 진입 디바이스 수

| | 지표 | 근거 |
|---|---|---|
| ● | 채널별 진입 수 | 오토캡처 attribution (`utm_*` · referrer) |
| ● | 소개 웹툰 경유 비율 | `root_path = intro` |
| ● | 공유 경유 진입 비율 | `root_path = share` |
| ✕ | 채널별 CAC | 광고비 ÷ 진입 — 광고비는 Amplitude 가 모른다. UTM 규칙 시트 병행 |

### ② 티저 도달률

| | 지표 | 근거 |
|---|---|---|
| ● | 생년월일 제출률 | `saju_birth_submitted ÷ saju_entry_viewed` |
| ● | 계산 성공률 | `saju_chart_calculated ÷ saju_birth_submitted` |
| ○ | 계산 실패율 | `saju_chart_failed` |
| ● | 시간 모름 세그먼트 제출률 | `is_time_unknown = true` — 시간을 모르는 사람이 더 이탈하는지가 실제 가설이다 |
| ● | 진입 → 티저 소요시간 | Time to convert 중앙값. 평균은 아웃라이어에 끌려간다 |

### ③ 결제 전환율

| | 지표 | 근거 |
|---|---|---|
| ● | CTA 클릭률 | `saju_purchase_clicked ÷ saju_teaser_viewed` |
| ● | 결제창 진입률 | `saju_checkout_opened ÷ saju_purchase_clicked` |
| ● | 승인률 | `saju_payment_confirmed ÷ saju_checkout_opened` |
| ○ | 결제 실패율 | `saju_payment_failed` |
| ● | 일간·오행별 결제 전환율 | 퍼널 Holding Constant: `day_master` · `dominant_element` |

### ④ 열람 완료율

| | 지표 | 근거 |
|---|---|---|
| ● | 리포트 생성시간 p50 / p90 | `saju_report_viewed.generation_ms` |
| ● | 생성·조회 실패율 | `saju_report_failed` |
| ● | 승인 → 열람 소요시간 | Time to convert 중앙값 |
| ○ | 만료 토큰 접근 수 | `saju_expired_report_opened` (Phase 2) — 보관 30일(`saju_order_retention_days`) |

### ⑤ 구매 반복 계수

| | 지표 | 근거 |
|---|---|---|
| ● | D30 재구매 리텐션 | 6절 정의 |
| ● | 추가질문 소진율 | `turn_index = 3 AND remaining_after = 0` (파생) |
| ● | 재열람률 | `saju_report_reopened ÷ saju_report_viewed` |
| ○ | 추가질문 실패율 | `saju_followup_failed` — 유료 사용자가 산 슬롯을 잃는 자리 |
| ● | 공유 클릭률 | `saju_site_shared ÷ saju_report_viewed` → ①로 회수 |

---

## 5. 지금 측정 가능한가 — 2026-09-16 확인

Amplitude project `858835` 에서 직접 확인한 결과다.

**들어오고 있는 사주 이벤트 (13종)**
`saju_entry_viewed` `saju_birth_submitted` `saju_chart_calculated` `saju_teaser_viewed`
`saju_purchase_clicked` `saju_checkout_opened` `saju_payment_confirmed` `saju_report_viewed`
`saju_report_failed` `saju_report_reopened` `saju_followup_asked` `saju_followup_answered`
`saju_site_shared` (+ Revenue · 오토캡처 page view · session)

**아직 발생 전 (정의는 됨)**
`saju_chart_failed` `saju_payment_failed` `saju_followup_failed` — 전부 실패 경로다.
발생이 없는 것이지 계측이 빠진 것이 아니다. Phase 2 3종은 아직 구현 전.

**정리해야 할 것**
`Viewed Home Page` 가 아직 들어온다(최근 2026-09-14). 오토캡처 page view 와 중복이라
택소노미 8절이 제거하기로 한 SDK 설치 검증용 잔재다.

---

## 6. 리텐션 정의

리텐션 강의가 요구하는 세 조건 — **주요 이벤트 · 제품 사용 간격 · 측정 기준** — 에 대한 답이다.

| 조건 | 이 서비스의 답 | 근거 |
|---|---|---|
| Critical Event | `saju_payment_confirmed` | "앱을 열고 목록을 조회하면 리텐션된 것일까"와 같은 자리다. 재진입·재계산은 **유지되었으나 비즈니스에 무의미**하다 — 사주 계산은 무료이고 LLM 원가만 쓴다 |
| Product Usage Interval | 비정기 · 월~분기 | 본인 사주를 매일 다시 보지 않는다. 다만 **한 기기로 배우자·자녀·친구 사주를 대신 보는 행태가 지배적**이라 재구매가 불규칙하게 발생한다. 여행·커머스형에 가깝다 |
| Measurement Basis | **Unbounded (Return On or After)** · Day 7 or after · Day 30 or after | Classic Day N 은 이 사용 간격에서 거의 0 이 나와 개선 여부를 못 읽는다. Unbounded 는 이탈률의 역수라 "한 번 사고 다시는 안 온 사람"을 정확히 센다 |
| 보조 리텐션 | **Bracket (Range)** · Day 0–1 · start `saju_report_viewed` → return `saju_followup_answered` | 열람 직후 추가질문 3개를 쓰는 리듬이 이 제품의 가치 소비 구간이다. 여기가 죽으면 ⑤가 먼저 무너진다 |

> **지금은 리텐션 차트를 신뢰하지 않는다.** 사주 이벤트 수집은 2026-09-14 에 시작됐다.
> Day 30 코호트가 한 줄이라도 완성되려면 10월 중순까지 기다려야 한다. 그 전까지 ⑤는
> **추정치가 아니라 공란**으로 둔다. 빈칸은 읽는 사람이 알아서 무시하지만, 두 줄짜리 코호트로
> 그린 곡선은 믿어 버린다.

---

## 7. Aha moment 가설

**가설** — 이 제품의 아하 순간은 리포트를 **연 순간이 아니라, 자기 질문에 답을 받은 순간**이다.
추가질문은 리포트당 최대 3개, 프리셋 8종 + 자유입력이다.

**검증**

| | |
|---|---|
| 코호트 A | `saju_followup_answered` ≥ 1 |
| 코호트 B | 열람했으나 추가질문 0 |
| 비교 지표 | 30일 재구매율 · 공유 클릭률 |

**판정 기준** — A 가 B 의 2배 이상이면 Activation 정의를 "리포트 열람"에서 "추가질문 1회
응답"으로 옮기고, 리포트 상단에서 첫 질문을 먼저 던지게 만든다. 강의의 찜하기 예시와 같은
구조다 — 구매와 상관도가 높은 행동을 찾아, 그 행동을 유도하는 기획으로 되돌린다.

---

## 8. 가드레일 — 북극성을 올리다 망가뜨리면 안 되는 것

### 8.1 LLM 원가는 가드레일이 아니다 (실측으로 기각)

`[Agent] AI Response` 를 에이전트별로 쪼개 확인한 값이다. 2026-09-15, 비용이 기록된 유일한 날.

| Agent | 호출 | 비용 USD | 1건당 |
|---|---|---|---|
| `saju-report` | 6 | $0.030178 | **$0.005030 ≈ ₩7.0** |
| `decision` · `economist` · `journalist` · `analyst` (주식 1회 분석) | 4 | $0.006750 | ₩9.5 / 매출 0 |
| 합계 | 10 | $0.036928 | |

**총액 $0.0369 를 사주 원가로 읽으면 안 된다.** 그중 $0.00675 는 주식 멀티에이전트가 쓴
것이고 주식에는 매출이 없다. 같은 이벤트에 두 제품이 섞여 들어오므로 원가는 **반드시
`[Agent] Agent ID` 로 갈라서** 본다.

1건 손익 (액면 1,000원, 최악 가정 — 추가질문 3개 전부 소진 + 정책 재생성 1회):

```
실매출(VAT 내재)      909
PG 카드 수수료 ~3.2%  − 32
LLM 리포트 생성       −  7   ← 실측
추가질문 3개          − 21   ← 리포트와 동일 단가로 보수 가정
정책 재생성 1회       −  7
──────────────────────────
기여마진              842   (액면 대비 84%)
```

LLM 원가는 액면가의 **0.7%(기본) ~ 3.5%(최악)** 다. 전환율을 올려서 LLM 원가 때문에 손해가
나는 구간은 **없다.** 초안은 이 자리에 "팔수록 손해가 나는 구간이 실재한다"고 적었는데,
측정하지 않고 쓴 문장이었고 실측이 기각했다.

### 8.2 진짜 가드레일은 CAC 다

기여마진 842원이 곧 **CAC 상한**이다. 재구매가 0이면 `LTV = 842` 이고, `LTV / CAC ≥ 3` 은
`CAC ≤ 281원` 을 뜻한다.

구매 1건당 광고비는 `CPC ÷ (진입→결제 전환율)` 이다. CPC 500원에 전환율 2% 면 구매당
**25,000원** — 기여마진의 30배다. 이 구조에서 `LTV/CAC ≥ 3` 을 만족시키려면 진입→결제
전환율이 178% 여야 하므로, **지금 단가로는 유료 광고가 수학적으로 성립하지 않는다.**

| 분류 | 지표 | 임계값 |
|---|---|---|
| **CAC** | 구매 1건당 광고비 | ≤ 281원 (재구매 0 기준) |
| 단가·LTV | 기여마진 × (1 + 구매 반복 계수) | CAC 상한을 올리는 유일한 레버 |
| 원가 | `saju-report` 1건당 USD | 급변 시에만 본다. 절대액은 무시해도 되는 크기 |
| 품질 | 리포트 생성 p90 · 결제 승인 실패율 · 열람 실패율 · 추가질문 정책 거절(`refused`) 비율 | |

따라서 초기 성장은 **오가닉과 공유**(`root_path = share`)에 기대야 한다. 유료 광고를 켜려면
그 전에 객단가를 올리거나 ⑤ 구매 반복 계수를 만들어 LTV 를 키워야 한다 — 9절 3번이
말하는 것이 이것이다.

### 8.3 지금 프로덕션 원가는 보이지 않는다

`deploy/env.yaml` 은 `GEMINI_MODEL: gemini-3-flash-preview` 인데, **그 모델 호출에는
`Cost USD` 가 기록되지 않는다** (09-14 의 4건 전부 0). 프리뷰 모델이라 가격표에 없다.
비용이 찍힌 09-15 호출은 전부 `gemini-2.5-flash` — 로컬 개발 환경 값이다.

같은 토큰을 프로덕션 단가($0.5 / $3)로 환산하면 1건 ₩9.4 수준이라 8.1 의 결론은 바뀌지
않는다. 다만 **대시보드로 실서버 원가를 보려면** 가격표에 있는 정식 모델로 내리거나,
토큰 수(`[Agent] Total Tokens`)에 단가를 곱하는 계산을 따로 둬야 한다.

④ 열람 완료율이 떨어지는 날은 거의 항상 품질 네 지표 중 하나가 먼저 움직인다.

---

## 9. 이 구조를 쓰려면 먼저 할 세 가지

1. **대시보드를 L2 다섯 칸으로 만든다.** 차트 5개 + 상단 L1 1개. AARRR 다섯 탭으로 나누지
   않는다 — 곱셈이 한 화면에 보여야 한 칸을 올렸을 때의 효과가 읽힌다.
2. **`Viewed Home Page` 를 제거한다.** 5절 참조.
3. **광고를 켜기 전에 ②③④의 기준선을 먼저 잡는다.** ①만 올리면 새는 칸으로 더 많은 사람을
   밀어 넣는 것이 된다 — "퍼널 앞단부터 개선" 과 정확히 반대 방향이다.

---

## 10. 주식 서비스가 합류할 때

주식은 현재 개발 전용이고 매출 경로가 없다. 합류하면 **이 하이라키를 확장하지 않고 하나 더
만든다** — 북극성이 다르기 때문이다(사주는 건당 판매, 주식은 반복 조회). 두 서비스를 합쳐
볼 때는 택소노미 8절대로 `saju_` / `stock_` 접두사로 갈린 이벤트를 Custom Event 로 묶는다.
