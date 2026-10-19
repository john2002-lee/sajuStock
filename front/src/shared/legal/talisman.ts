/**
 * 디지털 부적을 **파는 사람이 사기 전에 밝혀야 하는 것.** 카드·약관·환불정책이 이
 * 파일 하나를 쓴다 — `product.ts`(사주 리포트)와 같은 자리, 같은 이유다.
 *
 * ## 가격은 서버가 정한다
 *
 * 결제 금액은 백엔드 `talisman_price` 가 정하고 승인 때 다시 대조한다. 여기 값은
 * **화면에 적는 표시용**이며, 백엔드 테스트가 이 파일을 읽어 둘이 같은지 본다
 * (`back/tests/test_talisman_orders.py`).
 */

export interface TalismanProduct {
  readonly id: string;
  /** 화면의 상품명이자 토스 주문명. 백엔드 `domain/talisman/catalog.py` 와 같아야 한다. */
  readonly name: string;
  readonly description: string;
}

/**
 * 파는 부적. 순서가 곧 진열 순서다. 약관이 이 목록을 그대로 적으므로 `features/`
 * 가 아니라 여기 둔다(`product.ts` 머리말 — 약관이 feature 를 import 하면 feature 를
 * 접을 때 약관이 딸려 죽는다).
 */
//
// 설명은 효과를 **단정하지 않는다**("잘 되는"·"막아 주는" 이 아니라 "~를 비는").
// 효능 단정은 표시광고법상 과장 광고다. `catalog.test.ts` 가 이 형식을 지킨다.
export const TALISMAN_PRODUCTS: readonly TalismanProduct[] = [
  {
    id: "jinheung",
    name: "진흥부적",
    description: "만사형통(萬事亨通) — 하시는 모든 일이 막힘없이 풀리기를 비는 부적",
  },
  {
    id: "heukgeum",
    name: "흑금수호인장",
    description: "벽사수호(辟邪守護) — 액운과 삿된 기운을 물리고 평안을 비는 수호 인장",
  },
  {
    id: "silver",
    name: "실버수호창",
    description: "무병강녕(無病康寧) — 어르신의 액운을 물리고 건강과 평안을 비는 부적",
  },
];

/** 표시용 가격(원, 부가세 포함). 백엔드 `talisman_price` 와 같아야 한다. */
export const TALISMAN_PRICE = 3000;

/**
 * 결제 승인 뒤 원본을 받을 수 있는 기간(일). 백엔드 `talisman_download_days`.
 * **이 안에 한 번만** 받는다(일회 다운로드).
 */
export const TALISMAN_DOWNLOAD_DAYS = 7;

/** 무엇을 받는가. */
export const TALISMAN_FORMAT_NOTE = "PNG 이미지 한 장 (511×1024)";

/** 언제 받는가. */
export const TALISMAN_DELIVERY_NOTE = `결제 승인 즉시 원본을 내려받을 수 있으며, 결제 후 ${TALISMAN_DOWNLOAD_DAYS}일 안에 한 번만 받으실 수 있습니다.`;

/**
 * 효능 고지. 부적의 효과를 단정하면 표시광고법상 허위·과장 광고가 된다 — 파는 것은
 * **기원을 담은 그림**이지 결과가 아니다.
 */
export const TALISMAN_EFFICACY_NOTICE =
  "기원을 담은 소장용 디지털 이미지이며, 특정한 효과나 결과를 보장하지 않습니다.";

/** 이용 범위. 개인 소장용이다. */
export const TALISMAN_LICENSE_NOTE =
  "개인 소장 용도로만 쓰실 수 있으며, 재배포·판매 등 상업적 이용은 할 수 없습니다.";

/**
 * 환불 제한 — 전자상거래법 제17조 제2항 제5호·제6항. **구매 버튼 가까이 보여야**
 * 제한이 선다(`PurchaseCard` 머리말). 결제 전 견본 미리보기가 시행령 제21조의2 의
 * 시험 사용 조치다.
 */
export const TALISMAN_REFUND_LIMIT =
  "디지털 콘텐츠라 원본을 받을 수 있게 된 뒤에는 환불되지 않습니다. 결제 전에 견본을 확인해 주세요.";
