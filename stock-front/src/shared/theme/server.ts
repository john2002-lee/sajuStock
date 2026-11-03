import { cookies } from "next/headers";
import {
  parseTheme,
  parseThemePreference,
  THEME_COOKIE,
  THEME_RESOLVED_COOKIE,
  type Theme,
  type ThemePreference,
} from "./cookie";

/**
 * 요청에 실려 온 테마. 루트 레이아웃이 `<html data-theme>` 을 그리는 데 쓴다.
 *
 * `cookies()` 는 요청 시점 API 라 이걸 쓰는 라우트는 정적 프리렌더 대상에서 빠진다.
 * 루트 레이아웃에서 부르므로 **모든 라우트가 동적 렌더링**이 된다 — 테마를 첫
 * HTML 에 정확히 담기 위한 대가다.
 *
 * `preference` 가 `system` 이면 서버는 OS 설정을 알 수 없으므로 **마지막에 풀린
 * 값**을 쓴다(`cookie.ts` 의 "값이 둘인 이유"). 그 값이 실제와 다르면 마운트 뒤
 * `ThemeProvider` 가 고친다.
 */
export async function getServerTheme(): Promise<{
  preference: ThemePreference;
  theme: Theme;
}> {
  const store = await cookies();
  const preference = parseThemePreference(store.get(THEME_COOKIE)?.value);

  if (preference !== "system") {
    return { preference, theme: preference };
  }

  return { preference, theme: parseTheme(store.get(THEME_RESOLVED_COOKIE)?.value) };
}
