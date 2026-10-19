import assert from "node:assert/strict";
import { test } from "node:test";

import { findTalisman, TALISMAN_ITEMS } from "./catalog.ts";

test("세 부적이 진열 순서대로 있다", () => {
  assert.deepEqual(
    TALISMAN_ITEMS.map((t) => [t.id, t.name]),
    [
      ["jinheung", "진흥부적"],
      ["heukgeum", "흑금수호인장"],
      ["silver", "실버수호창"],
    ],
  );
});

test("설명은 사용자가 정한 문장이다", () => {
  assert.equal(findTalisman("jinheung")?.description, "만사형통(萬事亨通) — 하시는 모든 일이 막힘없이 풀리기를 비는 부적");
  assert.equal(findTalisman("heukgeum")?.description, "벽사수호(辟邪守護) — 액운과 삿된 기운을 물리고 평안을 비는 수호 인장");
  assert.equal(findTalisman("silver")?.description, "무병강녕(無病康寧) — 어르신의 액운을 물리고 건강과 평안을 비는 부적");
});

// 공개 저장소의 `public/` 에는 견본만 있다. 원본 경로를 가리키면 그 자체로 유출이다.
test("미리보기는 견본 파일만 가리킨다", () => {
  for (const t of TALISMAN_ITEMS) {
    assert.equal(t.previewSrc, `/talismans/${t.id}-preview.webp`);
  }
});

// 효과를 단정하면(잘 된다·막아 준다) 표시광고법상 과장 광고가 된다. 설명은 언제나
// **기원**("~를 비는")으로 끝난다.
test("설명은 효과를 단정하지 않고 기원으로 말한다", () => {
  for (const t of TALISMAN_ITEMS) {
    assert.match(t.description, /비는 (부적|수호 인장)$/, t.id);
  }
});

test("모르는 id 는 없다고 답한다", () => {
  assert.equal(findTalisman("gold"), undefined);
});
