import assert from "node:assert/strict";
import { test } from "node:test";
import { redactProperties, redactUrl } from "./redact";

test("유료 리포트 토큰을 지운다 — 그 토큰이 곧 자격 증명이다", () => {
  assert.equal(
    redactUrl("https://aiot21.com/saju/reports/abc123DEF-_xyz"),
    "https://aiot21.com/saju/reports/[token]",
  );
  // 경로만 실리는 속성도 있다 (`[Amplitude] Page Path`).
  assert.equal(redactUrl("/saju/reports/abc123"), "/saju/reports/[token]");
  // 뒤에 질의·조각이 붙어도 토큰 조각만 지운다.
  assert.equal(
    redactUrl("/saju/reports/tok?utm_source=kakao#top"),
    "/saju/reports/[token]?utm_source=kakao#top",
  );
});

test("공유 링크의 id 를 지운다 — 남의 여덟 글자를 여는 포인터다", () => {
  assert.equal(
    redactUrl("https://aiot21.com/saju/s/x7Kq2mP9abcDEF-_"),
    "https://aiot21.com/saju/s/[share]",
  );
  // 경로만 실리는 속성도 있다 (`[Amplitude] Page Path`).
  assert.equal(redactUrl("/saju/s/abc123"), "/saju/s/[share]");
  // 뒤에 질의·조각이 붙어도 id 조각만 지운다 — 유입 분석은 살아야 한다.
  assert.equal(
    redactUrl("/saju/s/abc?utm_source=kakao#top"),
    "/saju/s/[share]?utm_source=kakao#top",
  );
  // 토큰 자리값과 **다른** 문자열이어야 한다. 콘솔에서 둘을 구분해야 한다.
  assert.notEqual(redactUrl("/saju/s/abc"), redactUrl("/saju/reports/abc"));
});

test("`/saju/s` 뒤에 id 가 없으면 손대지 않는다", () => {
  assert.equal(redactUrl("/saju/s"), "/saju/s");
  assert.equal(redactUrl("/saju/s/"), "/saju/s/");
});

test("토스가 돌려주는 결제 자격 증명을 지운다", () => {
  assert.equal(
    redactUrl("/saju/pay/success?paymentKey=tviva20240101&orderId=od_1&amount=9900"),
    "/saju/pay/success?paymentKey=[redacted]&orderId=[redacted]&amount=[redacted]",
  );
});

test("경로 모양은 남는다 — 페이지뷰 분석이 죽으면 안 된다", () => {
  const cleaned = redactUrl("https://aiot21.com/saju/reports/secret");
  assert.ok(cleaned.includes("/saju/reports/"));
  assert.ok(!cleaned.includes("secret"));
});

test("무해한 URL 은 손대지 않는다", () => {
  for (const url of [
    "https://aiot21.com/stocks/005930",
    "/dashboard",
    "https://aiot21.com/saju/teaser?utm_source=kakao",
  ]) {
    assert.equal(redactUrl(url), url);
  }
});

test("이벤트 속성에서 URL 을 담은 값을 지운다", () => {
  const props = {
    "[Amplitude] Page URL": "https://aiot21.com/saju/reports/tok",
    "[Amplitude] Page Path": "/saju/reports/tok",
    "[Amplitude] Page Title": "사주 리포트",
  };
  const out = redactProperties(props);
  assert.equal(out?.["[Amplitude] Page URL"], "https://aiot21.com/saju/reports/[token]");
  assert.equal(out?.["[Amplitude] Page Path"], "/saju/reports/[token]");
  // 제목은 URL 이 아니므로 그대로.
  assert.equal(out?.["[Amplitude] Page Title"], "사주 리포트");
});

test("이름을 모르는 속성이어도 값이 URL 이면 지운다 — 안전망", () => {
  const out = redactProperties({ some_future_prop: "/saju/reports/tok" });
  assert.equal(out?.some_future_prop, "/saju/reports/[token]");
});

test("원본을 고치지 않는다", () => {
  const props = { "[Amplitude] Page URL": "/saju/reports/tok" };
  const out = redactProperties(props);
  assert.equal(props["[Amplitude] Page URL"], "/saju/reports/tok");
  assert.notEqual(out, props);
});

test("지울 것이 없으면 같은 객체를 그대로 돌려준다", () => {
  const props = { "[Amplitude] Page URL": "/stocks/005930" };
  assert.equal(redactProperties(props), props);
});

test("undefined 를 그대로 통과시킨다", () => {
  assert.equal(redactProperties(undefined), undefined);
});

