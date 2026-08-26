/**
 * 테마 저장 위치. 서버와 클라이언트가 같은 규칙을 봐야 하므로 여기 한 곳에 둔다.
 *
 * localStorage 가 아니라 쿠키인 이유: 서버가 첫 HTML 을 그릴 때 테마를 알아야
 * `<html data-theme>` 을 처음부터 올바르게 렌더할 수 있다. localStorage 는 서버가
 * 읽을 수 없어 인라인 스크립트로 하이드레이션 전에 DOM 을 고쳐야 했고, 그 결과
 * 서버 HTML 과 클라이언트 DOM 이 반드시 어긋나 하이드레이션 경고가 났다.
 *
 * ## 값이 둘인 이유 — 선택(preference)과 적용(resolved)은 다르다
 *
 * 사용자가 고르는 것은 셋이다: **시스템**(기본) · 라이트 · 다크. 그런데 CSS 가
 * 보는 `data-theme` 은 언제나 둘 중 하나여야 한다 — "시스템" 이라는 팔레트는 없다.
 *
 * 서버는 OS 설정을 알 수 없으므로 "시스템" 을 스스로 풀 수 없다. 그래서 **마지막에
 * 풀린 값**을 따로 기억해 두고 서버가 그것으로 첫 HTML 을 그린다. 클라이언트는
 * 마운트 뒤 `matchMedia` 로 실제 값을 확인해, 달라졌을 때만 DOM 과 쿠키를 고친다.
 *
 * 이 방식의 대가는 **첫 방문 한 번의 깜빡임**이다(기록이 없으니 라이트로 그렸다가
 * OS 가 다크면 바뀐다). 그다음부터는 기억된 값이 맞아 깜빡이지 않는다. 인라인
 * 스크립트로 하이드레이션 전에 DOM 을 고치는 방식이 그 깜빡임마저 없애지만,
 * 이 저장소가 그 방식을 걷어낸 이유(하이드레이션 불일치)가 그대로 남아 있다.
 */

/** CSS 가 실제로 보는 값. `<html data-theme>` 에 들어간다. */
export type Theme = "editorial" | "terminal";

/** 사용자가 고른 값. `system` 은 OS 설정을 따른다는 뜻이다. */
export type ThemePreference = "system" | Theme;

export const THEME_COOKIE = "ledger.theme";
/** "시스템" 일 때 마지막으로 풀린 구체 테마. 서버의 첫 렌더가 이걸 쓴다. */
export const THEME_RESOLVED_COOKIE = "ledger.theme.resolved";

/** 1년. 테마는 사용자가 명시적으로 고른 값이라 오래 기억한다. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseTheme(value: string | undefined | null): Theme {
  return value === "terminal" ? "terminal" : "editorial";
}

/**
 * 기본값이 `system` 이다.
 *
 * 쿠키가 없는 첫 방문자는 OS 설정을 따른다 — 사용자가 아무것도 고르지 않았을 때
 * 가장 덜 놀라운 동작이고, 사용자가 요청한 기본값이기도 하다.
 */
export function parseThemePreference(value: string | undefined | null): ThemePreference {
  if (value === "terminal" || value === "editorial") return value;
  return "system";
}

/** 선택을 구체 테마로 푼다. `system` 이면 OS 에 물어본다(브라우저에서만). */
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): Theme {
  if (preference === "system") return prefersDark ? "terminal" : "editorial";
  return preference;
}

/** 브라우저가 다크를 선호하는지. 서버나 미지원 환경에서는 false. */
export function prefersDarkNow(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * 브라우저에서 쿠키를 쓴다.
 *
 * HttpOnly 가 아니다 — 테마 전환이 클라이언트에서 일어나므로 JS 가 써야 한다.
 * 민감 정보가 아니고, 서버는 이 값을 표시용으로만 쓴다.
 * SameSite=Lax 로 두어 외부 사이트발 요청에는 실려 가지 않는다.
 */
export function writeThemeCookies(preference: ThemePreference, resolved: Theme): void {
  const attrs = `path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  document.cookie = `${THEME_COOKIE}=${preference}; ${attrs}`;
  document.cookie = `${THEME_RESOLVED_COOKIE}=${resolved}; ${attrs}`;
}
