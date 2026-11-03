import { Pool } from "pg";

/**
 * NextAuth 어댑터가 쓰는 Postgres 커넥션 풀.
 *
 * **프런트가 DB 에 직접 붙는 유일한 지점이다.** 나머지는 전부 FastAPI 를 거친다
 * (CONVENTIONS). 여기만 예외인 이유는 어댑터가 커넥션을 요구하기 때문이고, 그
 * 대가로 이 파일이 만지는 테이블은 NextAuth 의 넷(users·accounts·sessions·
 * verification_token)뿐이다 — 종목·관심종목 같은 도메인 데이터는 여기서 안 읽는다.
 *
 * ## 접속 문자열
 *
 * 백엔드의 `DATABASE_URL` 과 **반드시 같은 Supabase 프로젝트**여야 한다. 갈라지면
 * 백엔드가 여기 쓰인 사용자를 못 찾고, `back/app/services/orphan_service` 는 그것을
 * "소유자 없는 행" 으로 읽어 로그인 사용자의 관심종목을 지울 후보로 센다.
 *
 * 형태만 다르다.
 *
 *   백엔드  postgresql+asyncpg://...   ← SQLAlchemy 방언 접두가 붙는다
 *   여기    postgresql://...           ← node-postgres 는 그걸 모른다
 *
 * ## `sslmode` 를 **떼어낸다** — 예전 주석은 정반대로 적혀 있었다
 *
 * 여기에는 "node-postgres 는 libpq 규약을 따르므로 `sslmode` 를 남긴다" 고 적혀
 * 있었다. 그 전제가 틀렸고, 틀린 방식이 고약하다.
 *
 * `pg` 는 접속 문자열을 파싱한 결과로 **호출부가 넘긴 설정을 덮어쓴다**
 * (`connection-parameters.js`: `Object.assign({}, config, parse(connectionString))`).
 * 그리고 `pg-connection-string` 은 `sslmode=require` 를 `ssl = {}` 로 만든다 —
 * libpq 에서 `require` 는 "암호화하되 검증하지 않음" 인데, 빈 객체는 Node TLS 기본값
 * 이라 **검증을 켠다.** 즉 아래 `ssl` 옵션은 조용히 버려지고 Supabase 풀러의 자체
 * 서명 CA 에서 이렇게 터진다.
 *
 *     AdapterError: self-signed certificate in certificate chain
 *
 * 라이브러리가 같은 경고를 스스로 내고 있다 — "'require' 는 'verify-full' 의 별칭으로
 * 취급된다". 그러니 규약이 아니라 **구현**을 봐야 하고, 그 구현이 바뀌어도 흔들리지
 * 않으려면 결정을 우리가 쥐어야 한다. 백엔드가 `core/db_url.normalize_url` 에서 하는
 * 것과 정확히 같은 일이다: libpq 전용 파라미터를 URL 에서 떼고, 드라이버가 이해하는
 * 형태로 옮겨 담는다.
 *
 * 덤으로 `sslmode` 가 파서에 닿지 않으므로 그 SECURITY WARNING 도 사라진다.
 */

/** `pg` 가 받는 SSL 설정. `false` 는 TLS 끔, `true` 는 시스템 CA 로 검증. */
type SslConfig = boolean | { rejectUnauthorized: boolean };

/** 우리가 직접 해석하는 파라미터. URL 에 남겨 두면 파서가 ssl 을 대신 정해 버린다. */
const HANDLED_PARAMS = ["sslmode", "uselibpqcompat"];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * `sslmode` → `pg` 의 ssl 설정. **libpq 의 의미를 그대로 따른다.**
 *
 * 백엔드 `core/db_url._tls_for` 와 같은 표다. 한쪽만 고치면 같은 Supabase 에
 * 백엔드는 붙고 로그인만 안 되는(또는 그 반대) 상태가 된다.
 *
 *   disable                  TLS 끔
 *   verify-ca · verify-full  검증한다. Supabase CA 를 신뢰 저장소에 넣어야 붙는다
 *   allow · prefer · require 암호화하되 검증하지 않는다 ← Supabase 기본 URI 가 이것
 *   (없음)                   로컬은 끄고, 원격은 켜되 검증하지 않는다
 */
function sslFor(mode: string | null, host: string): SslConfig {
  switch ((mode ?? "").trim().toLowerCase()) {
    case "disable":
      return false;
    case "verify-ca":
    case "verify-full":
      return true;
    case "allow":
    case "prefer":
    case "require":
      return { rejectUnauthorized: false };
    default:
      // 원격 DB 를 평문으로 두는 것이 검증을 생략하는 것보다 나쁘다.
      return LOCAL_HOSTS.has(host) ? false : { rejectUnauthorized: false };
  }
}

export interface NodePostgresConfig {
  connectionString: string;
  ssl: SslConfig;
}

/**
 * Supabase 가 준 URI 를 **그대로 붙여넣을 수 있게** 한다.
 *
 * SQLAlchemy 방언 접두를 떼고, 우리가 해석할 파라미터를 URL 에서 걷어낸 뒤 그 뜻을
 * `ssl` 로 옮긴다. 사용자가 `.env.local` 을 손으로 고치지 않아도 되는 것이 요점이다 —
 * 문서가 "그대로 붙여넣으면 된다" 고 말하고 있으므로 코드가 그 약속을 지켜야 한다.
 */
export function toNodePostgresConfig(raw: string): NodePostgresConfig {
  // 상대 URL 이 아닌 것이 확실하므로 두 번째 인자는 필요 없다. 파싱이 실패하면
  // 주소 자체가 잘못된 것이라 여기서 던지는 편이 낫다 — 첫 로그인에서야 알게 되면
  // 원인이 훨씬 멀어진다.
  const url = new URL(raw.trim().replace(/^postgresql\+\w+:\/\//, "postgresql://"));

  const mode = url.searchParams.get("sslmode");
  for (const key of HANDLED_PARAMS) url.searchParams.delete(key);

  return {
    connectionString: url.toString(),
    ssl: sslFor(mode, url.hostname.toLowerCase()),
  };
}

let pool: Pool | null = null;

export function authPool(): Pool {
  if (pool) return pool;

  const raw = process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!raw) {
    // 여기까지 왔다는 것은 프로바이더가 설정됐다는 뜻인데 DB 주소가 없다.
    // 조용히 넘어가면 첫 로그인 시도에서야 알게 된다.
    throw new Error(
      "로그인이 켜져 있는데 DATABASE_URL 이 없습니다. " +
        "back/.env 의 Supabase 주소를 front/.env.local 에도 넣어 주세요.",
    );
  }

  pool = new Pool({
    ...toNodePostgresConfig(raw),
    // 세션·토큰 조회는 짧고 드물다. 서버리스에서 유휴 커넥션이 쌓이지 않게 작게 둔다.
    max: 3,
    idleTimeoutMillis: 10_000,
  });
  return pool;
}
