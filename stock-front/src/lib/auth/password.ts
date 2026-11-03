import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * `promisify(scrypt)` 를 쓰지 않는다 — 그 헬퍼는 **옵션 인자가 있는 오버로드를
 * 잃어버려서** `maxmem` 을 넘길 수 없다(타입 에러). 콜백을 직접 감싼다.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/**
 * 비밀번호 해싱 — `node:crypto` 의 scrypt.
 *
 * ## 왜 의존성을 더하지 않는가
 *
 * bcrypt·argon2 는 네이티브 빌드가 필요하고(윈도우에서 자주 깨진다), 순수 JS 구현은
 * 느리다. scrypt 는 **Node 에 들어 있고** OWASP 가 argon2·bcrypt 와 나란히 권장하는
 * KDF 다. 라이브러리 하나를 안 들이는 것이 그 자체로 공급망 표면을 줄인다.
 *
 * ## 파라미터를 해시 문자열에 적는다
 *
 *     scrypt$N=65536,r=8,p=1$<salt base64url>$<hash base64url>
 *
 * 비용을 나중에 올려도 **옛 해시가 그대로 검증된다.** 파라미터를 코드 상수로만 두면,
 * 값을 올리는 순간 기존 사용자가 전부 로그인하지 못한다. 검증은 저장된 값의
 * 파라미터를 쓰고, 새로 만들 때만 아래 기본값을 쓴다.
 *
 * N=2^16 · r=8 · p=1 은 약 67MB 를 쓴다 — Node 기본 `maxmem`(32MB)을 넘으므로
 * 명시적으로 올려 준다. 안 올리면 `memory limit exceeded` 로 던진다.
 *
 * ## 이 파일은 서버에서만 돈다
 *
 * `node:crypto` 를 import 하므로 클라이언트 번들에 들어가면 빌드가 깨진다. 그것이
 * 의도한 울타리다 — 비밀번호가 브라우저로 갈 일은 없다.
 */

const DEFAULTS = { N: 65_536, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
/** N·r·p 가 쓰는 메모리(128·N·r)에 여유를 둔다. 기본값 32MB 로는 N=2^16 이 안 돈다. */
const MAX_MEM = 160 * 1024 * 1024;

interface Params {
  N: number;
  r: number;
  p: number;
}

function encodeParams({ N, r, p }: Params): string {
  return `N=${N},r=${r},p=${p}`;
}

function decodeParams(raw: string): Params | null {
  const found: Record<string, number> = {};
  for (const pair of raw.split(",")) {
    const [key, value] = pair.split("=");
    const parsed = Number(value);
    if (!key || !Number.isInteger(parsed) || parsed <= 0) return null;
    found[key] = parsed;
  }
  const { N, r, p } = found;
  if (!N || !r || !p) return null;
  // 터무니없는 값이 저장돼 있으면(손으로 고쳤거나 손상) 검증에 쓰지 않는다 —
  // 거대한 N 은 그 자체로 서비스를 멈추는 입력이 된다.
  if (N > 1 << 20 || r > 32 || p > 16) return null;
  return { N, r, p };
}

async function derive(password: string, salt: Buffer, params: Params): Promise<Buffer> {
  // 유니코드 정규화. "café" 를 입력 도구에 따라 다르게 보내는 경우가 있고, 그러면
  // 같은 비밀번호인데 로그인이 안 된다.
  const normalized = password.normalize("NFKC");
  return scryptAsync(normalized, salt, KEY_LENGTH, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: MAX_MEM,
  });
}

/** 저장할 해시 문자열을 만든다. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await derive(password, salt, DEFAULTS);
  return [
    "scrypt",
    encodeParams(DEFAULTS),
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

/**
 * 비밀번호가 저장된 해시와 맞는가.
 *
 * **던지지 않는다.** 저장된 값이 깨져 있어도 `false` 다 — 로그인 화면에서 500 이
 * 나는 것보다 "맞지 않습니다" 가 낫고, 어차피 그 값으로는 아무도 못 들어온다.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;

  const [scheme, rawParams, rawSalt, rawHash] = stored.split("$");
  if (scheme !== "scrypt" || !rawParams || !rawSalt || !rawHash) return false;

  const params = decodeParams(rawParams);
  if (!params) return false;

  try {
    const expected = Buffer.from(rawHash, "base64url");
    if (expected.length !== KEY_LENGTH) return false;

    const actual = await derive(password, Buffer.from(rawSalt, "base64url"), params);
    // 길이가 다르면 timingSafeEqual 이 던진다. 위에서 길이를 고정했으므로 여기서는
    // 항상 같지만, 가드를 지우면 저장 값이 바뀔 때 조용히 예외가 된다.
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * 사용자가 없을 때도 **같은 시간을 쓴다.**
 *
 * 없는 계정은 즉시 실패하고 있는 계정은 scrypt 를 도느라 100ms 를 쓰면, 응답 시간
 * 차이만으로 **어떤 이메일이 가입돼 있는지 알아낼 수 있다.** 그래서 사용자를 못
 * 찾았을 때도 이 함수를 한 번 돌려 시간을 맞춘다.
 *
 * 화면 문구가 "이메일 또는 비밀번호가 올바르지 않습니다" 하나인 것도 같은 이유다 —
 * 문구로 안 알려주면서 시간으로 알려주면 소용이 없다.
 */
export async function burnPasswordTime(password: string): Promise<void> {
  await derive(password, randomBytes(SALT_LENGTH), DEFAULTS);
}

/**
 * 최소 요건. 길이만 본다.
 *
 * 대문자·특수문자를 강제하지 않는 이유는 NIST SP 800-63B 가 그 규칙을 **권장하지
 * 않기** 때문이다 — 사용자가 `Password1!` 같은 예측 가능한 변형을 만들 뿐이고,
 * 길이가 강도에 훨씬 크게 기여한다. 대신 하한을 12자로 잡았다.
 */
export const PASSWORD_MIN_LENGTH = 12;

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
  }
  // bcrypt 의 72바이트 절단 같은 함정은 scrypt 에 없지만, 무한정 긴 입력은
  // 그 자체로 CPU 를 태우는 요청이 된다.
  if (Buffer.byteLength(password, "utf8") > 1024) {
    return "비밀번호가 너무 깁니다.";
  }
  return null;
}
