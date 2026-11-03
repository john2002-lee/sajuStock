export interface CardProps {
  children: React.ReactNode;
  /**
   * `notice` — 본문 흐름 안의 안내·오류 상자 (분석 멈춤 · 다시 시도)
   * `empty`  — 자리는 있는데 내용이 없을 때의 큰 빈 상자 (관심종목 0건)
   */
  variant?: "notice" | "empty";
  className?: string;
}

/**
 * **점선 테두리 상자.** 안내와 빈 상태 두 가지에 쓴다.
 *
 * ## 왜 점선인가
 *
 * 이 화면들에서 점선은 *"여기 내용이 있어야 하는데 지금은 없다"* 를 뜻한다.
 * 실선 패널(`border-line-*`)은 내용이 있는 자리이고, 둘을 섞으면 빈 상태가
 * 정상 패널처럼 읽힌다. `SampleFrame`(예시 데이터 틀)도 같은 어휘를 쓴다.
 *
 * ## 왜 원자로 뺐나
 *
 * 여덟 곳이 각자 그리고 있었고 **여섯 가지로 갈라져 있었다** —
 * `p-3.5` · `p-3` · `px-6 py-16` · `px-4 py-3`, 테두리는 `line-20`/`25`/`30`,
 * 어떤 것은 `bg-surface/40`, 어떤 것은 `bg-paper/60`. 근거를 댄 주석은 없었다.
 *
 * 두 변형으로 묶은 기준은 **역할**이다. `notice` 는 문단 사이에 끼는 상자라
 * 여백이 좁고, `empty` 는 그 자체가 한 화면의 내용이라 세로로 크다. 셋째
 * 변형을 만들기 전에 그 자리가 정말 다른 역할인지 먼저 본다.
 *
 * 라운드는 `rounded-14`(카드 단계)다. 표 셀·헤어라인 격자는 각진 채로 두는
 * 원칙과 충돌하지 않는다 — 이건 격자가 아니라 독립한 상자다.
 */
export function Card({ children, variant = "notice", className = "" }: CardProps) {
  const shape =
    variant === "empty"
      ? "flex flex-col items-center gap-2.5 border-line-25 px-6 py-16 text-center"
      : "flex flex-col gap-3 border-line-30 p-3.5";

  return (
    <div className={`rounded-14 border border-dashed ${shape} ${className}`}>
      {children}
    </div>
  );
}
