/**
 * 백엔드가 준 URL을 `<a href>` 에 그대로 실어도 되는지 본다.
 *
 * React 는 `href` 를 이스케이프하지 않는다 — 값이 `javascript:...` 면 그대로
 * 클릭 가능한 링크가 된다. 뉴스·리포트·근거 문서 URL은 사용자가 아니라
 * 백엔드(외부 공급자 응답)에서 오지만, 그 공급자가 손상되거나 이상한 값을
 * 돌려줄 가능성까지 막아 둔다. http/https 가 아니면 링크를 만들지 않는다.
 */
export function isSafeHttpUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  try {
    return /^https?:$/i.test(new URL(url).protocol);
  } catch {
    return false;
  }
}
