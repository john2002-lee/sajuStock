import assert from "node:assert/strict";
import { test } from "node:test";

import { MINOR_CANCELLATION, REFUND_RULES, TALISMAN_REFUND_RULES } from "./refund";

// 약관 제5조의2 와 환불정책 표가 **같은 약속**을 해야 한다. 표에서 이 줄이 빠지면
// 약관은 취소권을 말하는데 환불정책은 침묵하는 상태가 된다.
test("환불 기준표가 미성년자 취소를 약관과 같은 문장으로 다룬다", () => {
  const rule = REFUND_RULES.find((r) => r.상황.includes("미성년자"));
  assert.ok(rule, "미성년자 항목이 환불 기준표에 없다");
  assert.equal(rule.처리, MINOR_CANCELLATION);
});

// 민법 제5조 — 법정대리인 동의 없는 결제는 **청약철회 제한과 무관하게** 취소된다.
// 그 사실이 빠지면 "리포트가 생성된 뒤에는 환불 불가" 와 충돌해 읽힌다.
test("미성년자 취소 문장은 콘텐츠 제공 여부와 관계없음을 밝힌다 — 리포트와 부적 둘 다", () => {
  assert.match(MINOR_CANCELLATION, /리포트 생성/);
  assert.match(MINOR_CANCELLATION, /부적 원본/);
  assert.match(MINOR_CANCELLATION, /제공 여부와 관계없이/);
});

// 부적에도 미성년자 취소권이 선다(민법 제5조). 약관 제6조가 그렇게 적는다.
test("부적 환불 기준표도 미성년자 취소를 같은 문장으로 다룬다", () => {
  const rule = TALISMAN_REFUND_RULES.find((r) => r.상황.includes("미성년자"));
  assert.ok(rule, "미성년자 항목이 부적 환불 기준표에 없다");
  assert.equal(rule.처리, MINOR_CANCELLATION);
});
