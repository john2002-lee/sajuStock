"use client";

import { useTheme } from "@/shared/theme";
import { modeChipLabel, type ParsedQuery } from "../model/match";

/**
 * 입력 모드 표시. 클릭 대상이 아니라 "지금 이렇게 해석했다"는 피드백이므로
 * 버튼이 아닌 상태 표시로 둔다 — 타이핑만으로 활성 칩이 바뀐다.
 *
 * 터미널(4a)은 명령형 프리픽스 문법을 그대로 노출한다: NAME / :CODE / @TICKER.
 * 접두어를 입력하면(`:005930`) 그 칩이 활성이 되고, 없으면 쿼리 모양으로 판단한다.
 */

type ChipKey = "name" | "initials" | "code" | "ticker";

const EDITORIAL: ChipKey[] = ["name", "initials", "code"];
const TERMINAL: ChipKey[] = ["name", "code", "ticker"];

export function ModeChips({ parsed }: { parsed: ParsedQuery }) {
  const { isTerminal } = useTheme();
  const chips = isTerminal ? TERMINAL : EDITORIAL;
  const { mode, scope, query, prefix } = parsed;
  const hasLatin = /[A-Za-z]/.test(query);

  function label(key: ChipKey): string {
    if (!isTerminal) {
      return modeChipLabel(key === "ticker" ? "code" : key, query);
    }
    if (key === "ticker") return "@TICKER";
    if (key === "code") return ":CODE";
    return "NAME";
  }

  function active(key: ChipKey): boolean {
    // 접두어가 있으면 그것이 곧 모드다.
    if (prefix) {
      if (scope === "ticker") return key === "ticker";
      if (scope === "code") return key === "code";
      // '>' 는 이름·초성 — 라이트에서는 초성 칩까지 구분한다.
      return isTerminal ? key === "name" : key === mode;
    }
    if (!isTerminal) return key === mode;
    if (key === "ticker") return mode === "code" && hasLatin;
    if (key === "code") return mode === "code" && !hasLatin;
    return mode === "name" || mode === "initials";
  }

  return (
    <span className="flex gap-1.5" role="status" aria-live="polite">
      <span className="sr-only">
        입력 모드: {isTerminal ? label(scope === "all" ? "name" : (scope as ChipKey)) : modeChipLabel(mode, query)}
      </span>
      {chips.map((key) => {
        const on = active(key);
        return (
          <span
            key={key}
            aria-hidden
            className={`font-mono font-medium ${
              on ? "" : "border border-line-28 text-muted-60"
            }`}
            style={{
              fontSize: "var(--pal-chip-size)",
              padding: "3px 7px",
              letterSpacing: isTerminal ? "0.1em" : "0.08em",
              background: on
                ? isTerminal
                  ? "var(--accent)"
                  : "var(--ink)"
                : undefined,
              // 앰버 칩 위 글자는 배경색(--paper)으로 뚫는다
              color: on
                ? isTerminal
                  ? "var(--paper)"
                  : "var(--on-ink)"
                : undefined,
            }}
          >
            {label(key)}
          </span>
        );
      })}
    </span>
  );
}
