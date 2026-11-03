import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clock, masthead, plainDate, relative, stamp, ymd } from "./date";

/**
 * 이 파일이 지키는 것 두 가지.
 *
 * 1. 표시 시각은 KST 다. 화면이 "장 마감 15:30 KST" 라고 선언하므로
 *    UTC 달력 필드를 그리면 KST 00:00~09:00 사이 날짜가 하루 어긋난다.
 * 2. 파싱 불가 입력에서 죽지 않는다. 백엔드 스키마가 published_at 을
 *    `str = ""` 로 두어 빈 문자열이 실제로 내려오는데, Intl 은 Invalid Date
 *    에서 RangeError 를 던진다 — 뉴스 한 줄 때문에 페이지 전체가 죽었다.
 */

describe("date · KST 변환", () => {
  it("장 마감 시각을 KST 로 그린다", () => {
    // 2026-07-30 06:30Z === 2026-07-30 15:30 KST
    assert.equal(masthead("2026-07-30T06:30:00Z"), "2026. 07. 30 목요일");
    assert.equal(clock("2026-07-30T06:30:00Z"), "15:30:00");
  });

  it("KST 자정 경계에서 날짜가 넘어간다", () => {
    // UTC 로 읽으면 7/29 로 하루 밀리던 자리
    assert.equal(masthead("2026-07-29T15:00:00Z"), "2026. 07. 30 목요일");
    assert.equal(clock("2026-07-29T15:00:00Z"), "00:00:00");

    // 자정 1초 전은 아직 전날이다
    assert.equal(masthead("2026-07-29T14:59:59Z"), "2026. 07. 29 수요일");
    assert.equal(clock("2026-07-29T14:59:59Z"), "23:59:59");
  });

  it("UTC 늦은 밤은 KST 다음 날 오전이다", () => {
    assert.equal(masthead("2026-07-30T23:30:00Z"), "2026. 07. 31 금요일");
    assert.equal(stamp("2026-07-30T23:30:00Z"), "07.31 08:30");
  });
});

describe("date · 잘못된 입력", () => {
  // 백엔드 NewsItem.published_at / AnalystReport.published_at 의 기본값
  const BAD = ["", "not-a-date", "0000-00-00"];

  it("빈 문자열·쓰레기 값에 던지지 않는다", () => {
    for (const value of BAD) {
      assert.doesNotThrow(() => masthead(value), `masthead(${JSON.stringify(value)})`);
      assert.doesNotThrow(() => stamp(value), `stamp(${JSON.stringify(value)})`);
      assert.doesNotThrow(() => clock(value), `clock(${JSON.stringify(value)})`);
      assert.doesNotThrow(() => ymd(value), `ymd(${JSON.stringify(value)})`);
      assert.doesNotThrow(
        () => relative(value, "2026-07-30T06:30:00Z"),
        `relative(${JSON.stringify(value)})`,
      );
    }
  });

  it("NaN 을 화면에 흘리지 않는다", () => {
    for (const value of BAD) {
      for (const out of [masthead(value), stamp(value), clock(value), ymd(value)]) {
        assert.ok(!out.includes("NaN"), `"${out}" 에 NaN 이 있다`);
      }
    }
  });

  it("기준 시각이 잘못돼도 relative 가 버틴다", () => {
    assert.doesNotThrow(() => relative("2026-07-30T06:30:00Z", ""));
  });
});

describe("date · ymd", () => {
  it("절대 날짜를 연도까지 그린다", () => {
    // 배당락일·실적발표일은 미래라 relative() 는 전부 "방금", stamp() 는 연도를 버린다.
    assert.equal(ymd("2026-06-29"), "2026. 06. 29");
    assert.equal(ymd("2026-10-28"), "2026. 10. 28");
  });

  it("날짜만 있는 문자열은 UTC 자정으로 파싱돼 KST 같은 날이 된다", () => {
    // 09:00 KST 라 하루 밀리지 않는다 — 백엔드가 epoch 를 UTC 로 변환하는 근거다.
    assert.equal(ymd("2026-06-29"), "2026. 06. 29");
  });
});

describe("date · plainDate", () => {
  it("시각 없는 날짜를 요일과 함께 그린다", () => {
    // 백엔드 markets/calendar 가 주는 형태. 실적발표일·배당락일이다.
    assert.equal(plainDate("2026-08-11"), "08.11 (화)");
    assert.equal(plainDate("2026-10-28"), "10.28 (수)");
  });

  it("실행 환경 타임존이 결과를 바꾸지 않는다", () => {
    // `new Date("2026-08-11")` 은 UTC 자정이라, 로컬 계열 getter 로 요일을 읽으면
    // UTC-x 지역에서 하루 앞 요일이 나온다. Date.UTC + getUTCDay 로 못 박은 이유다.
    assert.equal(plainDate("2026-01-01"), "01.01 (목)");
    assert.equal(plainDate("2026-12-31"), "12.31 (목)");
  });

  it("형식이 다르면 표시하지 않는다", () => {
    // ISO 순간을 넘기는 것도 오용이다 — 이 함수는 날짜 문자열 전용이라 거른다.
    for (const bad of ["", "2026-8-11", "2026-08-11T00:00:00Z", "not-a-date"]) {
      assert.equal(plainDate(bad), "—");
    }
  });
});

describe("date · relative", () => {
  const now = "2026-07-30T06:30:00Z";

  it("경과 시간을 구간별로 말한다", () => {
    assert.equal(relative("2026-07-30T06:29:30Z", now), "방금");
    assert.equal(relative("2026-07-30T06:00:00Z", now), "30분 전");
    assert.equal(relative("2026-07-30T03:30:00Z", now), "3시간 전");
    assert.equal(relative("2026-07-29T06:00:00Z", now), "어제");
    assert.equal(relative("2026-07-27T06:00:00Z", now), "3일 전");
  });
});
