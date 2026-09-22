# 토스페이먼츠 결제 복구 + PG 심사용 페이지 정비

## Context

두 가지 요청이 들어왔고, 목적이 하나다 — **토스페이먼츠 심사를 통과하고 판매를 시작하는 것**.

1. "전에 토스페이먼츠 결제되는 것을 분기해서 안 되게 했는데 다시 되게 살려주세요"
2. `사주풀이서비스_사이트기본페이지_자료.docx` 의 내용을 사이트에 반영

### 지금 무슨 일이 벌어지고 있나 (확인한 사실)

**결제를 막는 것은 설정이 아니라 무료 이벤트 분기다.**
`features/saju/model/event.ts` 의 `isFreeEvent(now)` 가 KST 2026-09-18~09-30 사이에 `true` 를
돌려주고, 오늘(9/21)이 그 안이다. 서버 컴포넌트가 **서버 시각으로** 판정해 prop 으로
내려보내고(`app/(saju)/page.tsx:52`, `saju/teaser/page.tsx:31`), `PayButton.tsx:86-98` 이
그 값을 보고 주문 생성도 토스 결제창도 건너뛴 채 `/saju/report` 로 보낸다.

**백엔드는 이미 준비돼 있다.** 프로덕션 `GET /api/saju/payment-config` 가
`{"enabled":true,"price":1000,"retention_days":30}` 를 돌려준다. 고칠 곳은 프런트뿐이다.

**프로덕션은 테스트 키로 돌고 있다.** 배포된 번들에 `test_ck_nRQoOa…`, 백엔드 `.env` 에
`TOSS_SECRET_KEY=test_sk…`. 즉 지금 결제를 살려도 **실제 돈은 움직이지 않는다** —
소유자가 요청한 "결제는 테스트 용도입니다" 문구는 사실이다. 베타 테스트 주문 70건도
이것으로 설명된다.

### ⚠ 결제를 살려도 아무도 결제하지 않는다 — 먼저 막아야 할 구멍

`/saju/report` 와 `POST /api/saju/report` 에는 **결제 확인도 인증도 없다.** 생년월일을
넣은 사람이 주소창에 `/saju/report` 를 치면 유료 상품인 전체 풀이가 그대로 나온다.
무료 이벤트 분기가 보내는 곳도 정확히 여기다.

이 구멍을 열어 둔 채 결제 버튼만 되살리면 **결제는 장식이 된다.** 요청 1번이
실질적으로 이행되려면 이 경로가 함께 닫혀야 하므로 계획에 포함한다.

### 첨부 문서와 현실의 차이

문서는 범용 초안이라 우리 서비스와 어긋나는 대목이 있다. **베끼지 않고 참고한다.**

| 문서 | 우리 현실 |
|---|---|
| 회원/비회원, 이름·이메일·휴대전화 수집 | 회원가입이 없고 연락처를 받지 않는다 (생년월일시·성별·출생지뿐) |
| 상품 4개 (기본/상세/궁합/상담형) | 1,000원 정밀 리포트 하나 — 소유자 확정 |
| 상담형 = 사람이 작성 | 없다. 전부 자동 생성 |

없는 상품을 가격표에 올리면 PG 심사에서 "제공되지 않는 상품"으로 걸린다.

### 확정된 결정 (소유자)

- 무료 이벤트를 끄고 결제를 되살린다. 팝업에는 **"결제는 테스트 용도입니다. 실제 돈이
  결제되지 않습니다."** 를 넣는다.
- 사업자 정보 실제 값은 아직 없다 → **환경변수로 분리만** 한다.
- 상품은 현재 1개 그대로.
- 문의 채널은 **maverock@daum.net** 이메일.

---

## 설계 원칙 — 신호는 스스로 은퇴해야 한다

이 저장소에 이미 있는 패턴이다: `resolveSupportEmail` 은 프로덕션 빌드에서 예약
도메인을 떨어뜨리고(`lib/config/public.ts:40-46`), "천원의 행복" 배지는 가격이 실제로
1,000원일 때만 붙는다(`TeaserView.tsx:235`). **화면이 거짓을 말할 수 없게 값에서
파생시키는** 방식이다.

