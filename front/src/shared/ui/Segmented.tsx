import { TEXT_CLASS, type TextSize } from "./text";

/**
 * 탭 한 칸의 **모양**만 정하는 클래스 생성기. `button()` 과 같은 형태다 —
 * 이 앱의 탭은 절반이 `<button>` 이 아니라 `<Link>` 이고(URL 이 상태를 들 때),
 * 컴포넌트로 감싸면 `as` prop 층이 하나 생긴다.
 *
 * 접근성(`role="tablist"` · 화살표 이동 · `aria-controls`)은 **호출부가 그대로
 * 소유한다.** 세 탭이 각자 그 처리를 이미 옳게 하고 있어서, 공용으로 끌어올리면
 * 그 손길을 잃는다. 여기 있는 것은 색과 여백뿐이다.
 *
 * ## 모양 둘을 **뜻으로** 가른다
 *
 * | shape | 뜻 | 쓰는 곳 |
 * |---|---|---|
 * | `pill` | **같은 대상의 다른 면** — 보던 것을 계속 본다 | 종목 상세 탭 · 상승/하락 |
 * | `underline` | **다른 대상으로 이동** — 목록 자체가 바뀐다 | 랭킹 ↔ 조건 검색 |
 *
 * 취향이 아니라 규칙이다. 종목 상세의 뉴스/리포트/재무는 **같은 종목**의 세 면이라
 * 화면이 바뀌지 않는다는 신호(채워진 칸)가 맞고, 랭킹 ↔ 조건 검색은 모집단부터
 * 다른 두 화면이라 이동한다는 신호(밑줄)가 맞다. 그 차이를 색으로만 말하면
 * 사용자는 둘 다 그냥 탭으로 읽는다.
 *
 * 셋이 같은 언더라인을 조금씩 다르게 그리고 있었다(`pb-2` vs `pb-[7px]`,
 * `pr-3.5` vs `pr-3`). 근거를 댄 주석은 없었다 — 표류다.
 */
export interface SegmentedOptions {
  active: boolean;
  shape?: "pill" | "underline";
  size?: TextSize;
}

export function segmented({
  active,
  shape = "pill",
  size = 13,
}: SegmentedOptions): string {
  const base =
    "flex min-h-[var(--tap)] items-center justify-center whitespace-nowrap transition-colors duration-150 md:min-h-0";

  const skin =
    shape === "pill"
      ? // 채워진 칸 = 지금 보고 있는 면. 비활성은 테두리도 배경도 없다 —
        // 칸마다 테두리를 주면 세 개가 붙어 서서 표처럼 읽힌다.
        `rounded-10 px-3.5 py-2 ${
          active
            ? "bg-ink font-medium text-on-ink"
            : "text-muted-50 hover:bg-surface hover:text-ink"
        }`
      : // 밑줄은 컨테이너의 선 위에 얹힌다 — `-mb-px` 로 1px 겹쳐 두 선이
        // 두께 2px 로 쌓이지 않게 한다.
        `-mb-px items-end border-b-2 px-3 pb-2 ${
          active
            ? "border-ink font-medium text-ink"
            : "border-transparent text-muted-50 hover:text-ink"
        }`;

  return `${base} ${skin} ${TEXT_CLASS[size]}`;
}
