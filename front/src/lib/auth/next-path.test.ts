import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loginHref, safeNextPath } from "./next-path.ts";

/**
 * 여기서 지키는 것은 **오픈 리다이렉트가 아닌가** 다.
 *
 * 이 함수가 뚫리면 우리 도메인의 로그인 화면을 지나 남의 사이트로 도착하는 링크가
 * 만들어진다. 도메인이 맞았다는 사실이 사용자가 의심하지 않을 이유가 되므로,
 * 통과시켜서는 안 되는 모양을 **하나씩 이름을 붙여** 박아 둔다.
 *
 * 화면에는 흔적이 없는 종류의 실패라, 검사를 손볼 때 이 목록이 줄어드는 것을
 * 알아차릴 방법이 이 파일뿐이다.
 */

/** 우리 도메인의 `\` 는 브라우저가 `/` 로 읽는다 — 소스에 직접 적지 않는다 */
const BACKSLASH = String.fromCharCode(0x5c);

describe("safeNextPath — 통과시키는 것", () => {
  test("평범한 경로", () => {
    assert.equal(safeNextPath("/stocks/005930"), "/stocks/005930");
  });

  test("쿼리는 보존한다 — `?ai=1` 이 로그인 뒤 드로어를 여는 근거다", () => {
    assert.equal(
      safeNextPath("/stocks/005930?ai=1"),
      "/stocks/005930?ai=1",
    );
  });

  test("루트", () => {
    assert.equal(safeNextPath("/"), "/");
  });

  test("프래그먼트는 버린다 — 서버에 오지도 않는 값이다", () => {
    assert.equal(safeNextPath("/stocks/005930#chart"), "/stocks/005930");
  });

  test("한글 경로도 통과한다", () => {
    assert.equal(safeNextPath("/stocks/삼성전자"), "/stocks/%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90");
  });
});

describe("safeNextPath — 막는 것", () => {
  test("빈 값·없음", () => {
    assert.equal(safeNextPath(undefined), null);
    assert.equal(safeNextPath(null), null);
    assert.equal(safeNextPath(""), null);
  });

  test("절대 주소", () => {
    assert.equal(safeNextPath("https://evil.example"), null);
    assert.equal(safeNextPath("http://evil.example/x"), null);
  });

  test("스킴 없는 절대 주소 — `/` 로 시작하지만 외부로 간다", () => {
    assert.equal(safeNextPath("//evil.example"), null);
    assert.equal(safeNextPath("//evil.example/stocks"), null);
  });

  test("역슬래시 — 브라우저가 `/` 로 정규화해 위 검사를 우회한다", () => {
    assert.equal(safeNextPath(`/${BACKSLASH}evil.example`), null);
    assert.equal(safeNextPath(`${BACKSLASH}${BACKSLASH}evil.example`), null);
    assert.equal(safeNextPath(`/${BACKSLASH}/evil.example`), null);
  });

  test("javascript· data 스킴", () => {
    assert.equal(safeNextPath("javascript:alert(1)"), null);
    assert.equal(safeNextPath("data:text/html,x"), null);
  });

  test("상대 경로 — `/` 로 시작하지 않으면 기준이 없다", () => {
    assert.equal(safeNextPath("stocks/005930"), null);
    assert.equal(safeNextPath("../admin"), null);
  });

  test("제어문자·개행 — 헤더에 실리는 경로에서 응답 분할이 된다", () => {
    assert.equal(safeNextPath("/stocks\r\nLocation: https://evil.example"), null);
    assert.equal(safeNextPath("/stocks\n/x"), null);
    assert.equal(safeNextPath(`/stocks${String.fromCharCode(0)}`), null);
  });

  test("로그인 화면 — 돌려보내면 고리가 된다", () => {
    assert.equal(safeNextPath("/login"), null);
    assert.equal(safeNextPath("/login/"), null);
    assert.equal(safeNextPath("/login?next=/login"), null);
  });

  test("BFF 라우트 — 브라우저를 보내면 JSON 이나 SSE 가 뜬다", () => {
    assert.equal(safeNextPath("/api"), null);
    assert.equal(safeNextPath("/api/stocks/advice"), null);
    assert.equal(safeNextPath("/api/auth/signout"), null);
  });

  test("지나치게 긴 값", () => {
    assert.equal(safeNextPath(`/${"a".repeat(512)}`), null);
  });
});

describe("loginHref", () => {
  test("안전한 경로는 실어 보낸다", () => {
    assert.equal(
      loginHref("/stocks/005930?ai=1"),
      "/login?next=%2Fstocks%2F005930%3Fai%3D1",
    );
  });

  test("못 쓸 값은 **붙이지 않는다** — 로그인 화면이 다시 검사할 일을 만들지 않는다", () => {
    assert.equal(loginHref("//evil.example"), "/login");
    assert.equal(loginHref(undefined), "/login");
    assert.equal(loginHref("/login"), "/login");
  });
});
