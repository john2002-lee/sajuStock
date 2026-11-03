/**
 * 실데이터가 아닌 블록을 감싸는 틀.
 *
 * 대응 백엔드 API 가 없어 예시 값으로 채운 카드는 실데이터와 눈으로 구분돼야 한다.
 * 하단 API 메모만으로는 그 카드를 보고 있는 사람에게 닿지 않는다.
 *
 * 톤 다운은 투명도가 아니라 점선 테두리 + 배경으로 한다 — opacity 를 낮추면
 * 본문 대비가 함께 떨어져 WCAG 기준을 깨뜨린다.
 */
export function SampleFrame({
  label = "예시",
  title,
  when = true,
  children,
}: {
  label?: string;
  /** 스크린리더용 설명. 뱃지만으로는 무엇이 예시인지 알 수 없다. */
  title: string;
  /**
   * 예시일 때만 틀을 씌운다. 같은 블록이 실데이터일 수도 예시일 수도 있는 자리
   * (등락 상위는 랭킹 스냅샷이 비었을 때만 목으로 내려간다)에서 호출부가
   * `when ? <SampleFrame> : <>` 을 각자 적지 않게 여기서 받는다 — 홈과 대시보드가
   * 같은 헬퍼를 따로 갖고 있었다.
   */
  when?: boolean;
  children: React.ReactNode;
}) {
  if (!when) return <>{children}</>;

  return (
    <div
      className="relative border border-dashed border-line-30 bg-surface/40 p-3"
      role="group"
      aria-label={`${title} (예시 데이터)`}
    >
      <span
        className="absolute right-2 top-2 z-10 border border-line-30 bg-paper px-1.5 py-0.5 font-mono uppercase tracking-label-tight text-muted-60 text-10"
      >
        {label}
      </span>
      {children}
    </div>
  );
}
