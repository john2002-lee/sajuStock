import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildPayload, SAJU_EVENT } from "./events.ts";

/**
 * 여기서 지키는 것은 **이름과 값의 안정성**이다.
 *
 * 이벤트 이름 오타나 프로퍼티 드리프트는 빌드를 깨지 않고, 화면도 멀쩡하고,
 * Amplitude 에 새 이벤트가 하나 더 생길 뿐이다. 몇 주 뒤 퍼널을 그릴 때에야
 * 데이터가 두 갈래로 쌓여 있는 것을 발견하게 된다.
 */

describe("이벤트 이름", () => {
  const names = Object.values(SAJU_EVENT);

  test("전부 saju_ 로 시작한다 — 주식이 합류해도 이름만으로 갈린다", () => {
    for (const name of names) {
      assert.match(name, /^saju_/, `${name} 이 접두사를 잃었다`);
    }
  });

  test("snake_case 소문자만 쓴다", () => {
    for (const name of names) {
      assert.match(name, /^[a-z][a-z0-9_]*$/, `${name} 이 규칙에 어긋난다`);
    }
  });

  test("동사 과거형으로 끝난다", () => {
    // 예외를 하나 허용하는 순간 규칙이 아니라 관습이 된다. `saju_report_ready`
    // 같은 형용사형이 섞이지 않게 여기서 막는다.
    for (const name of names) {
      assert.match(name, /ed$/, `${name} 이 과거형이 아니다`);
    }
  });

  test("중복된 이름이 없다", () => {
    assert.equal(new Set(names).size, names.length);
  });
});

describe("전송 속성 조립", () => {
  test("상속 컨텍스트가 호출부 속성과 합쳐진다", () => {
    const payload = buildPayload(
      { turn_index: 2 },
      { root_path: "root", day_master: "jia" },
    );

    assert.deepEqual(payload, {
      root_path: "root",
      day_master: "jia",
      turn_index: 2,
    });
  });

  test("호출부가 컨텍스트를 이긴다 — 그 순간의 값이 더 구체적이다", () => {
    const payload = buildPayload(
      { report_tier: "paid" },
      { report_tier: "free" },
    );

    assert.equal(payload.report_tier, "paid");
  });

  test("undefined 는 떨어뜨린다 — 빈 프로퍼티를 만들지 않는다", () => {
    const payload = buildPayload({ elapsed_ms: undefined, turn_index: 1 }, {});

    assert.ok(!("elapsed_ms" in payload));
    assert.equal(payload.turn_index, 1);
  });

  test("null 은 남긴다 — '해당 없음'과 '모름'은 다르다", () => {
    // 자유입력 질문의 preset_key 는 null 이다. 생략하면 프리셋을 안 쓴 것인지
    // 계측이 빠진 것인지 구분할 수 없다.
    const payload = buildPayload({ preset_key: null }, {});

    assert.equal(payload.preset_key, null);
  });

  test("빈 컨텍스트에서도 동작한다", () => {
    assert.deepEqual(buildPayload({ turn_index: 1 }, {}), { turn_index: 1 });
  });

  test("원본을 고치지 않는다", () => {
    const props = { turn_index: 1 };
    const context = { root_path: "root" as const };
    buildPayload(props, context);

    assert.deepEqual(props, { turn_index: 1 });
    assert.deepEqual(context, { root_path: "root" });
  });
});
