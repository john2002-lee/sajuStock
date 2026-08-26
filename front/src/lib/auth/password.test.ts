import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hashPassword,
  passwordProblem,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from "./password";

/**
 * 비밀번호 해싱은 **틀려도 화면에 아무 표시가 안 나는** 종류의 코드다. 검증이 늘
 * `false` 면 아무도 로그인 못 하는 것으로 끝나지만, 늘 `true` 면 아무 비밀번호나
 * 통과한다. 그래서 양쪽 방향을 다 고정한다.
 *
 * scrypt N=2^16 은 한 번에 수백 ms 를 쓴다 — 케이스를 많이 두지 않는다.
 */

describe("password · 해시 왕복", () => {
  it("같은 비밀번호는 통과하고 틀린 비밀번호는 막힌다", async () => {
    const stored = await hashPassword("correct horse battery staple");

    assert.equal(await verifyPassword("correct horse battery staple", stored), true);
    assert.equal(await verifyPassword("correct horse battery stapl", stored), false);
    assert.equal(await verifyPassword("", stored), false);
  });

  it("같은 비밀번호라도 저장 값이 매번 다르다 — 솔트가 붙는다", async () => {
    const a = await hashPassword("same-password-here");
    const b = await hashPassword("same-password-here");

    assert.notEqual(a, b);
    // 그런데도 둘 다 검증된다. 파라미터·솔트가 값 안에 들어 있기 때문이다.
    assert.equal(await verifyPassword("same-password-here", a), true);
    assert.equal(await verifyPassword("same-password-here", b), true);
  });

  it("저장 형식은 파라미터를 품는다 — 나중에 비용을 올려도 옛 해시가 검증된다", async () => {
    const stored = await hashPassword("format-check-password");
    const [scheme, params] = stored.split("$");

    assert.equal(scheme, "scrypt");
    assert.match(params, /^N=\d+,r=\d+,p=\d+$/);
    assert.equal(stored.split("$").length, 4);
  });

  it("유니코드는 정규화해서 비교한다 — 입력기가 달라도 같은 비밀번호다", async () => {
    // 같은 "é" 의 두 표현: 완성형(U+00E9) 과 조합형(e + U+0301).
    const stored = await hashPassword("café-password-1234");
    assert.equal(await verifyPassword("café-password-1234", stored), true);
  });
});

describe("password · 깨진 저장 값", () => {
  it("던지지 않고 false 를 준다", async () => {
    for (const broken of [
      null,
      undefined,
      "",
      "not-a-hash",
      "bcrypt$N=1,r=1,p=1$aaaa$bbbb", // 다른 방식
      "scrypt$$aaaa$bbbb", // 파라미터 없음
      "scrypt$N=0,r=8,p=1$aaaa$bbbb", // 말이 안 되는 N
      "scrypt$N=99999999,r=8,p=1$aaaa$bbbb", // 서비스를 멈추는 N
      "scrypt$N=65536,r=8,p=1$aaaa$dG9vLXNob3J0", // 길이가 안 맞는 해시
    ]) {
      assert.equal(await verifyPassword("anything", broken), false, String(broken));
    }
  });
});

describe("password · 최소 요건", () => {
  it("길이만 본다", () => {
    assert.notEqual(passwordProblem("a".repeat(PASSWORD_MIN_LENGTH - 1)), null);
    assert.equal(passwordProblem("a".repeat(PASSWORD_MIN_LENGTH)), null);
    // 문자 종류를 강제하지 않는다 (NIST SP 800-63B) — 소문자만이어도 통과한다.
    assert.equal(passwordProblem("all lowercase words here"), null);
  });

  it("무한정 긴 입력은 막는다 — 그 자체로 CPU 를 태우는 요청이다", () => {
    assert.notEqual(passwordProblem("a".repeat(2000)), null);
  });
});
