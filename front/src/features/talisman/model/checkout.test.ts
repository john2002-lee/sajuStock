import assert from "node:assert/strict";
import { test } from "node:test";

import {
  downloadPath,
  filenameFromDisposition,
  formatKstDateTime,
  orderPath,
  parseConfirmParams,
} from "./checkout.ts";

const params = (q: string) => new URLSearchParams(q);

test("토스 성공 리다이렉트 값을 승인 요청으로 옮긴다", () => {
  assert.deepEqual(parseConfirmParams(params("paymentKey=pk&orderId=o1&amount=3000")), {
    payment_key: "pk",
    order_id: "o1",
    amount: 3000,
  });
});

test("값이 빠졌거나 금액이 숫자가 아니면 승인하지 않는다", () => {
  assert.equal(parseConfirmParams(params("orderId=o1&amount=3000")), null);
  assert.equal(parseConfirmParams(params("paymentKey=pk&orderId=o1")), null);
  assert.equal(parseConfirmParams(params("paymentKey=pk&orderId=o1&amount=3천")), null);
  assert.equal(parseConfirmParams(params("paymentKey=pk&orderId=o1&amount=-1")), null);
});

test("토큰은 경로에 인코딩되어 들어간다", () => {
  assert.equal(orderPath("a/b"), "/talisman/orders/a%2Fb");
  assert.equal(downloadPath("a/b"), "/api/talismans/orders/a%2Fb/download");
});

test("저장할 파일 이름은 백엔드가 정한 이름을 쓴다", () => {
  assert.equal(
    filenameFromDisposition('attachment; filename="talisman-silver.png"', "x.png"),
    "talisman-silver.png",
  );
});

test("이름이 없거나 경로처럼 생겼으면 기본 이름을 쓴다", () => {
  assert.equal(filenameFromDisposition(null, "talisman.png"), "talisman.png");
  assert.equal(filenameFromDisposition("attachment", "talisman.png"), "talisman.png");
  assert.equal(
    filenameFromDisposition('attachment; filename="../evil.png"', "talisman.png"),
    "talisman.png",
  );
});

test("만료 시각은 한국 시간으로 적는다", () => {
  assert.equal(formatKstDateTime("2026-10-27T03:00:00Z"), "2026년 10월 27일 12:00");
});
