"use client";

import { Icon } from "@/shared/ui";
import { useSearch } from "./SearchProvider";

/**
 * 검색 팔레트를 여는 버튼. 실제 입력은 팔레트 안에서 받는다.
 *
 * variant
 *  - "field" 마스트헤드 · 콘솔 상단 바의 우측 컨트롤 덩어리에 서는 검색 필드
 *  - "hero"  홈 상단의 전체 폭 진입 필드 (모바일 포함)
 *  - "tab"   모바일 하단 탭바 항목
 *
 * "hero" 는 홈 전용이다. 홈에서는 검색이 부가 기능이 아니라 화면의 주 동사라
 * 마스트헤드 안 250px 버튼으로는 위계가 서지 않는다 — 본문 첫 블록에서
 * 전체 폭·2px 보더로 받는다. 다른 화면은 이미 맥락(종목·목록)이 있으므로
 * "field" 그대로 둔다.
 *
 * **본문에 놓는 variant 를 만들지 않는다.** 종목 탐색의 컨트롤 툴바에 넣어 본 적이
 * 있는데(당시 "bar"), 이 버튼은 목록을 거르는 것이 아니라 팔레트를 열어 다른 종목으로
 * **이동**한다. 필터·정렬 옆에 서면 "타이핑하면 표가 걸러진다" 는 잘못된 기대를 만든다.
 * 전역 컨트롤은 전역 컨트롤끼리(Masthead 주석) 둔다.
 */
export function SearchTrigger({
  variant = "field",
}: {
  variant?: "field" | "hero" | "tab";
}) {
  const { open } = useSearch();

  if (variant === "tab") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label="종목 검색 열기"
        className="flex min-h-[var(--tap)] min-w-[var(--tap)] flex-col items-center justify-center gap-1 text-muted-35 text-10"
      >
        <Icon name="search" size={17} />
        검색
      </button>
    );
  }

  if (variant === "hero") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label="종목 검색 열기 (Ctrl+K)"
        className="group flex w-full items-center gap-3 border-2 border-ink bg-field px-4 py-3.5 text-left hover:bg-surface-hover md:px-5 md:py-[18px]"
      >
        <Icon
          name="search"
          size={19}
          className="flex-none text-muted-45 group-hover:text-ink"
        />
        <span className="min-w-0 truncate text-muted-45 text-14 md:text-16">
          종목명 · 코드 · 초성
          {/* 예시는 데스크탑에서만 — 모바일에서 한 줄을 넘기면 잘려서 오히려 방해가 된다 */}
          <span className="hidden md:inline"> — 삼성전자, 005930, ㅅㅅㅈㅈ</span>
        </span>
        <span
          aria-hidden
          className="ml-auto hidden flex-none font-mono font-medium tracking-[0.08em] text-muted-35 md:inline text-11"
        >
          ⌘K
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      aria-label="종목 검색 열기 (Ctrl+K)"
      // 폭은 상한이지 고정폭이 아니다 — min-w-0 이 있어야 빠듯한 폭에서 이 필드가
      // 줄어들며 제호·액션 버튼을 화면 밖으로 밀지 않는다.
      //
      // lg 에서 200px, xl 에서 250px 로 둔다. 이 덩어리에 컨트롤이 여섯까지 서는
      // 화면(종목 상세)이 있어서, 가장 넓은 요소가 폭을 양보할 수 있어야 나머지가
      // 한 줄에 남는다. 줄어드는 것은 안내 문구뿐이고 ⌘K 힌트는 그대로 보인다.
      className="flex w-[200px] min-w-0 items-center gap-2 border border-line-28 bg-field px-3 py-2 text-left hover:border-ink xl:w-[250px]"
    >
      <Icon name="search" size={15} className="flex-none text-muted-35" />
      <span className="truncate text-muted-45 text-13">
        종목명 · 코드 · 초성
      </span>
      <span
        aria-hidden
        className="ml-auto font-mono font-medium tracking-[0.08em] text-muted-35 text-10"
      >
        ⌘K
      </span>
    </button>
  );
}
