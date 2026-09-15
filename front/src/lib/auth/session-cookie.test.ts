import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isExpiredSessionError,
  SESSION_MAX_AGE_SECONDS,
  toBrowserSessionCookie,
  withBrowserSessionCookie,
} from "./session-cookie.ts";

/**
 * 여기서 지키는 것은 **로그인이 언제 끝나는가** 다.
 *
 * 이 파일의 함수는 Set-Cookie 문자열을 손대는 일을 하는데, 잘못 손대면 둘 중
 * 하나가 조용히 깨진다: 로그아웃이 안 되거나(빈 값 쿠키의 Max-Age=0 을 떼면),
 * httpOnly 가 사라지거나. 둘 다 화면에는 아무 흔적이 없다.
 */

/** Auth.js 가 로그인 성공 때 굽는 것과 같은 모양 */
const SIGNED_IN =
  "authjs.session-token=eyJhbGciOi...; Path=/; Expires=Fri, 21 Aug 2026 23:00:00 GMT; HttpOnly; SameSite=Lax";

/** 로그아웃 — 값을 비우고 Max-Age=0 으로 지운다 (`SessionStore.clean()`) */
const SIGNED_OUT =
  "authjs.session-token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax";

describe("세션 쿠키를 브라우저 세션 수명으로 바꾼다", () => {
  test("만료 시각을 떼어낸다 — 브라우저를 닫으면 사라진다", () => {
    const result = toBrowserSessionCookie(SIGNED_IN);

    assert.ok(!/expires=/i.test(result), "Expires 가 남아 있다");
    assert.ok(!/max-age=/i.test(result), "Max-Age 가 남아 있다");
  });

  test("보안 속성은 하나도 잃지 않는다", () => {
    // 여기서 HttpOnly 가 떨어지면 sessionStorage 를 피한 이유 자체가 사라진다.
    const result = toBrowserSessionCookie(SIGNED_IN);

    assert.match(result, /HttpOnly/);
    assert.match(result, /SameSite=Lax/);
    assert.match(result, /Path=\//);
    assert.match(result, /^authjs\.session-token=eyJhbGciOi\.\.\./);
  });

  test("**로그아웃 쿠키는 손대지 않는다**", () => {
    // 값이 빈 쿠키는 삭제 지시다. 여기서 Max-Age=0 을 떼면 그것이 "빈 값을 세션
    // 동안 유지하라" 가 되어, 로그아웃이 반쯤만 되고 겉으로는 티가 안 난다.
    assert.equal(toBrowserSessionCookie(SIGNED_OUT), SIGNED_OUT);
  });

  test("__Secure- 접두와 청크 쿠키도 같은 규칙을 받는다", () => {
    // 배포는 https 라 접두가 붙고, 토큰이 4KB 를 넘으면 `.0`·`.1` 로 쪼개진다.
    const secure = toBrowserSessionCookie(
      "__Secure-authjs.session-token.0=abc; Path=/; Max-Age=3600; HttpOnly; Secure",
    );

    assert.ok(!/max-age=/i.test(secure));
    assert.match(secure, /Secure/);
  });

  test("세션 쿠키가 아닌 것은 그대로 둔다", () => {
    // csrf·callback-url·PKCE 는 각자의 수명이 있고, 그것까지 세션 수명으로
    // 만들면 OAuth 왕복이 깨진다.
    for (const other of [
      "authjs.csrf-token=x%7Cy; Path=/; HttpOnly; SameSite=Lax",
      "authjs.callback-url=%2F; Path=/; HttpOnly; SameSite=Lax",
      "authjs.pkce.code_verifier=v; Path=/; Max-Age=900; HttpOnly",
    ]) {
      assert.equal(toBrowserSessionCookie(other), other);
    }
  });
});

describe("응답 단위로 바꾼다", () => {
  test("세션 쿠키만 바뀌고 나머지 헤더는 그대로다", () => {
    const response = new Response(null, {
      status: 302,
      headers: { location: "/dashboard", "content-type": "text/html" },
    });
    response.headers.append("set-cookie", SIGNED_IN);
    response.headers.append(
      "set-cookie",
      "authjs.csrf-token=x; Path=/; HttpOnly",
    );

    const result = withBrowserSessionCookie(response);
    const cookies = result.headers.getSetCookie();

    assert.equal(result.status, 302);
    assert.equal(result.headers.get("location"), "/dashboard");
    assert.equal(cookies.length, 2);
    assert.ok(!/expires=/i.test(cookies[0]));
    assert.match(cookies[1], /csrf-token/);
  });

  test("바꿀 것이 없으면 원래 응답을 그대로 돌려준다", () => {
    // 스트리밍 본문을 새 Response 로 옮기는 일을 이유 없이 하지 않는다.
    const response = new Response("{}", { status: 200 });

    assert.equal(withBrowserSessionCookie(response), response);
  });
});

describe("토큰 수명", () => {
  test("8시간이다 — 창을 안 닫는 사용자에게 걸리는 유일한 상한", () => {
    // 서버가 JWT 세션을 즉시 무효화할 수 없으므로(auth.ts) 남은 방어가 수명뿐이다.
    // 예전 기본값은 30일이었다.
    assert.equal(SESSION_MAX_AGE_SECONDS, 8 * 60 * 60);
    assert.ok(SESSION_MAX_AGE_SECONDS < 24 * 60 * 60);
  });
});

/**
 * Auth.js 가 세션 복호화에 실패했을 때 만드는 모양. 실측한 구조 그대로다 —
 * 오류에 `type` 이 붙고, 원인은 `cause.err`, 나머지 키는 메타데이터다.
 */
function sessionError(code: string, type = "JWTSessionError") {
  const inner = Object.assign(new Error('"exp" claim timestamp check failed'), {
    code,
  });
  return Object.assign(new Error("JWTSessionError"), {
    type,
    cause: { err: inner, claim: "exp", reason: "check_failed" },
  });
}

describe("만료된 세션 쿠키를 오류와 구분한다", () => {
  test("수명이 다한 토큰이면 참 — 로그를 ERROR 로 남기지 않는 근거다", () => {
    // 토큰은 8시간, 쿠키는 브라우저를 닫을 때까지다. 창을 하루 켜 두면 이 상태가
    // **매 요청** 일어난다. 설계대로 일어나는 일이라 오류가 아니다.
    assert.equal(isExpiredSessionError(sessionError("ERR_JWT_EXPIRED")), true);
  });

  test("서명이 안 맞으면 거짓 — 그쪽은 진짜 오류다", () => {
    // AUTH_SECRET 을 갈아 끼웠거나 토큰이 위조된 경우다. 조용히 넘기면 안 된다.
    assert.equal(
      isExpiredSessionError(sessionError("ERR_JWS_SIGNATURE_VERIFICATION_FAILED")),
      false,
    );
  });

  test("다른 종류의 Auth.js 오류는 만료가 아니다", () => {
    assert.equal(
      isExpiredSessionError(sessionError("ERR_JWT_EXPIRED", "CallbackRouteError")),
      false,
    );
  });

  test("모양이 다른 값에 던지지 않는다", () => {
    // 로거는 어떤 값이든 받을 수 있는 자리다. 여기서 던지면 **로그를 남기다가**
    // 요청이 죽는다.
    for (const value of [null, undefined, "문자열", 42, new Error("맨 오류"), {}]) {
      assert.equal(isExpiredSessionError(value), false);
    }
  });
});
