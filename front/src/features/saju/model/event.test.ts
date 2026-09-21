import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { FREE_EVENT_PERIOD, isFreeEvent } from "./event.ts";

/**
 * 여기서 지키는 것은 **어느 순간에 결제가 살아나는가** 다.
 *
 * 이 함수 하나가 결제창을 열지 말지를 가른다. 경계를 반나절 틀리면 둘 중 하나다 —
 * 돈을 받아야 할 때 공짜로 주거나, 무료라고 띄워 놓고 결제창을 연다. 후자가 특히
 * 나쁘다.
 *
 * 함정은 시간대다. 화면에 적는 "9.18~9.30" 은 한국 날짜인데 서버(Vercel 함수)는
 * UTC 로 돈다. KST 9월 30일 자정은 UTC 로는 9월 30일 15:00 이므로, UTC 자정을
 * 기준으로 삼으면 **마지막 날 아홉 시간이 통째로 사라진다.** 시작 쪽도 대칭으로
 * 어긋난다 — UTC 9월 18일 0시는 KST 로 이미 오전 9시다.
 */

describe("isFreeEvent — 기간 안", () => {
  test("한국 시간 9월 18일 0시부터 무료다 — 표기한 시작일을 온전히 준다", () => {
    assert.equal(isFreeEvent(new Date("2026-09-17T15:00:00Z")), true); // KST 9/18 00:00
  });

  test("한국 시간 9월 30일 한낮은 무료다", () => {
    assert.equal(isFreeEvent(new Date("2026-09-30T03:00:00Z")), true); // KST 12:00
  });

  test("한국 시간 9월 30일 23시 59분까지 무료다 — 마지막 날을 온전히 준다", () => {
    assert.equal(isFreeEvent(new Date("2026-09-30T14:59:59Z")), true); // KST 23:59:59
  });

  test("기간 한가운데", () => {
    assert.equal(isFreeEvent(new Date("2026-09-25T00:00:00Z")), true);
  });

  test("행사 첫날 낮 — 오늘 테스트하는 그 시각", () => {
    assert.equal(isFreeEvent(new Date("2026-09-18T10:00:00Z")), true); // KST 9/18 19:00
  });
});

describe("isFreeEvent — 기간 밖", () => {
  test("시작 1초 전에는 무료가 아니다", () => {
    assert.equal(isFreeEvent(new Date("2026-09-17T14:59:59Z")), false); // KST 9/17 23:59:59
  });

  test("표기한 시작일 전에는 무료가 아니다 — 행사 전 기간", () => {
    // 표기가 "9.18~" 인데 코드가 그 전에도 열어 주면 화면이 거짓을 말한다.
    assert.equal(isFreeEvent(new Date("2026-09-17T00:00:00Z")), false);
    assert.equal(isFreeEvent(new Date("2026-09-01T00:00:00Z")), false);
  });

  test("한국 시간 10월 1일 0시부터 결제가 살아난다", () => {
    assert.equal(isFreeEvent(new Date("2026-09-30T15:00:00Z")), false); // KST 10/01 00:00
  });

  test("기간 한참 뒤는 무료가 아니다", () => {
    assert.equal(isFreeEvent(new Date("2026-12-25T00:00:00Z")), false);
    assert.equal(isFreeEvent(new Date("2027-01-01T00:00:00Z")), false);
  });

  test("다른 해의 같은 날짜는 무료가 아니다 — 해마다 저절로 열리면 안 된다", () => {
    assert.equal(isFreeEvent(new Date("2027-09-25T00:00:00Z")), false);
    assert.equal(isFreeEvent(new Date("2025-09-25T00:00:00Z")), false);
  });
});

describe("isFreeEvent — 시간대 함정", () => {
  test("UTC 자정을 경계로 쓰지 않는다 — 9시간이 통째로 사라지는 실수", () => {
    // UTC 로 10월 1일이지만 KST 로는 아직 9월 30일 오전 9시다.
    assert.equal(isFreeEvent(new Date("2026-10-01T00:00:00Z")), false);
    // 반대로 UTC 9월 30일 16시는 KST 로 이미 10월 1일 새벽 1시다.
    assert.equal(isFreeEvent(new Date("2026-09-30T16:00:00Z")), false);
    // UTC 9월 18일 0시는 KST 로 이미 9월 18일 오전 9시 — 기간 안이다.
    assert.equal(isFreeEvent(new Date("2026-09-18T00:00:00Z")), true);
  });

  test("표기한 기간과 코드의 경계가 같은 날을 가리킨다", () => {
    // 문구가 "9.18~9.30" 인데 코드가 하루라도 어긋나면 아무도 눈치채지 못한 채
    // 그 하루가 사라지거나 덤으로 열린다. 표기에 두 날짜가 있는지 함께 못박는다.
    assert.ok(FREE_EVENT_PERIOD.includes("9.18"), FREE_EVENT_PERIOD);
    assert.ok(FREE_EVENT_PERIOD.endsWith("9.30"), FREE_EVENT_PERIOD);
    assert.equal(isFreeEvent(new Date("2026-09-17T15:00:00Z")), true); // 시작 순간
    assert.equal(isFreeEvent(new Date("2026-09-30T14:00:00Z")), true); // 마지막 날
  });
});
