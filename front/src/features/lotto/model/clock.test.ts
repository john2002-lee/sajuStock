import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { kstStamp } from "./clock.ts";

/**
 * 여기서 지키는 것은 **서버가 어느 시간대에 있든 한국 시각이 나오는가** 다.
 *
 * 화면은 "언제 뽑은 번호인지" 를 시각으로 보여준다. Vercel 함수는 UTC 로 도는데
 * `getHours()` 처럼 지역 시간대 메서드를 쓰면 로컬(KST)에서는 맞고 배포에서는
 * 9시간 어긋난다 — 로컬에서 절대 재현되지 않는 종류의 오류다. 그래서 전부
 * `getUTC*` 로 읽고 9시간을 더한다.
 */

describe("kstStamp", () => {
  test("UTC 를 KST(+9) 로 옮긴다", () => {
    assert.equal(kstStamp(new Date("2026-09-17T07:03:00Z")), "2026.09.17 16:03");
  });

  test("UTC 15시를 넘기면 KST 는 다음 날이다", () => {
    assert.equal(kstStamp(new Date("2026-09-17T15:00:00Z")), "2026.09.18 00:00");
  });

  test("연말에는 해가 넘어간다", () => {
    assert.equal(kstStamp(new Date("2026-12-31T15:30:00Z")), "2027.01.01 00:30");
  });

  test("한 자리 월·일·시·분을 0 으로 채운다", () => {
    assert.equal(kstStamp(new Date("2026-01-02T00:05:00Z")), "2026.01.02 09:05");
  });

  test("정오 전후를 24시간제로 쓴다", () => {
    assert.equal(kstStamp(new Date("2026-06-01T04:00:00Z")), "2026.06.01 13:00");
    assert.equal(kstStamp(new Date("2026-06-01T14:00:00Z")), "2026.06.01 23:00");
  });

  test("초는 버린다 — 분 단위까지만 보여준다", () => {
    assert.equal(kstStamp(new Date("2026-09-17T07:03:59Z")), "2026.09.17 16:03");
  });
});
