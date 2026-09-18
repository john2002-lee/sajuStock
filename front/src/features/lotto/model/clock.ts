/**
 * 화면에 적을 한국 시각.
 *
 * ## 왜 `getHours()` 가 아니라 `getUTCHours()` 인가
 *
 * 이 값은 "이 번호를 언제 뽑았는지" 를 사용자에게 보여주는 데 쓰인다. 서버에서
 * 계산되는데, Vercel 함수는 UTC 로 돈다. 지역 시간대 메서드(`getHours`)를 쓰면
 * 개발 기계(KST)에서는 맞고 배포에서는 9시간 어긋난다 — 로컬에서 절대 재현되지
 * 않는 오류다.
 *
 * 그래서 절대시각을 UTC 로 읽고 9시간을 더한다. `Intl.DateTimeFormat` 에
 * `timeZone: "Asia/Seoul"` 을 주는 방법도 있지만, 한국은 1988년 이후 서머타임이
 * 없어 고정 오프셋이라 이쪽이 더 단순하고 테스트하기 쉽다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `2026.09.17 16:03` — 분 단위까지. 초는 보여줄 이유가 없다. */
export function kstStamp(date: Date): string {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const day = `${kst.getUTCFullYear()}.${pad(kst.getUTCMonth() + 1)}.${pad(kst.getUTCDate())}`;
  return `${day} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}
