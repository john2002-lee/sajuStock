# 부적 3종 판매 (각 3,000원 결제 → 원본 다운로드)

## Context
사주 메인(`/`)에 디지털 부적 이미지 3종을 진열하고, 각 3,000원 Toss 결제 후 원본을 내려받게 한다.
사주 리포트 결제(주문 생성 → Toss 리다이렉트 → 서버 승인 → 토큰 접근) 패턴을 그대로 따른다.
**저장소가 PUBLIC** 이라 원본은 git 에 절대 넣지 않는다 → 운영 DB 에 바이트로 저장(사용자 확정).

| 순서 | id | 이름 | 설명 |
|---|---|---|---|
| 1 적색 | `jinheung` | 진흥부적 | 모든 하는 일이 잘되기를 비는 부적 |
| 2 흑금 | `heukgeum` | 흑금수호인장 | 나쁜 일을 막아 주기를 비는 부적 |
| 3 은색 | `silver` | 실버수호창 | 어르신의 액운을 막아 주기를 비는 부적 |

사용자 확정: 원본=DB 저장 · 원본=시안 크롭(511×1024, 나중에 스크립트로 교체 가능) · 재다운로드 7일 · 미리보기=저해상도+"견본" 워터마크.
설계 원칙: 사주와 **로직 결합 금지**(로또와 같은 규칙) — 별도 `talisman` 모듈, 공유하는 것은 `TossPaymentsProvider` 와 결제 설정뿐.

## Backend (FastAPI) — TDD, 가짜 저장소 + 가짜 Toss (test_saju_orders.py 방식)
- `app/domain/talisman/catalog.py` — 3종 카탈로그(id·상품명=Toss orderName). 가격은 `settings.talisman_price = 3000` (코드 상수, saju_report_price 와 같은 규약).
- `app/models/talisman.py` — `TalismanOrderRow`(id, talisman_id, amount, currency, status pending|paid|needs_attention, attention_reason, idempotency_key, payment_key, access_token_hash, paid_at, created_at) / `TalismanAssetRow`(talisman_id PK, content bytea, media_type, filename, sha256, updated_at). 주문엔 **개인정보 없음**.
- alembic 마이그레이션 1개 (CI 배포가 `alembic upgrade head` 실행).
- `app/repositories/talisman.py` — `derive_access_token`/`hash_access_token`/`new_order_id` 는 `repositories/saju_order.py` 의 것을 재사용(import).
- `app/services/talisman_order_service.py` — `create_order(talisman_id)`, `confirm_payment(...)`(금액 서버 대조·멱등·ambiguous→needs_attention, saju 의 분기 그대로), `read_order(token)`, `download(token)`(paid + 결제 후 7일 이내만, 아니면 404/409/410).
  결제 on/off 는 `settings.saju_payment_enabled` 재사용(같은 키).
- `app/api/v1/endpoints/talismans.py` — `POST /talismans/orders`, `POST /talismans/payments/confirm`, `GET /talismans/orders/{token}`(상태·talisman_id·만료시각), `GET /talismans/orders/{token}/download`(바이너리, `Content-Disposition: attachment`, `Cache-Control: private, no-store`).
- `scripts/upload_talisman_assets.py` — 로컬 파일 경로를 인자로 받아 `talisman_assets` upsert (원본은 저장소 밖에 둠).

## Frontend (Next.js) — 로직은 `model/*.ts` 로 빼서 node --test
- `features/talisman/` (index.ts 배럴, `model/catalog.ts` 이름·설명·미리보기 경로, `model/download.ts` 만료 표시 등 순수함수 + 테스트)
- `components/TalismanSection.tsx` — 메인 `SajuEntry` 와 `LottoSection` 사이(또는 뒤, 시안 비교로 결정)에 3카드: 견본 이미지·이름·설명·3,000원(부가세 포함)·제공 시점(결제 즉시 다운로드)·7일 재다운로드·환불 제한 한 줄 + 동의 체크 → 구매 버튼. `PurchaseCard`/`PayButton` 구조를 따르되 사주 feature 를 import 하지 않음(공통 부분 `PillToggle` 등은 필요 시 `features/common` 이나 복제 최소화).
- BFF: `app/api/talismans/orders`, `payments/confirm`, `orders/[token]`, `orders/[token]/download`(백엔드 바이너리 스트리밍 프록시).
- 페이지: `(saju)/talisman/pay/success`(승인 후 `replace`), `(saju)/talisman/pay/fail`, `(saju)/talisman/orders/[token]`(noindex, 원본 표시 + 다운로드 버튼 + 만료일 안내).
- 미리보기: Pillow 스크립트로 폭 ~320px + 대각선 "견본" 반복 워터마크 webp 를 `front/public/talismans/` 에 생성(이것만 git 에 들어감).

## 법적 표시
- 약관 제1조(목적)·제2조(구성)에 디지털 부적 이미지 추가(상품명·가격·제공 방법·다운로드 기간·청약철회), 제5조·제6조 문구를 두 상품에 맞게. 시행일 갱신.
- 환불정책 "유료 상품은 정밀 사주 리포트 하나" → 두 상품, 부적 기준(다운로드 가능해진 뒤 환불 제한, 견본 미리보기 = 시행령 제21조의2 시험사용 조치) 추가.
- **효능 고지**: "기원을 담은 소장용 디지털 이미지이며 효과를 보장하지 않습니다" — 카드와 약관에(표시광고법상 효능 단정 회피). 개인 소장용, 재배포·상업 이용 금지.
- 상품 문구는 `shared/legal/talisman.ts` 한 곳에 두고 카드·약관·환불정책이 같이 씀(product.ts 규약).
- 개인정보처리방침: 부적 주문은 개인정보 미수집 → 변경 불필요 여부 확인만.

## 디자인 확인
B안 확정 (2단 목록형, 행 안에서 고지·동의·결제 펼침).

## Dev docs
`dev/active/talisman-shop/` 에 plan/context/tasks 생성.

## Verification
- `back`: `uv run pytest` (신규 테스트 포함), ruff.
- `front`: `npm test`, `npx tsc --noEmit`, `npm run lint`.
- 로컬 E2E: 백엔드는 **운영 DB 가 아닌 DB** 로 기동(`TEST_DATABASE_URL` 이 살아 있으면 그것, 아니면 로컬 docker Postgres; 둘 다 안 되면 그때 사용자에게 묻기) + 셸 GEMINI 변수 제거 → 마이그레이션 → 원본 업로드 → front dev → 브라우저에서 Toss 테스트 결제 → 다운로드 파일이 원본 sha256 과 일치, 미결제/위조 토큰은 다운로드 404 확인.
- 배포(main 푸시)는 사용자 승인 후. 배포 시 운영 DB 에 원본 업로드 스크립트 1회 실행 필요(사용자 승인).

## 남는 위험(보고만)
- Toss 가맹 심사 때 등록한 상품 외 품목 추가가 계약상 문제 없는지 사용자 확인 필요.
- 미리보기도 저해상도 사본이므로 완전한 유출 방지는 아님(의도된 수준).
