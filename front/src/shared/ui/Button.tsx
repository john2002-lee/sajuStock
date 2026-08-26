import { TEXT_CLASS, type TextSize } from "./text";

/**
 * 버튼의 **모양**만 정하는 클래스 생성기.
 *
 * ## 왜 컴포넌트가 아니라 함수인가
 *
 * 이 앱의 버튼은 절반이 `<button>` 이 아니다 — 필터 칩·페이지네이션·'전체 보기' 는
 * `<Link>` 이고(상태가 URL 에 있으므로), 로그인 유도는 `<a>` 다. 컴포넌트로 만들면
 * `as` prop 으로 태그를 갈아끼우는 층이 하나 생기고, 그 층은 `<Link>` 의 `scroll`
 * `prefetch` 같은 프롭을 전부 다시 통과시켜야 한다.
 *
 * 클래스만 돌려주면 호출부가 자기에게 맞는 태그를 그대로 쓴다.
 *
 *     <button className={button()}>…
 *     <Link href={…} className={button({ tone: "quiet" })}>…
 *
 * ## tone 셋의 근거
 *
 * 화면에서 실제로 쓰이던 모양을 셋으로 묶었다. 넷째를 만들기 전에 **그 자리가
 * 정말 다른 위계인지** 먼저 본다 — 지금 있는 것도 여백이 조금씩 달라 표류하고
 * 있었다(`px-3` vs `px-3.5` vs `px-4`).
 *
 * | tone | 쓰는 곳 | 모양 |
 * |---|---|---|
 * | `primary` | 주 액션 — 다시 시도 · 저장 · 제출 | 잉크 테두리, hover 에 채워짐 |
 * | `quiet` | 보조 — 정렬·편집·닫기 | 흐린 테두리, hover 에 표면색 |
 * | `brand` | **화면당 하나** — AI 판단 | 라임 solid, 전경 고정 |
 *
 * `brand` 의 전경이 `--brand-ink` 고정인 이유는 `globals.css` 주석에 있다 —
 * 라임은 두 테마에서 밝기가 같아 `text-ink` 로 두면 다크에서 읽히지 않는다.
 *
 * 44px 최소 높이는 모바일에서만 잡는다(WCAG 2.5.5). 마우스에는 그 높이가 필요
 * 없고, 툴바 한 줄이 44px 로 부풀면 옆의 입력 필드와 높이가 어긋난다.
 */
export interface ButtonStyleOptions {
  tone?: "primary" | "quiet" | "brand";
  size?: TextSize;
  /** 좁은 화면에서 44px 히트 영역을 잡을지. 툴바 안쪽 칩은 끈다 */
  tap?: boolean;
  /** 뒤에 붙일 추가 클래스 */
  className?: string;
}

const TONE: Record<NonNullable<ButtonStyleOptions["tone"]>, string> = {
  primary: "border border-ink hover:bg-ink hover:text-on-ink",
  quiet: "border border-line-control text-muted-70 hover:border-ink hover:text-ink",
  brand: "bg-brand text-brand-ink hover:-translate-y-px",
};

export function button({
  tone = "primary",
  size = 13,
  tap = true,
  className = "",
}: ButtonStyleOptions = {}): string {
  return [
    // flex-none whitespace-nowrap: 이 버튼이 눌려 글자가 세로로 접히는 것을 막는다
    // — 실제로 768px 부근에서 "AI 판 단 열 기" 가 됐다 (Masthead 주석).
    "inline-flex flex-none items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-10 px-4 py-2 font-medium transition-colors duration-150",
    tap ? "min-h-[var(--tap)] md:min-h-0" : "",
    TONE[tone],
    TEXT_CLASS[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
