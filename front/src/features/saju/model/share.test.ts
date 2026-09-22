import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { shareLink, shareResultUrl, shareUrl } from "./share.ts";

/**
 * 여기서 지키는 것은 **취소를 실패로 읽지 않는가** 와 **취소한 사람의 클립보드를
 * 건드리지 않는가** 다.
 *
 * 두 실패 모두 화면에서는 조용하다. 전자는 "공유하지 못했습니다" 가 뜨는 것으로
 * 끝나지만, 후자는 사용자가 **공유를 그만두겠다고 말한 뒤에** 그 사람이 복사해
 * 두었던 내용을 우리 링크로 덮어쓰는 일이다. 되돌릴 방법이 없다.
 */

/** `navigator.share` 가 사용자의 취소에 던지는 것. 이름이 곧 규약이다. */
function abortError(): Error {
  const error = new Error("Share canceled");
  error.name = "AbortError";
  return error;
}

describe("shareUrl", () => {
  test("설정된 주소를 우선한다", () => {
    assert.equal(shareUrl("https://aiot21.com", "http://localhost:3000"), "https://aiot21.com");
  });

  test("끝의 슬래시를 떨어뜨린다 — 카톡에 붙었을 때 `aiot21.com/` 은 군더더기다", () => {
    assert.equal(shareUrl("https://aiot21.com/", "http://localhost:3000"), "https://aiot21.com");
  });

  test("설정이 없으면 브라우저가 보고 있는 주소를 쓴다", () => {
    assert.equal(shareUrl(undefined, "http://localhost:3000"), "http://localhost:3000");
  });

  test("빈 문자열은 미설정과 같다 — 빌드에 `NEXT_PUBLIC_APP_ORIGIN=` 만 있는 경우", () => {
    assert.equal(shareUrl("", "http://localhost:3000"), "http://localhost:3000");
  });

  test("공백뿐인 값도 미설정으로 본다", () => {
    assert.equal(shareUrl("   ", "http://localhost:3000"), "http://localhost:3000");
  });
});

describe("shareResultUrl", () => {
  test("발급받은 id 로 결과 주소를 만든다", () => {
    assert.equal(
      shareResultUrl("https://aiot21.com", "x7Kq2mP9abcDEF_-"),
      "https://aiot21.com/saju/s/x7Kq2mP9abcDEF_-",
    );
  });

  test("오리진을 다시 손질하지 않는다 — `shareUrl` 이 이미 한 일이다", () => {
    // 끝 슬래시 정리를 두 곳에서 하면 한쪽만 고치는 날이 온다. 이 함수는
    // `shareUrl` 을 거친 값을 받는다는 전제를 못박아 둔다.
    assert.equal(shareResultUrl("https://aiot21.com/", "abc"), "https://aiot21.com//saju/s/abc");
  });

  test("id 를 인코딩한다 — 서버가 생성 방식을 바꿔도 깨지지 않게", () => {
    assert.equal(shareResultUrl("https://aiot21.com", "a/b?c"), "https://aiot21.com/saju/s/a%2Fb%3Fc");
  });

  test("로컬에서도 만들어진다", () => {
    assert.equal(
      shareResultUrl(shareUrl(undefined, "http://localhost:3000"), "abc"),
      "http://localhost:3000/saju/s/abc",
    );
  });
});

const TARGET = { url: "https://aiot21.com", title: "FEEL", text: "사주팔자" };

describe("shareLink — 공유 시트가 있을 때", () => {
  test("시트를 열고 `shared` 로 끝난다", async () => {
    const calls: unknown[] = [];
    const outcome = await shareLink(TARGET, {
      share: async (data) => {
        calls.push(data);
      },
    });

    assert.equal(outcome, "shared");
    assert.deepEqual(calls, [TARGET]);
  });

  test("사용자가 닫으면 `cancelled` — 실패가 아니다", async () => {
    const outcome = await shareLink(TARGET, {
      share: async () => {
        throw abortError();
      },
      copy: async () => {
        assert.fail("취소한 사람의 클립보드를 건드려서는 안 된다");
      },
    });

    assert.equal(outcome, "cancelled");
  });

  test("취소가 아닌 오류는 복사로 내려간다 — 링크는 손에 쥐여 준다", async () => {
    const copied: string[] = [];
    const outcome = await shareLink(TARGET, {
      share: async () => {
        throw new Error("NotAllowedError");
      },
      copy: async (text) => {
        copied.push(text);
      },
    });

    assert.equal(outcome, "copied");
    assert.deepEqual(copied, ["https://aiot21.com"]);
  });
});

describe("shareLink — 공유 시트가 없을 때", () => {
  test("클립보드로 복사한다 (데스크톱 대부분)", async () => {
    const copied: string[] = [];
    const outcome = await shareLink(TARGET, {
      copy: async (text) => {
        copied.push(text);
      },
    });

    assert.equal(outcome, "copied");
    assert.deepEqual(copied, ["https://aiot21.com"]);
  });

  test("클립보드가 거부하면 `failed`", async () => {
    const outcome = await shareLink(TARGET, {
      copy: async () => {
        throw new Error("NotAllowedError");
      },
    });

    assert.equal(outcome, "failed");
  });

  test("둘 다 없으면 `unsupported` — 실패와 구분한다", async () => {
    assert.equal(await shareLink(TARGET, {}), "unsupported");
  });
});
