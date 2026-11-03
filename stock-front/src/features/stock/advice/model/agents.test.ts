import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AGENT_COUNT, AGENT_META, AGENT_ORDER } from "./types.ts";
import { MOCK_AGENTS } from "./mock.ts";

/**
 * 드로어는 `AGENT_ORDER` 로 **자리를 먼저 세우고** 도착한 의견을 이름으로 맞춰
 * 끼운다(`components/AgentSlots.tsx`). 그래서 이름이 어긋나면 슬롯이 영영 골격으로
 * 남는데, **화면은 깨지지 않는다** — 조용히 비어 보일 뿐이라 눈으로는 잡기 어렵다.
 *
 * 백엔드 `agents/prompts.py` 의 `ANALYST_PROFILES` 가 진짜 출처지만 프런트 테스트가
 * 파이썬을 읽을 수는 없다. 대신 **같은 계약을 복사해 둔 두 곳**(표시 메타 · 목
 * 데이터)과 어긋나지 않는지 고정한다. 백엔드 이름을 바꾸면 목도 함께 고치게 되고,
 * 그때 이 테스트가 `AGENT_ORDER` 를 빠뜨렸다고 알려 준다.
 */
describe("AGENT_ORDER", () => {
  test("표시 메타에 없는 이름이 없다 — 있으면 영문 부제가 조용히 빈다", () => {
    for (const { name } of AGENT_ORDER) {
      assert.ok(
        name in AGENT_META,
        `${name} 이 AGENT_META 에 없다 — 슬롯은 서지만 부제가 빈다`,
      );
    }
  });

  test("목 데이터의 에이전트가 전부 슬롯에 맞는다", () => {
    const slots = new Set(AGENT_ORDER.map((slot) => slot.name));
    for (const opinion of MOCK_AGENTS) {
      assert.ok(
        slots.has(opinion.agent),
        `목의 "${opinion.agent}" 가 어느 슬롯에도 안 맞는다 — 골격이 남고 카드가 뒤에 따로 붙는다`,
      );
    }
  });

  test("슬롯 수와 목 의견 수가 같다 — 남거나 모자라면 화면에 빈 자리가 생긴다", () => {
    assert.equal(AGENT_COUNT, AGENT_ORDER.length);
    assert.equal(MOCK_AGENTS.length, AGENT_COUNT);
  });

  test("모든 슬롯이 관점 라벨을 갖는다", () => {
    for (const { name, lens } of AGENT_ORDER) {
      assert.ok(lens.trim().length > 0, `${name} 에 lens 가 없다`);
    }
  });
});
