"use client";

import { Icon, type IconName } from "@/shared/ui";
import { useTheme } from "./ThemeProvider";
import type { ThemePreference } from "./cookie";

/**
 * 세 갈래 테마 선택 — 시스템(기본) · 라이트 · 다크.
 *
 * 마스트헤드의 `ThemeToggle`(라이트↔다크 두 상태)과 나란히 존재한다. 그쪽은 폭이
 * 빠듯한 줄에 들어가는 **한 번 누르면 바뀌는** 버튼이고, 이쪽은 메뉴 안에서
 * **지금 무엇인지 보여 주고 고르게 하는** 컨트롤이다. 두 상태 버튼으로는 "시스템"
 * 을 표현할 수 없다 — 누를 때마다 세 값을 도는 버튼은 지금이 무엇인지 알 수 없고,
 * 그래서 메뉴 쪽은 세 칸을 다 펼친다.
 *
 * `radiogroup` 이 아니라 버튼 셋인 이유: 라디오는 화살표 키로만 이동하는 로빙
 * 포커스를 요구하는데, 이 컨트롤은 메뉴 안에 있어 Tab 으로 지나가는 것이 자연스럽다.
 * 선택 상태는 `aria-pressed` 가 전한다.
 */

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; icon: IconName }> = [
  { value: "system", label: "시스템", icon: "monitor" },
  { value: "editorial", label: "라이트", icon: "sun" },
  { value: "terminal", label: "다크", icon: "moon" },
];

export function ThemeChoice() {
  const { preference, setPreference } = useTheme();

  return (
    <div role="group" aria-label="화면 밝기" className="flex gap-1 rounded-pill bg-surface-warm p-1">
      {OPTIONS.map((option) => {
        const selected = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => setPreference(option.value)}
            className={
              "flex min-h-[var(--tap)] flex-1 flex-col items-center justify-center gap-1 rounded-pill px-2 text-11 font-semibold transition " +
              (selected
                ? "bg-gold-gradient text-on-primary shadow-card-sm"
                : "text-ink-body hover:text-gold-text-strong")
            }
          >
            <Icon name={option.icon} size={15} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
