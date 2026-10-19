# 컨텍스트

Last Updated: 2026-10-19

## 확정된 결정 (사용자)
- 디자인 **B안**(로또 섹션과 같은 2단 목록형), 위치 = 사주 입력 다음·로또 앞
- 실버수호참 → **실버수호창**. 설명(사용자 요청으로 격 올림, 효능 단정 금지): 만사형통·벽사수호·무병강녕 — `shared/legal/talisman.ts`
- 가격 **각 3,000원** (처음 1,000원 → 사용자가 3,000원으로 변경)
- 원본은 **운영 DB(bytea)** 에 저장 — 저장소가 PUBLIC 이라 git 에 원본 금지
- 원본 = 시안 크롭 511×1024, 보관 위치 `C:/AIOT21/talisman-originals/` (저장소 밖). 교체는 업로드 스크립트로
- ~~재다운로드 7일~~ → **결제 후 7일 안에 1회만 다운로드** (사용자 변경). 받는 도중 실패하면 사람이 `talisman_orders.downloaded_at` 을 NULL 로 되돌려 재허용
- 미리보기 = 저해상도 + "견본" 워터마크, `front/public/talismans/` 만 git 에 들어감

## 상품
| id | 이름 | 시안 위치 | 크롭 x 범위 |
|---|---|---|---|
| jinheung | 진흥부적 | 왼쪽 적색 | 0–511 |
| heukgeum | 흑금수호인장 | 가운데 흑금 | 513–1023 |
| silver | 실버수호창 | 오른쪽 은색 | 1025–1536 |

시안 원본: `C:\Users\lenovo\AppData\Local\Temp\claude\C--AIOT21\b4a5d7d4-5aa4-4bd2-979e-b663dfc62ff5\images\3.webp` (1536×1024)

## 재사용하는 기존 코드
| 파일 | 무엇 |
|---|---|
| `back/app/integrations/payment/toss.py` | `TossPaymentsProvider` (confirm, ambiguous) |
| `back/app/services/saju_order_service.py` | 승인 분기 패턴 (금액 대조·멱등·needs_attention) |
| `back/app/repositories/saju_order.py` | `new_order_id`, `derive_access_token`, `hash_access_token` |
| `back/tests/test_saju_orders.py` | 가짜 저장소 + 가짜 Toss 테스트 패턴 |
| `front/src/features/saju/components/PayButton.tsx` | Toss SDK 리다이렉트 결제 |
| `front/src/features/saju/components/PaySuccessScreen.tsx` | 승인 화면 |
| `front/src/features/saju/components/PurchaseCard.tsx` | 구매 전 고지 + 동의 체크 |

## 제약
- 사주와 로직 결합 금지 → `talisman` 독립 모듈
- 운영 DB 를 로컬에서 건드리지 않는다 (back/.env DATABASE_URL = 운영)
- `git add -A` 금지 (env.download), 커밋 영어·attribution 없음, CRLF 유지
- 배포는 사용자 승인 후 + 운영 DB 에 원본 업로드 1회
