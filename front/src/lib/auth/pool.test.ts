import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parse } from "pg-connection-string";
import { toNodePostgresConfig } from "./pool";

/**
 * 이 파일이 지키는 것은 하나다 — **`sslmode` 가 URL 에 남으면 로그인이 죽는다.**
 *
 * `pg` 는 접속 문자열을 파싱한 결과로 호출부의 설정을 덮어쓴다
 * (`connection-parameters.js`: `Object.assign({}, config, parse(connectionString))`).
 * 그래서 `ssl: { rejectUnauthorized: false }` 를 아무리 정확히 넘겨도, URL 에
 * `sslmode=require` 가 있으면 그 값이 `{}` 로 바뀌어 검증이 켜지고 Supabase 풀러의
 * 자체 서명 CA 에서 `self-signed certificate in certificate chain` 이 난다.
 *
 * 실제로 그렇게 한 번 터졌고, 그때 이 파일의 주석은 "node-postgres 는 libpq 규약을
 * 따르므로 sslmode 를 남긴다" 고 **근거까지 붙여 정반대로** 적혀 있었다. 규약이
 * 아니라 구현이 정하는 문제라 리뷰로는 안 잡힌다 — 13회차의 NULL 정렬과 같은 종류다.
 */

const SUPABASE = "postgresql://u:p@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres";

describe("pool · sslmode 를 URL 에서 걷어낸다", () => {
  it("Supabase 기본 URI 를 그대로 넣어도 검증을 켜지 않는다", () => {
    const config = toNodePostgresConfig(`${SUPABASE}?sslmode=require`);

    assert.deepEqual(config.ssl, { rejectUnauthorized: false });
    assert.ok(
      !config.connectionString.includes("sslmode"),
      "sslmode 가 URL 에 남으면 pg 가 우리 ssl 설정을 덮어쓴다",
    );
  });

  it("**전제 자체**를 고정한다 — pg 가 sslmode=require 를 검증으로 읽는다", () => {
    // 이 라이브러리 동작이 바뀌어(libpq 규약을 따르게 되어) 이 단언이 깨지면,
    // 위 우회를 계속 둘 이유가 있는지 다시 판단하라는 신호다.
    const parsed = parse(`${SUPABASE}?sslmode=require`);

    assert.deepEqual(
      parsed.ssl,
      {},
      "pg-connection-string 이 require 를 더 이상 빈 객체로 만들지 않는다",
    );
  });

  it("SQLAlchemy 방언 접두를 뗀다", () => {
    const config = toNodePostgresConfig(
      "postgresql+asyncpg://u:p@db.example.com:5432/postgres",
    );

    assert.ok(config.connectionString.startsWith("postgresql://"));
  });

  it("검증을 원한다고 적었으면 그대로 따른다", () => {
    assert.equal(toNodePostgresConfig(`${SUPABASE}?sslmode=verify-full`).ssl, true);
    assert.equal(toNodePostgresConfig(`${SUPABASE}?sslmode=disable`).ssl, false);
  });

  it("sslmode 가 없으면 로컬은 끄고 원격은 켠다", () => {
    // 로컬 Postgres 는 대개 TLS 를 안 켜므로, 켜면 붙지 못한다.
    assert.equal(
      toNodePostgresConfig("postgresql://u:p@localhost:5432/postgres").ssl,
      false,
    );
    // 원격을 평문으로 두는 것이 검증을 생략하는 것보다 나쁘다.
    assert.deepEqual(toNodePostgresConfig(SUPABASE).ssl, { rejectUnauthorized: false });
  });
});