두 곳에 그대로 적용한다.

1. **테스트 결제 고지는 키 접두사에서 파생한다.** `NEXT_PUBLIC_TOSS_CLIENT_KEY` 가
   `test_` 로 시작하면 테스트 모드. 라이브 키를 넣는 순간 고지가 저절로 사라진다.
   손으로 내리는 플래그를 두면 키만 바꾸고 문구를 못 내려서 **돈을 받으면서 "실제
   결제되지 않습니다" 라고 말하는** 상태가 만들어진다.

2. **`IS_PLACEHOLDER` 를 손 플래그에서 파생값으로 바꾼다.** 필수 사업자 정보 환경변수가
   비어 있으면 임시값, 채워지면 자동으로 임시값 고지가 내려간다. 지금은 `true` 로 박혀
   있고, 파일 주석은 "테스트가 그 대응을 강제한다" 고 적고 있지만 **그 테스트는 없다.**
   이번에 실제로 쓴다.

---

## 작업

`node --test` 는 `src/**/*.test.ts` 만 본다 (`.tsx`·DOM 불가). 그래서 판단 로직은 전부
순수 `.ts` 모듈에 두고 화면은 그것을 그리기만 한다 — 기존 30개 테스트가 쓰는 방식 그대로.

### 1단계 — 결제 복구 (요청 1)

| 파일 | 변경 |
|---|---|
| `lib/config/payment-mode.ts` (신규) | `isTestPaymentKey(key)` — `test_` 접두사 판정. 고지 문구 상수 |
| `lib/config/payment-mode.test.ts` (신규) | 테스트/라이브/미설정 판정, 접두사 위조 케이스 |
| `features/saju/model/event.ts` | 무료 이벤트 종료. `isFreeEvent` 는 **남긴다** — 기간만 지나가게 두면 분기가 저절로 닫히고, 다음 이벤트 때 날짜만 바꾸면 된다 (파일 주석이 그렇게 설계했다고 적고 있다) |
| `features/saju/model/event.test.ts` | 종료 경계에 맞춰 수정 |
| `features/saju/components/EventPopup.tsx` | 무료 광고 → **테스트 결제 고지**로 교체. 켜는 근거를 날짜에서 테스트 모드로 바꾼다 |
| `features/saju/components/PayButton.tsx` | 테스트 모드일 때 버튼 아래 같은 고지 한 줄 |
| `features/saju/components/TeaserView.tsx` | 무료 취소선·"무료" 라벨 정리 |

**결제 복구를 실질화하는 구멍 막기:**

| 파일 | 변경 |
|---|---|
| `back/app/api/v1/endpoints/saju.py` | 무료로 유료 상품을 내주는 문은 **셋**이다 — `POST /saju/report`, `POST /saju/report/jobs`(화면이 실제로 쓰는 경로), `POST /saju/followup`. 하나만 막으면 우회로가 남는다. `saju_payment_enabled` 가 참이면 거부, 거짓이면 지금처럼 열어 둔다(키가 없는 개발 환경) |
| `back/tests/` | 결제가 켜진 설정에서 세 경로가 거부되는지, 꺼진 설정에서 열리는지 |

**프런트 변경이 필요 없다.** 유료 경로는 이미 완전히 갈라져 있다 —
`POST /payments/confirm` 이 승인 직후 서버 안에서 리포트를 만들어 저장하고 화면은
`GET /reports/{token}` 을 폴링한다. 위 세 경로를 **부르지 않는다.** 무료 계산
(`POST /chart`, 티저의 여덟 글자와 요약)은 그대로 열어 둔다 — 그것이 실제 무료 상품이다.

### 2단계 — 사업자 정보·문의처를 환경변수로 (문서 1·7·10절)

