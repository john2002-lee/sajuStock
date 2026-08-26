"use client";

import { useTheme } from "@/shared/theme";

const EDITORIAL = ["↑↓ 이동", "⏎ 선택", "⇥ 관심 추가", "esc 닫기"];
/** 터미널은 시스템 문자열을 영문 대문자로 — ⌥⏎ RUN AI 가 여기서만 노출된다 */
const TERMINAL = ["↑↓ MOVE", "⏎ OPEN", "⌥⏎ RUN AI", "⇥ WATCH", "ESC CLOSE"];

export function KeyHints({
  total,
  elapsedMs,
}: {
  total: number;
  elapsedMs: number;
}) {
  const { isTerminal } = useTheme();
  const seconds = (elapsedMs / 1000).toFixed(2);

  return (
    <div
      // 라이트(3a)는 2px 잉크 룰, 터미널(4a)은 1px 저대비 선이다 —
      // border-ink 를 고정하면 다크에서 크림색 2px 줄이 그어진다.
      className="flex items-center justify-between gap-4"
      style={{
        borderTop: "var(--pal-head-border)",
        padding: "11px var(--pal-row-px)",
        // 전체 화면 모드에서는 팔레트가 화면 바닥까지 내려온다
        paddingBottom: "calc(11px + var(--safe-b))",
      }}
    >
      {/* 단축키 안내는 물리 키보드가 있을 때만 의미가 있고, 375px 에서는
          다섯 항목이 결과 수를 밀어낸다 — 모바일에서는 접는다. */}
      <span
        className="hidden gap-4 font-mono text-muted-55 md:flex text-11"
        style={{ letterSpacing: isTerminal ? "0.1em" : 0 }}
      >
        {(isTerminal ? TERMINAL : EDITORIAL).map((hint) => (
          <span key={hint}>{hint}</span>
        ))}
      </span>
      <span className="num text-muted-45 text-11">
        {isTerminal
          ? `${total} results · ${seconds}s`
          : `결과 ${total}건 · ${seconds}s`}
      </span>
    </div>
  );
}
