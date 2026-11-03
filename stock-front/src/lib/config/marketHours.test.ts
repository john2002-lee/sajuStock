import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isMarketOpen,
  marketCaptionSuffix,
  marketRevalidate,
  QUOTE_DELAY_NOTE,
  REVALIDATE_MARKET_CLOSED,
  REVALIDATE_MARKET_OPEN,
  toSeoulClock,
} from "./marketHours.ts";

/**
 * 시각은 전부 UTC 로 주입한다 — 이 테스트가 도는 머신의 타임존에 결과가
 * 흔들리면 안 된다. KST = UTC+9 이므로 UTC 00:00 = KST 09:00.
 *
 * 2026-07-27(월) ~ 2026-08-02(일) 한 주를 쓴다.
 */
const utc = (iso: string) => new Date(iso);

describe("toSeoulClock — 서버 타임존과 무관하게 서울 기준으로 환산", () => {
  test("UTC 자정 → 서울 09:00", () => {
    assert.deepEqual(toSeoulClock(utc("2026-07-27T00:00:00Z")), {
      weekday: "Mon",
      minutes: 9 * 60,
    });
  });

  test("날짜 경계를 넘어가면 요일도 함께 넘어간다 (UTC 일 15:00 → 서울 월 00:00)", () => {
    assert.deepEqual(toSeoulClock(utc("2026-08-02T15:00:00Z")), {
      weekday: "Mon",
      minutes: 0,
    });
  });
});

describe("isMarketOpen — 평일 09:00~15:40 (KST)", () => {
  const cases: [string, string, boolean][] = [
    ["월 08:59 (개장 1분 전)", "2026-07-26T23:59:00Z", false],
    ["월 09:00 (개장)", "2026-07-27T00:00:00Z", true],
    ["월 12:30 (장중)", "2026-07-27T03:30:00Z", true],
    ["월 15:39 (마감 1분 전)", "2026-07-27T06:39:00Z", true],
    ["월 15:40 (마감)", "2026-07-27T06:40:00Z", false],
    ["월 20:00 (장 마감 후)", "2026-07-27T11:00:00Z", false],
    ["금 12:00 (장중)", "2026-07-31T03:00:00Z", true],
    ["토 12:00 (주말)", "2026-08-01T03:00:00Z", false],
    ["일 12:00 (주말)", "2026-08-02T03:00:00Z", false],
  ];

  for (const [label, iso, expected] of cases) {
    test(`${label} → ${expected ? "장중" : "장외"}`, () => {
      assert.equal(isMarketOpen(utc(iso)), expected);
    });
  }
});

describe("marketRevalidate — 장중 60초 / 장외 900초", () => {
  test("장중이면 60", () => {
    assert.equal(marketRevalidate(utc("2026-07-27T03:30:00Z")), 60);
    assert.equal(marketRevalidate(utc("2026-07-27T03:30:00Z")), REVALIDATE_MARKET_OPEN);
  });

  test("장 마감 후면 900", () => {
    assert.equal(marketRevalidate(utc("2026-07-27T11:00:00Z")), 900);
    assert.equal(
      marketRevalidate(utc("2026-07-27T11:00:00Z")),
      REVALIDATE_MARKET_CLOSED,
    );
  });

  test("주말이면 시간대와 무관하게 900", () => {
    assert.equal(marketRevalidate(utc("2026-08-01T03:00:00Z")), 900);
    assert.equal(marketRevalidate(utc("2026-08-02T03:00:00Z")), 900);
  });

  test("개장·마감 경계에서 값이 갈린다", () => {
    assert.equal(marketRevalidate(utc("2026-07-26T23:59:00Z")), 900); // 08:59
    assert.equal(marketRevalidate(utc("2026-07-27T00:00:00Z")), 60); //  09:00
    assert.equal(marketRevalidate(utc("2026-07-27T06:39:00Z")), 60); //  15:39
    assert.equal(marketRevalidate(utc("2026-07-27T06:40:00Z")), 900); // 15:40
  });
});

describe("marketCaptionSuffix — 장중/장 마감을 실제 KST 시각과 함께 말한다", () => {
  test("장중이면 '장중'과 그 시각을 싣는다", () => {
    // 2026-07-27T03:30:00Z = 월 12:30 KST
    assert.equal(
      marketCaptionSuffix(utc("2026-07-27T03:30:00Z")),
      `장중 · 12:30 기준 · ${QUOTE_DELAY_NOTE}`,
    );
  });

  test("장외면 '장 마감'과 그 시각을 싣는다 — 고정 문자열을 박아 두지 않는다", () => {
    // 2026-07-27T11:00:00Z = 월 20:00 KST
    assert.equal(
      marketCaptionSuffix(utc("2026-07-27T11:00:00Z")),
      `장 마감 · 20:00 기준 · ${QUOTE_DELAY_NOTE}`,
    );
  });

  test("주말도 장 마감이다", () => {
    // 2026-08-01T03:00:00Z = 토 12:00 KST
    assert.equal(
      marketCaptionSuffix(utc("2026-08-01T03:00:00Z")),
      `장 마감 · 12:00 기준 · ${QUOTE_DELAY_NOTE}`,
    );
  });

  test("자정 부근에서 시·분이 두 자리로 패딩된다", () => {
    // 2026-07-27T15:05:00Z = 화 00:05 KST
    assert.equal(
      marketCaptionSuffix(utc("2026-07-27T15:05:00Z")),
      `장 마감 · 00:05 기준 · ${QUOTE_DELAY_NOTE}`,
    );
  });
});
