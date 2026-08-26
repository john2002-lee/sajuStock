"use client";

import { Icon } from "@/shared/ui";
import { useTheme } from "./ThemeProvider";

/**
 * 마스트헤드에 놓는 테마 전환. 라벨은 '지금 무엇인지'가 아니라 '무엇으로 바뀌는지'를 말한다.
 *
 * ## 라벨을 DARK/LIGHT 로 바꾼 이유 — 뷰 전환과 **같은 단어**를 쓰고 있었다
 *
 * 예전에는 `TERMINAL` / `EDITORIAL` 이었다. 그런데 바로 옆의 뷰 전환(ViewToggle)이
 * `CONSOLE` / `EDITORIAL` 이다. 즉 **상태에 따라 두 버튼이 나란히 둘 다 `EDITORIAL`
 * 을 표시할 수 있었다.** 생김새(mono 대문자 테두리 박스)까지 같아서 무엇이 색을
 * 바꾸고 무엇이 레이아웃을 바꾸는지 알 방법이 없었다.
 *
 * 내부 식별자(`theme === "terminal"`)는 그대로 두고 **라벨만** 밝기 언어로 옮긴다.
 * 그러면 두 버튼의 어휘가 겹치지 않는다.
 *
 *     테마  DARK ↔ LIGHT        (색)
 *     뷰    CONSOLE ↔ EDITORIAL (구조)
 *
 * 글리프도 은유를 갈라 놓는다 — 해·달 vs 터미널·기사. 라벨을 못 읽는 폭에서도
 * 둘이 다른 축이라는 것이 보여야 한다.
 */
export function ThemeToggle() {
  const { isTerminal, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isTerminal}
      aria-label={isTerminal ? "라이트 테마로 전환" : "다크 테마로 전환"}
      title={isTerminal ? "에디토리얼 라이트로" : "다크 터미널로"}
      // flex-none whitespace-nowrap: 마스트헤드 우측 덩어리가 빠듯할 때 이 버튼이
      // 눌려 라벨이 세로로 접히는 것을 막는다 (Masthead 주석).
      className="flex min-h-[var(--tap)] min-w-[var(--tap)] flex-none items-center justify-center gap-1.5 whitespace-nowrap border border-line-control px-2.5 py-2 font-mono uppercase tracking-label-tight text-muted-60 hover:border-ink hover:text-ink md:min-h-0 md:min-w-0 text-10"
    >
      <Icon name={isTerminal ? "sun" : "moon"} size={13} />
      {isTerminal ? "light" : "dark"}
    </button>
  );
}
