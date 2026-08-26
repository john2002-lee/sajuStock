"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  prefersDarkNow,
  resolveTheme,
  writeThemeCookies,
  type Theme,
  type ThemePreference,
} from "./cookie";

/**
 * 테마 — **시스템**(기본) · 라이트 · 다크.
 *
 * 두 팔레트는 밝기 차이가 아니라 서로 다른 디자인 언어다(신문 지면 vs 트레이딩
 * 콘솔, 그리고 사주 쪽은 아침 해무리 vs 깊은 밤). 그래서 예전에는 OS 를 따르지
 * 않고 사용자가 고르게 했는데, 아무것도 고르지 않은 사람에게는 **OS 를 따르는
 * 것이 가장 덜 놀랍다** — 그래서 기본값이 시스템이다.
 *
 * ## 서버가 그린 값을 클라이언트가 고칠 수 있다
 *
 * 서버는 OS 설정을 알 수 없다. "시스템" 인 사용자에게는 마지막에 풀린 값으로
 * 첫 HTML 을 그리고(`cookie.ts` 주석), 마운트 뒤 이 컴포넌트가 실제 값을 확인해
 * **다를 때만** DOM 을 고친다. React 렌더가 아니라 DOM 속성 쓰기라 하이드레이션
 * 불일치가 생기지 않는다.
 *
 * OS 설정이 도중에 바뀌는 것도 따라간다 — `matchMedia` 를 구독하고 있으므로,
 * 시스템을 고른 사용자는 해가 지면 화면도 함께 어두워진다.
 */

interface ThemeContextValue {
  /** 사용자가 고른 값. 화면의 선택 UI 가 이걸 표시한다. */
  preference: ThemePreference;
  /** 실제로 적용된 팔레트. */
  theme: Theme;
  isTerminal: boolean;
  setPreference: (next: ThemePreference) => void;
  /** 라이트 ↔ 다크 두 상태만 오가는 단축. 주식 마스트헤드의 버튼이 쓴다. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** CSS 가 보는 것은 이 속성 하나다. */
function applyTheme(theme: Theme): void {
  if (theme === "terminal") {
    document.documentElement.dataset.theme = "terminal";
  } else {
    delete document.documentElement.dataset.theme;
  }
}

export function ThemeProvider({
  initialPreference,
  initialTheme,
  children,
}: {
  initialPreference: ThemePreference;
  initialTheme: Theme;
  children: React.ReactNode;
}) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const setPreference = useCallback((next: ThemePreference) => {
    const resolved = resolveTheme(next, prefersDarkNow());
    setPreferenceState(next);
    setTheme(resolved);
    applyTheme(resolved);
    // 다음 요청부터는 서버가 쿠키를 읽어 같은 값을 처음부터 렌더한다.
    writeThemeCookies(next, resolved);
  }, []);

  /**
   * "시스템" 일 때만 OS 를 따라간다.
   *
   * 마운트 직후 한 번 맞춰 보는 이유: 서버는 **마지막에 기억한 값**으로 그렸을
   * 뿐이라, 그 사이 OS 설정이 바뀌었으면 지금 화면이 틀려 있다.
   */
  useEffect(() => {
    if (preference !== "system") return;
    if (typeof window.matchMedia !== "function") return;

    const query = window.matchMedia("(prefers-color-scheme: dark)");

    const sync = () => {
      const resolved = resolveTheme("system", query.matches);
      // 이미 맞으면 아무것도 하지 않는다 — 불필요한 렌더와 쿠키 쓰기를 막는다.
      setTheme((current) => {
        if (current === resolved) return current;
        applyTheme(resolved);
        writeThemeCookies("system", resolved);
        return resolved;
      });
    };

    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [preference]);

  const toggle = useCallback(
    () => setPreference(theme === "terminal" ? "editorial" : "terminal"),
    [theme, setPreference],
  );

  return (
    <ThemeContext.Provider
      value={{ preference, theme, isTerminal: theme === "terminal", setPreference, toggle }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return context;
}
