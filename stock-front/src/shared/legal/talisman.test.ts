import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TALISMAN_DELIVERY_NOTE,
  TALISMAN_DOWNLOAD_DAYS,
  TALISMAN_EFFICACY_NOTICE,
  TALISMAN_PRICE,
  TALISMAN_REFUND_LIMIT,
} from "./talisman.ts";

// 백엔드 `talisman_price` · `talisman_download_days` 와 같은 값이어야 한다.
// 백엔드 테스트가 이 파일을 직접 읽어 대조한다(`test_talisman_orders.py`).
test("표시용 가격과 다운로드 기간", () => {
  assert.equal(TALISMAN_PRICE, 3000);
  assert.equal(TALISMAN_DOWNLOAD_DAYS, 7);
});

// 일회 다운로드다. 구매 전에 그 사실이 보여야 한다 — 두 번 받을 수 있다고 믿고 산
// 사람에게는 그것이 거래조건이다.
test("제공 시점 문장은 한 번만 받을 수 있다고 말한다", () => {
  assert.match(TALISMAN_DELIVERY_NOTE, /한 번만/);
  assert.match(TALISMAN_DELIVERY_NOTE, new RegExp(`${TALISMAN_DOWNLOAD_DAYS}일 안에`));
});

// 효능을 단정하면 표시광고법상 허위·과장 광고가 된다. 카드와 약관이 이 문장을 쓴다.
test("효능 고지는 효과를 보장하지 않는다고 말한다", () => {
  assert.match(TALISMAN_EFFICACY_NOTICE, /보장하지 않습니다/);
});

// 전자상거래법 제17조 제6항 — 환불 제한 사실이 구매 전에 보여야 제한이 선다.
test("환불 제한 문장은 기준 시점(원본을 받을 수 있게 된 때)을 밝힌다", () => {
  assert.match(TALISMAN_REFUND_LIMIT, /받을 수 있게 된 뒤/);
});