/**
 * 아래는 **하드 블록**을 지킨다.
 *
 * 위의 URL 리댁션은 값이 URL 처럼 보일 때만 동작한다. `birth_year: 1990` 은
 * URL 이 아니므로 그물을 그냥 통과한다 — 계측 코드가 실수 한 번만 하면
 * 생년월일시가 그대로 나간다. 택소노미 문서는 그 실수를 막지 못한다.
 */

test("생년월일시 관련 키는 값을 통째로 막는다", () => {
  const out = redactProperties({
    birth_year: 1990,
    birth_month: 3,
    birth_day: 14,
    birth_hour: 7,
    birth_minute: 20,
    day_master: "jia",
  });
  assert.equal(out?.birth_year, "[blocked]");
  assert.equal(out?.birth_month, "[blocked]");
  assert.equal(out?.birth_day, "[blocked]");
  assert.equal(out?.birth_hour, "[blocked]");
  assert.equal(out?.birth_minute, "[blocked]");
  // 일간 하나는 10분의 1로만 좁힌다 — 역산이 안 되므로 통과시킨다.
  assert.equal(out?.day_master, "jia");
});

test("이름을 모르는 birth_* 키도 막는다 — 접두사 규칙", () => {
  const out = redactProperties({ birth_timezone_offset: 540 });
  assert.equal(out?.birth_timezone_offset, "[blocked]");
});

test("네 기둥과 대운은 막는다 — 그 조합이 생년월일시로 역산된다", () => {
  const out = redactProperties({
    four_pillars: ["甲子", "丙寅", "戊辰", "庚午"],
    day_pillar: "戊辰",
    luck_cycle: 3,
  });
  assert.equal(out?.four_pillars, "[blocked]");
  assert.equal(out?.day_pillar, "[blocked]");
  assert.equal(out?.luck_cycle, "[blocked]");
});

test("출생지는 막고, 골랐는지 여부만 통과시킨다", () => {
  const out = redactProperties({
    birth_place_code: "SEOUL",
    birth_place_label: "서울",
    has_birth_place: true,
  });
  assert.equal(out?.birth_place_code, "[blocked]");
  assert.equal(out?.birth_place_label, "[blocked]");
  assert.equal(out?.has_birth_place, true);
});

test("자격 증명 키는 막는다 — 주소가 곧 열쇠인 화면이 있다", () => {
  const out = redactProperties({
    access_token: "tok_abc",
    orderId: "od_1",
    payment_key: "tviva_1",
    report_tier: "paid",
  });
  assert.equal(out?.access_token, "[blocked]");
  assert.equal(out?.orderId, "[blocked]");
  assert.equal(out?.payment_key, "[blocked]");
  // tier 는 token 이 아니다 — 부분 문자열 규칙이 과하게 먹으면 안 된다.
  assert.equal(out?.report_tier, "paid");
});

test("리포트 본문과 질문 원문은 막는다 — 길이만 보낸다", () => {
  const out = redactProperties({
    report_markdown: "## 어서 오시게…",
    question_text: "올해 이직해도 될까요",
    text_length: 11,
  });
  assert.equal(out?.report_markdown, "[blocked]");
  assert.equal(out?.question_text, "[blocked]");
  assert.equal(out?.text_length, 11);
});

test("대소문자를 가리지 않는다", () => {
  const out = redactProperties({ BIRTH_YEAR: 1990, PaymentKey: "x" });
  assert.equal(out?.BIRTH_YEAR, "[blocked]");
  assert.equal(out?.PaymentKey, "[blocked]");
});

test("막을 것이 없으면 같은 객체를 그대로 돌려준다", () => {
  const props = { day_master: "jia", turn_index: 1 };
  assert.equal(redactProperties(props), props);
});

test("유저 속성의 한 겹 안쪽까지 막는다 — identify 는 연산자로 감싸서 보낸다", () => {
  // `identify` 이벤트의 user_properties 는 `{ $set: { … }, $add: { … } }` 모양이다.
  // 겉만 훑으면 안쪽 키는 그물을 그냥 통과한다.
  const out = redactProperties({
    $set: { birth_year: 1990, is_payer: true },
    $add: { saju_chart_count: 1 },
  });

  assert.deepEqual(out?.$set, { birth_year: "[blocked]", is_payer: true });
  assert.deepEqual(out?.$add, { saju_chart_count: 1 });
});

test("중첩 안에 막을 것이 없으면 원본 그대로 둔다", () => {
  const props = { $add: { saju_chart_count: 1 } };
  assert.equal(redactProperties(props), props);
});

test("배열은 파고들지 않는다 — 키가 없으므로 막을 것도 없다", () => {
  const props = { report_tier_seen: ["free", "paid"] };
  assert.equal(redactProperties(props), props);
});
