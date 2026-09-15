import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  kstDate,
  rootPathFromReferrer,
  toDayMaster,
  toDominantElement,
} from "./analytics-values.ts";

/**
 * 여기서 지키는 것은 **값이 문구에 묶이지 않는다** 는 것이다.
 *
 * 이벤트 값으로 한글이나 한자를 보내면 화면 문구를 다듬는 순간 과거 데이터와
 * 갈라진다. 로마자로 고정하고, 그 변환이 열 개 전부와 다섯 개 전부를 덮는지
 * 여기서 확인한다.
 */

describe("일간 → 로마자", () => {
  test("천간 열 개를 전부 옮긴다", () => {
    const expected: Record<string, string> = {
      甲: "jia",
      乙: "yi",
      丙: "bing",
      丁: "ding",
      戊: "wu",
      己: "ji",
      庚: "geng",
      辛: "xin",
      壬: "ren",
      癸: "gui",
    };
    for (const [gan, roman] of Object.entries(expected)) {
      assert.equal(toDayMaster(gan), roman, `${gan} 이 빠졌다`);
    }
  });

  test("모르는 글자는 undefined — 추측하지 않는다", () => {
    // 여기서 아무 값이나 돌려주면 한 사람의 일간이 조용히 틀린 칸에 쌓인다.
    assert.equal(toDayMaster("X"), undefined);
    assert.equal(toDayMaster(""), undefined);
  });
});

describe("오행 최다 → 로마자", () => {
  test("가장 많은 원소를 고른다", () => {
    assert.equal(toDominantElement({ 목: 3, 화: 1, 수: 2 }), "wood");
    assert.equal(toDominantElement({ 금: 4, 토: 1 }), "metal");
  });

  test("다섯 원소를 전부 옮긴다", () => {
    assert.equal(toDominantElement({ 목: 1 }), "wood");
    assert.equal(toDominantElement({ 화: 1 }), "fire");
    assert.equal(toDominantElement({ 토: 1 }), "earth");
    assert.equal(toDominantElement({ 금: 1 }), "metal");
    assert.equal(toDominantElement({ 수: 1 }), "water");
  });

  test("동점이면 목화토금수 순서로 끊는다 — 결정적이어야 한다", () => {
    // 객체 키 순서에 맡기면 같은 사주가 요청마다 다른 값으로 쌓일 수 있다.
    assert.equal(toDominantElement({ 화: 2, 목: 2 }), "wood");
    assert.equal(toDominantElement({ 수: 2, 금: 2 }), "metal");
  });

  test("빈 집계는 undefined", () => {
    assert.equal(toDominantElement({}), undefined);
  });

  test("0 만 있으면 undefined — 최다가 없다", () => {
    assert.equal(toDominantElement({ 목: 0, 화: 0 }), undefined);
  });

  test("모르는 키는 무시한다", () => {
    assert.equal(toDominantElement({ 목: 1, 외계: 99 }), "wood");
  });
});

describe("리퍼러 → 진입 문", () => {
  const ORIGIN = "https://aiot21.com";

  test("소개 화면을 거쳐 왔으면 intro", () => {
    assert.equal(
      rootPathFromReferrer(`${ORIGIN}/saju/intro`, ORIGIN),
      "intro",
    );
  });

  test("리퍼러가 없으면 root — 주소를 직접 열었거나 북마크다", () => {
    assert.equal(rootPathFromReferrer("", ORIGIN), "root");
  });

  test("외부에서 왔으면 root — 어느 채널이었는지는 attribution 이 말한다", () => {
    assert.equal(
      rootPathFromReferrer("https://search.naver.com/search.naver?query=사주", ORIGIN),
      "root",
    );
  });

  test("내부의 다른 화면에서 왔어도 root — intro 만 따로 센다", () => {
    assert.equal(rootPathFromReferrer(`${ORIGIN}/saju/teaser`, ORIGIN), "root");
  });

  test("해석할 수 없는 리퍼러는 unknown — 추측하지 않는다", () => {
    assert.equal(rootPathFromReferrer("::not a url::", ORIGIN), "unknown");
  });
});

describe("유저 속성에 쓰는 날짜", () => {
  test("KST 기준 YYYY-MM-DD 다", () => {
    assert.equal(kstDate(Date.parse("2026-09-14T01:00:00Z")), "2026-09-14");
  });

  test("UTC 로는 전날이어도 KST 로 자정을 넘겼으면 다음 날이다", () => {
    // 결제가 몰리는 밤 시간대가 정확히 이 구간이다. UTC 로 저장하면 한국의
    // 하루가 절반씩 두 날에 걸쳐 쌓인다.
    assert.equal(kstDate(Date.parse("2026-09-14T15:30:00Z")), "2026-09-15");
  });

  test("KST 자정 직전은 아직 그날이다", () => {
    assert.equal(kstDate(Date.parse("2026-09-14T14:59:00Z")), "2026-09-14");
  });
});
