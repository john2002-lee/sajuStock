"use client";

import Link from "next/link";
import { useAdvice } from "./AdviceProvider";

/**
 * 마스트헤드 우측 버튼. 드로어와는 AdviceProvider 를 통해서만 연결된다.
 *
 * variant
 *  - "editorial" 2a 헤드라인 아래 **액션 줄** (데스크탑)
 *  - "console"   2b 상단 바 — 앰버 RUN AI 버튼 (데스크탑)
 *  - "bar"       모바일 하단 고정 버튼. 2a·2b 의 상단 버튼이 좁은 폭에서 숨으므로
 *                모바일에서는 이것이 유일한 AI 진입점이다.
 *
 * "editorial" 은 한때 마스트헤드에 있었는데, 그 줄에 담기·계정까지 서면서 좁은 폭에서
 * 무너졌다. 제호에는 전역 컨트롤(검색·테마·계정)만 남기고 종목 액션은 헤드라인 아래로
 * 내렸다 — 대상 옆에 있는 편이 원래 맞기도 하다 (`EditorialView` 주석).
 *
 * ## 로그인 전에는 **버튼이 아니라 링크**다
 *
 * 눌러 보고 나서 "로그인이 필요합니다" 를 만나게 하지 않는다. 모바일에서는 이 버튼이
 * 유일한 AI 진입점이라(`bar`), 문이 어디로 열리는지가 누르기 전에 보여야 한다.
 * 기하는 그대로 둔다 — 같은 줄에 선 담기·로그인과 정렬이 흔들리면 안 된다.
 */

/** 로그인 전 문구. 세 variant 가 같은 말을 하도록 한 곳에 둔다. */
const LOGIN_LABEL = "로그인하고 AI 판단";

/**
 * 같은 기하로 버튼 또는 링크를 그린다.
 *
 * 두 갈래를 variant 마다 따로 쓰면 className 이 여섯 벌이 되고, 그중 하나만 고치는
 * 실수가 생긴다 — 실제로 이 버튼의 기하는 이웃과 맞추느라 이미 한 번 고쳐졌다.
 */
function Action({
  canUse,
  loginHref,
  onActivate,
  expanded,
  className,
  style,
  children,
}: {
  canUse: boolean;
  loginHref: string;
  onActivate: () => void;
  /** `aria-expanded` 값. 링크일 때는 붙이지 않는다 — 펼칠 대상이 없다 */
  expanded: boolean;
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  if (!canUse) {
    return (
      <Link href={loginHref} className={className} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-expanded={expanded}
      className={className}
      style={style}
    >
      {children}
    </button>
  );
}

export function AdviceTrigger({
  variant = "editorial",
  tone = "ink",
}: {
  variant?: "editorial" | "console" | "bar";
  /**
   * bar 전용. 2b(터미널)에서는 `bg-ink` 가 크림색이라 액션으로 안 읽힌다 —
   * 그 화면의 액션 색인 앰버를 쓴다.
   */
  tone?: "ink" | "accent";
}) {
  const { open, setOpen, canUse, loginHref } = useAdvice();

  if (variant === "bar") {
    // 시트가 열리면 그 아래에 깔린 채 포커스만 남는다 — 아예 내린다.
    if (open) return null;
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-paper px-4 pt-3 md:hidden"
        style={{ paddingBottom: "calc(0.75rem + var(--safe-b))" }}
      >
        <Action
          canUse={canUse}
          loginHref={loginHref}
          onActivate={() => setOpen(true)}
          expanded={false}
          // `accent` 는 콘솔(2b) 전용이라 금색 그대로 둔다. 기본 톤이 브랜드
          // 라임으로 바뀐 것은 데스크탑 버튼과 같은 이유다 — 모바일에서 이 바는
          // AI 로 가는 **유일한** 입구인데, 잉크 솔리드는 하단 탭바(같은 잉크
          // 계열)와 붙어 서서 바가 하나 더 있는 것처럼 읽혔다.
          className={`flex min-h-[var(--tap)] w-full items-center justify-center gap-[7px] rounded-10 font-medium ${
            tone === "accent" ? "bg-accent text-paper" : "bg-brand text-brand-ink"
          } text-14`}
        >
          <span
            aria-hidden
            className={`dot block h-[5px] w-[5px] ${tone === "accent" ? "bg-paper" : "bg-brand-ink"}`}
          />
          {canUse ? "AI 판단 열기" : LOGIN_LABEL}
        </Action>
      </div>
    );
  }

  if (variant === "console") {
    return (
      <Action
        canUse={canUse}
        loginHref={loginHref}
        onActivate={() => setOpen(!open)}
        expanded={open}
        className="flex items-center gap-2 bg-accent px-4 py-2 font-mono font-medium uppercase text-paper text-11 tracking-[0.14em]"
      >
        {/* 2b 는 소문자 모노다. 로그인 문구도 그 톤을 따른다 — 여기서만 한국어
            문장을 쓰면 줄 전체가 다른 화면처럼 보인다. */}
        {canUse ? (open ? "close ai" : "run ai") : "sign in for ai"}
        <span aria-hidden>⏎</span>
      </Action>
    );
  }

  return (
    <Action
      canUse={canUse}
      loginHref={loginHref}
      onActivate={() => setOpen(!open)}
      expanded={open}
      // 이웃과 **같은 기하**를 쓴다: px-3 py-2 · 13px (담기·로그인과 동일).
      //
      // 예전에는 px-[18px] py-[9px] 이었다. 이 자리에 다른 컨트롤이 거의 없던
      // 시절에는 그 여유가 "주 액션" 으로 읽혔는데, 담기·뷰 토글·테마 토글·로그인이
      // 같은 줄에 서면서 혼자 1.5배 큰 버튼이 되어 정렬이 무너져 보였다.
      //
      // 강조는 **크기가 아니라 채움**이 한다. 주변이 전부 테두리 버튼이므로 솔리드
      // 하나만으로 위계가 충분히 서고, 그러면 크기는 줄에 맞추는 편이 낫다.
      //
      // 그 솔리드가 이제 **브랜드 라임**이다. 잉크 솔리드였을 때는 담기·뷰 전환과
      // 같은 잉크 계열이라, 셋이 나란히 서면 "채움 하나" 라는 신호가 약했다 —
      // 이 제품의 유일한 차별점이 이웃과 같은 색을 쓸 이유가 없다.
      // 전경은 `--brand-ink` 고정이다 (다크에서 밝은 글자가 라임 위에 오면 안 된다).
      //
      // `flex-none whitespace-nowrap` 이 이 버튼이 눌려 글자가 세로로 접히는 것을
      // 막는다 — 실제로 768px 부근에서 "AI 판 단 열 기" 가 됐다 (Masthead 주석).
      className="flex flex-none items-center gap-[7px] whitespace-nowrap rounded-10 bg-brand px-3 py-2 font-medium text-brand-ink transition-transform duration-150 hover:-translate-y-px text-13"
    >
      <span aria-hidden className="dot block h-[5px] w-[5px] bg-brand-ink" />
      {canUse ? `AI 판단 ${open ? "닫기" : "열기"}` : LOGIN_LABEL}
    </Action>
  );
}
