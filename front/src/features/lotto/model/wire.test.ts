import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseWireDraws } from "./wire.ts";

/**
 * 여기서 지키는 것은 **동행복권 응답이 바뀌어도 쓰레기가 파일에 들어가지 않는가** 다.
 *
 * 이 함수는 매주 GitHub Actions 안에서 돈다(`scripts/update-lotto-draws.ts`).
 * 사람이 보고 있지 않으므로, 응답 형식이 달라졌을 때 조용히 이상한 값을 커밋하는
 * 것이 최악이다. 필드 이름이 하나라도 어긋나면 그 회차를 버린다 — 그러면 신규
 * 회차가 0건이 되고 스크립트는 파일을 건드리지 않는다.
 *
 * 필드 이름은 실제 응답에서 왔다:
 * `ltEpsd`(회차) · `ltRflYmd`(추첨일) · `tm1WnNo`~`tm6WnNo` · `bnsWnNo`.
 */

/** 1241회 실제 응답 한 건(필요한 필드만). */
const REAL = {
  ltEpsd: 1241,
  ltRflYmd: "20260912",
  tm1WnNo: 7,
  tm2WnNo: 13,
  tm3WnNo: 16,
  tm4WnNo: 23,
  tm5WnNo: 24,
  tm6WnNo: 43,
  bnsWnNo: 9,
  rnk1WnNope: 18,
};

function envelope(list: unknown) {
  return { resultCode: null, resultMessage: null, data: { list } };
}

describe("parseWireDraws", () => {
  test("실제 응답 한 건을 회차로 바꾼다", () => {
    const draws = parseWireDraws(envelope([REAL]));
    assert.equal(draws.length, 1);
    assert.deepEqual(draws[0], {
      round: 1241,
      date: "20260912",
      numbers: [7, 13, 16, 23, 24, 43],
      bonus: 9,
    });
  });

  test("여러 건을 회차 오름차순으로 준다 — 응답은 내림차순으로 온다", () => {
    const older = { ...REAL, ltEpsd: 1240, tm1WnNo: 11, tm2WnNo: 13, tm3WnNo: 19, tm4WnNo: 20, tm5WnNo: 31, tm6WnNo: 44, bnsWnNo: 27 };
    const draws = parseWireDraws(envelope([REAL, older]));
    assert.deepEqual(
      draws.map((d) => d.round),
      [1240, 1241],
    );
  });

  test("번호 필드 이름이 바뀌면 그 회차를 버린다", () => {
    const renamed = { ...REAL, tm6WnNo: undefined, drwtNo6: 43 };
    assert.equal(parseWireDraws(envelope([renamed])).length, 0);
  });

  test("추첨일 형식이 바뀌면 버린다", () => {
    assert.equal(parseWireDraws(envelope([{ ...REAL, ltRflYmd: "2026-09-12" }])).length, 0);
  });

  test("번호가 오름차순이 아니면 버린다 — 자리별 집계의 전제가 깨진다", () => {
    assert.equal(parseWireDraws(envelope([{ ...REAL, tm1WnNo: 43, tm6WnNo: 7 }])).length, 0);
  });

  test("회차가 문자열로 와도 버린다 — 정렬과 비교가 조용히 틀어진다", () => {
    assert.equal(parseWireDraws(envelope([{ ...REAL, ltEpsd: "1241" }])).length, 0);
  });

  test("성한 회차는 남긴다", () => {
    const broken = { ...REAL, ltEpsd: 1240, ltRflYmd: "bad" };
    const draws = parseWireDraws(envelope([REAL, broken]));
    assert.deepEqual(
      draws.map((d) => d.round),
      [1241],
    );
  });

  test("봉투가 비거나 모양이 다르면 빈 배열", () => {
    for (const raw of [null, undefined, {}, { data: null }, { data: { list: null } }, envelope([]), "text"]) {
      assert.deepEqual(parseWireDraws(raw), []);
    }
  });

  test("오류 응답(빈 list)에서 터지지 않는다 — 아직 없는 회차를 물었을 때", () => {
    assert.deepEqual(parseWireDraws(envelope(undefined)), []);
  });
});