| 파일 | 변경 |
|---|---|
| `shared/legal/business.ts` | 값을 `NEXT_PUBLIC_BIZ_*` 에서 읽고, `IS_PLACEHOLDER` 를 **파생**으로. 전화번호·호스팅 제공자 추가 |
| `shared/legal/business.test.ts` (신규) | 파일 주석이 약속한 그 테스트 — 값이 채워졌는데 고지가 남거나 그 반대인 상태를 막는다 |
| `front/.env.deploy`, Vercel | `NEXT_PUBLIC_SUPPORT_EMAIL=maverock@daum.net` + `NEXT_PUBLIC_BIZ_*` 자리 |

`SUPPORT_EMAIL` 이 비어 있어서 지금 **이용약관과 개인정보처리방침에 "문의 이메일이 아직
설정되지 않았습니다" 라는 TODO 문구가 그대로 노출**되고 있고, 결제가 막힌 사람에게
전액 환불을 약속하는 화면(`PaySuccessScreen`, `PaidReportScreen`)에는 연락처가 한 줄도
없다. 이메일을 넣으면 다섯 자리가 한 번에 정상화된다.

### 3단계 — 법적 페이지 (문서 4·5·6·7절)

먼저 중복 제거: `Section` 이 `terms`/`privacy` 에 **똑같이 두 벌** 있고 사업자 정보 `<dl>`
블록도 두 벌이다. 페이지를 둘 더 붙이기 전에 뽑아낸다.

| 파일 | 변경 |
|---|---|
| `app/(legal)/_components/Section.tsx` (신규) | 두 벌을 하나로 |
| `app/(legal)/_components/BusinessInfoTable.tsx` (신규) | 사업자 정보 표 + 임시값 고지 |
| `shared/legal/refund.ts` (신규) | 환불 기준 데이터. 순수 `.ts` 라 테스트가 닿는다 |
| `app/(legal)/refund/page.tsx` (신규) | 환불정책. 약관 제6조·백엔드 `needs_attention` 문장과 **모순되지 않아야** 한다 |
| `app/(legal)/support/page.tsx` (신규) | 고객센터. maverock@daum.net, 문의 유형별 안내, 필수 기재 정보 |
| `app/(legal)/terms/page.tsx` | 제2조에서 주식 서비스와 "성향을 종목 판단에 결합" 삭제 — **그 방향은 접었고** 주식은 관리자 전용이다. 제3조 회원가입도 공개 상품에는 없다 |
| `features/saju/components/PaySuccessScreen.tsx`, `PaidReportScreen.tsx` | 환불 약속 옆에 `/support` 링크를 **조건 없이** |

### 4단계 — 구매 전 고지와 가격 노출 (문서 3·10절)

**심사관은 지금 가격을 볼 수 없다.** 가격이 나오는 유일한 화면 `/saju/teaser` 는
`noindex` 이고 생년월일을 넣어야 들어가진다. 그래서 공개 경로에 가격을 둔다.

| 파일 | 변경 |
|---|---|
| `app/(saju)/saju/intro/page.tsx` + `IntroStory.tsx` | 이미 무료/유료 구성을 `FREE[]`/`FULL[]` 로 갖고 있다. 여기에 **가격·제공 시점·보관 기간·환불 요약**을 붙인다. 상품 하나뿐이라 별도 `/pricing` 페이지는 과하다 |
| `features/saju/components/TeaserView.tsx` | 결제 **전에** 상품명·구성·가격·제공 시점·보관 기간 + `/refund`·`/terms` 링크. 지금은 보관 안내가 버튼 **뒤에** 있고 무료 기간엔 아예 없다 |
| `features/saju/components/PayButton.tsx` | 토스에 보내는 `orderName`("AI Of Tellers 정밀 사주 리포트")이 화면 어디에도 없다 → 상품명으로 노출 |

### 5단계 — 입력 화면 개인정보 고지 (문서 10절-3)

