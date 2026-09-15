import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { recordView, type ReportViewMap } from "./report-views.ts";

/**
 * 여기서 지키는 것은 **첫 열람과 재열람을 가르는 선**이다.
 *
 * 그 선이 흐려지면 매출 퍼널의 최종 전환(`saju_report_viewed`)이 재방문마다
 * 부풀고, 전환율이 100% 를 넘는 차트가 나온다.
 */

const DAY = 24 * 60 * 60 * 1000;

describe("리포트 열람 횟수", () => {
  test("처음 열면 1회차다", () => {
    const { viewIndex, daysSinceFirst } = recordView({}, "tok", 1_000);

    assert.equal(viewIndex, 1);
    assert.equal(daysSinceFirst, 0);
  });

  test("다시 열면 회차가 오른다", () => {
    const first = recordView({}, "tok", 1_000);
    const second = recordView(first.map, "tok", 1_000 + DAY);

    assert.equal(second.viewIndex, 2);
    assert.equal(second.daysSinceFirst, 1);
  });

  test("다른 리포트는 따로 센다", () => {
    const a = recordView({}, "tok-a", 1_000);
    const b = recordView(a.map, "tok-b", 1_000);

    assert.equal(b.viewIndex, 1);
    assert.equal(a.map["tok-a"]?.count, 1);
    assert.equal(b.map["tok-b"]?.count, 1);
  });

  test("경과 일수는 내림한다 — 23시간은 아직 같은 날이다", () => {
    const first = recordView({}, "tok", 0);
    const later = recordView(first.map, "tok", 23 * 60 * 60 * 1000);

    assert.equal(later.daysSinceFirst, 0);
  });

  test("첫 열람 시각은 덮이지 않는다", () => {
    const first = recordView({}, "tok", 1_000);
    const second = recordView(first.map, "tok", 1_000 + 5 * DAY);
    const third = recordView(second.map, "tok", 1_000 + 6 * DAY);

    assert.equal(third.daysSinceFirst, 6);
  });

  test("원본 객체를 고치지 않는다", () => {
    const before: ReportViewMap = {};
    recordView(before, "tok", 1_000);

    assert.deepEqual(before, {});
  });

  test("깨진 기록은 첫 열람으로 되돌린다", () => {
    // localStorage 에 손으로 넣은 값이나 옛 버전의 모양이 들어올 수 있다.
    const broken = { tok: { firstAt: Number.NaN, count: -3 } };
    const { viewIndex, daysSinceFirst } = recordView(broken, "tok", 5_000);

    assert.equal(viewIndex, 1);
    assert.equal(daysSinceFirst, 0);
  });

  test("시계가 뒤로 가도 음수 일수를 내지 않는다", () => {
    const first = recordView({}, "tok", 10 * DAY);
    const second = recordView(first.map, "tok", 9 * DAY);

    assert.equal(second.daysSinceFirst, 0);
  });
});
