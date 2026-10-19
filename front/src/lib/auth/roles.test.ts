import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { canSignIn, homePathFor, toRole } from "./roles.ts";

/**
 * 권한 값은 **모르면 권한 없음**으로 읽는다.
 *
 * `users.role` 은 문자열 컬럼이라 무엇이든 들어갈 수 있다. 낯선 값이 그대로 흐르면
 * 그것을 비교하는 쪽이 실수 한 번으로 통과시킬 여지가 생기므로, 여기서 세 값으로
 * 좁힌다.
 */
describe("toRole", () => {
  test("아는 값은 그대로", () => {
    assert.equal(toRole("admin"), "admin");
    assert.equal(toRole("viewer"), "viewer");
    assert.equal(toRole("user"), "user");
  });

  test("모르는 값·빈 값은 user", () => {
    for (const raw of ["ADMIN", " admin", "root", "", null, undefined, 1]) {
      assert.equal(toRole(raw), "user", `입력: ${String(raw)}`);
    }
  });
});

describe("canSignIn — 로그인 문턱", () => {
  test("관리자와 열람자만 들어온다", () => {
    assert.equal(canSignIn("admin"), true);
    assert.equal(canSignIn("viewer"), true);
  });

  test("일반 회원·모르는 값은 막는다", () => {
    assert.equal(canSignIn("user"), false);
    assert.equal(canSignIn(null), false);
    assert.equal(canSignIn(undefined), false);
    assert.equal(canSignIn("ADMIN"), false);
  });
});

describe("homePathFor — 로그인 뒤 첫 화면", () => {
  test("관리자는 운영 현황", () => {
    assert.equal(homePathFor(true), "/admin");
  });

  test("관리자가 아니면 주식 서비스 — /admin 은 열람자에게 404 다", () => {
    assert.equal(homePathFor(false), "/stock");
  });
});