`BirthForm` 에는 수집 고지도 `/privacy` 링크도 없다. 있는 것은 두 필드의 용도 설명과,
**데스크톱에서만 보이는**(`lg:block`) "무료로 보는 동안은 저장하지 않습니다" 칩뿐이다.

| 파일 | 변경 |
|---|---|
| `features/saju/components/BirthForm.tsx` | 제출 버튼 근처에 수집 항목·목적·보관 + `/privacy` 링크. 모바일에서도 보이게 |

### 6단계 — 광고 표현 (문서 8절)

| 파일 | 변경 |
|---|---|
| `features/saju/components/SajuEntry.tsx:160` | `정확하게 읽습니다` — 정확성 주장. 문서가 금지 목록에 올린 유형 |
| `app/opengraph-image.tsx:101` | 같은 문구. **함께** 바꿔야 한다 |

`LottoSection.tsx:41-43` 이 로또에는 이미 이 규칙을 적어 뒀는데 사주 h1 에는 적용되지
않았다. 같은 규칙을 양쪽에 건다.

### 7단계 — 보관 기간 숫자 통일 + 미커밋 작업 정리

지금 **같은 페이지에 7일과 30일이 동시에 떠 있다.** `RETENTION_DAYS` 는 7인데
`Footer.tsx:88` 과 `IntroStory.tsx:172` 는 "30일" 을 박아 뒀다.

| 파일 | 변경 |
|---|---|
| `shared/components/layout/Footer.tsx` | 박힌 30일 → `RETENTION_DAYS`. 사업자 정보 블록과 `/refund`·`/support` 링크 추가 (문서 1·10절-1: 모든 페이지 하단) |
| `IntroStory.tsx:172` | 같은 처리 |
| Vercel | `NEXT_PUBLIC_SAJU_RETENTION_DAYS=7` (빌드 시점 인라인이라 반드시 배포 전에) |

이미 트리에 있는 미커밋 작업(개인정보처리방침 재작성, 보관 30→7, LLM 일시 오류 재시도,
파기 배치)도 이번 배포에 함께 나간다 — **7일로 줄이는 변경과 화면의 숫자는 갈라져서
배포되면 안 된다.**

---

## 검증

- `cd front && npm test` — 신규 3개 포함 전체 통과
- `cd back && python -m pytest tests/test_saju_*.py` — 결제 게이트 테스트 포함
  (`TEST_DATABASE_URL` 이 죽은 Supabase 를 가리켜 발생하는 기존 183건 실패는 이 변경과 무관)
- `npm run build` — `NEXT_PUBLIC_*` 는 빌드 시점 인라인이라 타입 통과만으로는 부족하다
- 브라우저(preview `front-dev`)로 실제 흐름:
  생년월일 입력 → 티저에서 **가격과 결제 버튼이 보이는지** → 결제 버튼 → 토스 결제창이
  뜨는지 → 테스트 카드로 승인 → 리포트 도달
- `/saju/report` 를 주소창에 직접 쳐서 **거부되는지**
- `/refund`, `/support`, `/terms`, `/privacy` 렌더 + 푸터 링크가 모든 화면에 뜨는지
- 팝업에 테스트 결제 고지가 뜨는지, 그리고 라이브 키를 넣은 빌드에서는 **사라지는지**

## 범위 밖 (이번에 하지 않음)

- **Cloud Run IAM 잠금** — 이전에 소유자가 보류시킨 건. 위 1단계의 결제 게이트가
  paywall 은 닫지만, 백엔드가 `allUsers` 로 열려 있는 것 자체는 그대로다
- 상품 추가(궁합·상담형) — 소유자가 1개 유지로 확정
- 실제 사업자 정보 값 — 발급 전. 환경변수 자리만 만든다
- 라이브 키 전환 — 심사 통과 후 별건

## 이 계획이 남기는 것

`dev/active/pg-review-pages/` 에 plan·context·tasks 세 파일을 만들어 진행 상황을 남긴다
(작업이 7단계라 컨텍스트가 끊겨도 이어갈 수 있어야 한다).
