/**
 * 아주 단순한 인메모리 요청 상한기.
 *
 * 진짜 상한은 여기가 아니라 백엔드(여러 인스턴스가 공유하는 저장소)에 있어야
 * 한다 — 이 서버가 여러 인스턴스로 뜨면 상한은 인스턴스 수만큼 느슨해진다.
 * 그래도 아무 것도 없는 것보다는 낫다: 세션당 비용이 큰 엔드포인트(LLM 호출 등)를
 * 스크립트가 키 없이 한 프로세스로 두들기는 뻔한 남용을 막는 첫 번째 방어선이다.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** 마지막 청소로부터 한 창(window) 이상 지났으면 만료된 버킷을 지운다. */
let lastSweepAt = 0;

function sweep(now: number, windowMs: number) {
  if (now - lastSweepAt < windowMs) return;
  lastSweepAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * `key` 가 `windowMs` 안에 `limit` 회를 이미 썼으면 false, 아니면 한 번 소비하고 true.
 */
export function consumeRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now, windowMs);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}
