import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import {
  ANALYTICS_CONTEXT_KEY,
  clearContext,
  elapsedSince,
  markTime,
  secondsSince,
  startTimer,
  readContext,
  setChartContext,
  setReportTier,
  setRootPathOnce,
  setTimeUnknown,
} from "./analytics-context.ts";

/**
 * 여기서 지키는 것은 **퍼널 전 구간에 같은 값이 실린다** 는 약속이다.
 *
 * 상속 컨텍스트가 중간에 끊기면 Amplitude 퍼널 차트의 Holding Constant 가
 * 조용히 빈 값을 세고, "일간별 결제 전환율" 같은 지표가 틀린 채로 그려진다.
 * 화면에는 아무 흔적이 없다.
 */

/** sessionStorage 흉내. 던지게 만들 수도 있어야 한다 (시크릿 모드). */
function installStorage(options: { throws?: boolean } = {}) {
  const map = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      if (options.throws) throw new Error("blocked");
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (options.throws) throw new Error("blocked");
      map.set(key, value);
    },
    removeItem(key: string) {
      if (options.throws) throw new Error("blocked");
      map.delete(key);
    },
  };
  (globalThis as { window?: unknown }).window = { sessionStorage: storage };
  return map;
}

describe("상속 컨텍스트", () => {
  beforeEach(() => {
    installStorage();
  });

  test("아무것도 없으면 빈 컨텍스트다", () => {
    assert.deepEqual(readContext(), {});
  });

  test("root_path 는 첫 값만 지킨다 — 최초 유입 퍼널이라 덮이면 안 된다", () => {
    setRootPathOnce("intro");
    setRootPathOnce("root");

    assert.equal(readContext().root_path, "intro");
  });

  test("사주 컨텍스트는 새 계산으로 덮는다 — 한 기기로 여러 사람을 본다", () => {
    setChartContext({ day_master: "jia", dominant_element: "wood" });
    setChartContext({ day_master: "gui", dominant_element: "water" });

    const context = readContext();
    assert.equal(context.day_master, "gui");
    assert.equal(context.dominant_element, "water");
  });

  test("여러 조각이 한 객체로 합쳐진다", () => {
    setRootPathOnce("root");
    setTimeUnknown(true);
    setChartContext({ day_master: "bing", dominant_element: "fire" });
    setReportTier("paid");

    assert.deepEqual(readContext(), {
      root_path: "root",
      is_time_unknown: true,
      day_master: "bing",
      dominant_element: "fire",
      report_tier: "paid",
    });
  });

  test("clearContext 는 전부 지운다", () => {
    setRootPathOnce("intro");
    setReportTier("free");
    clearContext();

    assert.deepEqual(readContext(), {});
  });

  test("깨진 JSON 이 들어 있어도 빈 컨텍스트로 떨어진다", () => {
    const map = installStorage();
    map.set(ANALYTICS_CONTEXT_KEY, "{not json");

    assert.deepEqual(readContext(), {});
  });

  test("저장소를 못 쓰면 조용히 넘어간다 — 분석 때문에 화면이 죽으면 안 된다", () => {
    installStorage({ throws: true });

    assert.doesNotThrow(() => setRootPathOnce("root"));
    assert.deepEqual(readContext(), {});
  });

  test("서버에서는 window 가 없다 — 그래도 던지지 않는다", () => {
    delete (globalThis as { window?: unknown }).window;

    assert.deepEqual(readContext(), {});
    assert.doesNotThrow(() => setReportTier("paid"));
  });
});

describe("시간 마크", () => {
  beforeEach(() => {
    installStorage();
  });

  test("마크를 찍은 시점부터의 경과를 밀리초로 준다", () => {
    markTime("birth_submitted", 1_000);

    assert.equal(elapsedSince("birth_submitted", 64_000), 63_000);
  });

  test("마크가 없으면 undefined — 0 이 아니다", () => {
    // 0 을 주면 "즉시 일어났다" 는 거짓말이 데이터에 남는다.
    assert.equal(elapsedSince("teaser_viewed", 5_000), undefined);
  });

  test("마크는 다시 찍으면 갱신된다 — 재입력하면 시계도 다시 돈다", () => {
    markTime("birth_submitted", 1_000);
    markTime("birth_submitted", 10_000);

    assert.equal(elapsedSince("birth_submitted", 12_000), 2_000);
  });

  test("시계가 뒤로 가도 음수를 내지 않는다", () => {
    markTime("entry_viewed", 10_000);

    assert.equal(elapsedSince("entry_viewed", 9_000), 0);
  });

  test("초 단위로도 읽을 수 있다 — 사람이 읽는 체류 시간은 밀리초가 과하다", () => {
    markTime("teaser_viewed", 1_000);

    assert.equal(secondsSince("teaser_viewed", 74_400), 73);
  });

  test("초 단위도 마크가 없으면 undefined", () => {
    assert.equal(secondsSince("birth_submitted", 5_000), undefined);
  });

  test("startTimer 는 부른 시점부터의 경과를 준다", () => {
    const elapsed = startTimer(1_000);

    assert.equal(elapsed(3_500), 2_500);
  });

  test("startTimer 도 음수를 내지 않는다", () => {
    const elapsed = startTimer(10_000);

    assert.equal(elapsed(9_000), 0);
  });

  test("마크는 상속 컨텍스트를 건드리지 않는다", () => {
    setRootPathOnce("intro");
    markTime("entry_viewed", 1_000);

    assert.deepEqual(readContext(), { root_path: "intro" });
  });
});
