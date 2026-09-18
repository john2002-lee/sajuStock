import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { parseDraws } from "./draws.ts";

/**
 * 여기서 지키는 것은 **깨진 데이터가 화면을 죽이지 않는가** 다.
 *
 * `_data/draws.json` 은 매주 자동 갱신된다(GitHub Actions). 동행복권 응답 형식이
 * 바뀌거나 갱신이 중간에 끊기면 이 파일이 이상해질 수 있고, 그때 빌드가 터지는
 * 대신 **성한 회차만 가지고 조용히 돌아가야** 한다. 번호 생성은 데이터가 아예
 * 비어도 유효한 조합을 낸다(`generate.test.ts`).
 *
 * 마지막 블록은 실제 `draws.json` 을 읽는다. 1241회 전부가 검증을 통과해야 한다 —
 * 하나라도 걸러진다면 변환 과정이나 갱신 스크립트가 잘못된 것이다.
 */

const VALID = {
  latestRound: 2,
  draws: [
    { round: 1, date: "20021207", numbers: [10, 23, 29, 33, 37, 40], bonus: 16 },
    { round: 2, date: "20021214", numbers: [9, 13, 21, 25, 32, 42], bonus: 2 },
  ],
};

/** 정상 회차 하나에 한 군데만 흠집을 낸다. */
function broken(patch: Record<string, unknown>) {
  return { draws: [{ ...VALID.draws[0], ...patch }] };
}

describe("parseDraws — 정상 입력", () => {
  test("유효한 회차를 그대로 읽는다", () => {
    const draws = parseDraws(VALID);
    assert.equal(draws.length, 2);
    assert.deepEqual(draws[0].numbers, [10, 23, 29, 33, 37, 40]);
    assert.equal(draws[0].bonus, 16);
    assert.equal(draws[1].date, "20021214");
  });

  test("회차 오름차순으로 정렬한다 — 집계가 순서에 의존하지 않도록", () => {
    const draws = parseDraws({ draws: [VALID.draws[1], VALID.draws[0]] });
    assert.deepEqual(
      draws.map((d) => d.round),
      [1, 2],
    );
  });
});

describe("parseDraws — 깨진 입력은 그 회차만 버린다", () => {
  test("번호가 오름차순이 아니면 버린다 — 첫 설계가 낸 [28,1,1,1,1,1] 이 그 모양이다", () => {
    assert.equal(parseDraws(broken({ numbers: [28, 1, 1, 1, 1, 1] })).length, 0);
    assert.equal(parseDraws(broken({ numbers: [1, 2, 3, 4, 6, 5] })).length, 0);
  });

  test("번호가 겹치면 버린다", () => {
    assert.equal(parseDraws(broken({ numbers: [1, 2, 3, 3, 4, 5] })).length, 0);
  });

  test("번호가 6개가 아니면 버린다", () => {
    assert.equal(parseDraws(broken({ numbers: [1, 2, 3, 4, 5] })).length, 0);
    assert.equal(parseDraws(broken({ numbers: [1, 2, 3, 4, 5, 6, 7] })).length, 0);
  });

  test("범위를 벗어난 번호가 있으면 버린다", () => {
    assert.equal(parseDraws(broken({ numbers: [0, 2, 3, 4, 5, 6] })).length, 0);
    assert.equal(parseDraws(broken({ numbers: [1, 2, 3, 4, 5, 46] })).length, 0);
  });

  test("보너스가 당첨번호와 겹치면 버린다", () => {
    assert.equal(parseDraws(broken({ bonus: 10 })).length, 0);
  });

  test("보너스가 범위를 벗어나면 버린다", () => {
    assert.equal(parseDraws(broken({ bonus: 0 })).length, 0);
    assert.equal(parseDraws(broken({ bonus: 46 })).length, 0);
  });

  test("회차가 숫자가 아니면 버린다", () => {
    assert.equal(parseDraws(broken({ round: "1" })).length, 0);
    assert.equal(parseDraws(broken({ round: 0 })).length, 0);
  });

  test("날짜가 YYYYMMDD 8자리가 아니면 버린다", () => {
    assert.equal(parseDraws(broken({ date: "2002-12-07" })).length, 0);
    assert.equal(parseDraws(broken({ date: 20021207 })).length, 0);
  });

  test("성한 회차는 남긴다 — 하나가 깨져도 전체를 잃지 않는다", () => {
    const draws = parseDraws({
      draws: [VALID.draws[0], { round: 2, date: "bad", numbers: [1], bonus: 99 }, VALID.draws[1]],
    });
    assert.equal(draws.length, 2);
  });
});

describe("parseDraws — 구조 자체가 아닌 입력", () => {
  test("null·undefined·숫자·문자열은 빈 배열", () => {
    for (const raw of [null, undefined, 42, "draws", true]) {
      assert.deepEqual(parseDraws(raw), []);
    }
  });

  test("draws 가 배열이 아니면 빈 배열", () => {
    assert.deepEqual(parseDraws({ draws: null }), []);
    assert.deepEqual(parseDraws({ draws: {} }), []);
  });

  test("빈 draws 는 빈 배열", () => {
    assert.deepEqual(parseDraws({ draws: [] }), []);
  });
});

describe("실제 _data/draws.json", () => {
  const raw = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "..", "_data", "draws.json"), "utf-8"),
  );

  test("모든 회차가 검증을 통과한다 — 걸러지는 회차가 없어야 한다", () => {
    const draws = parseDraws(raw);
    assert.equal(draws.length, raw.draws.length, "검증에서 걸러진 회차가 있다");
  });

  test("1회부터 최신회까지 빠짐없이 이어진다", () => {
    const draws = parseDraws(raw);
    assert.equal(draws[0].round, 1);
    draws.forEach((item, index) => {
      assert.equal(item.round, index + 1, `${index + 1}회 자리에 ${item.round}회가 있다`);
    });
  });

  test("latestRound 가 마지막 회차와 일치한다", () => {
    const draws = parseDraws(raw);
    assert.equal(raw.latestRound, draws[draws.length - 1].round);
  });

  test("1회차가 알려진 값과 같다 — 2002-12-07, 10·23·29·33·37·40 + 16", () => {
    const first = parseDraws(raw)[0];
    assert.equal(first.date, "20021207");
    assert.deepEqual(first.numbers, [10, 23, 29, 33, 37, 40]);
    assert.equal(first.bonus, 16);
  });
});
