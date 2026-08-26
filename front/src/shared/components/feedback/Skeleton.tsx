/**
 * 스켈레톤 조각. wfpulse(opacity .35↔1, 1.2s)에 0 / .2 / .4s 시차를 돌려가며 준다 —
 * 한 화면의 막대가 전부 같은 박자로 깜빡이면 로딩이 아니라 고장처럼 보인다.
 *
 * 실제 레이아웃과 같은 골격을 만들기 위한 조각이므로 크기는 호출하는 쪽이 정한다.
 */

const DELAYS = ["0ms", "200ms", "400ms"];
const TONES = ["bg-skeleton-1", "bg-skeleton-2", "bg-skeleton-3"];

export function Skeleton({
  w,
  h,
  i = 0,
  className = "",
}: {
  /** CSS width — "70%" 또는 240 */
  w?: string | number;
  h: string | number;
  /** 시차·농도 인덱스. 위에서 아래로 0,1,2… 를 넘기면 된다 */
  i?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse-wf ${TONES[i % TONES.length]} ${className}`}
      style={{ width: w, height: h, animationDelay: DELAYS[i % DELAYS.length] }}
    />
  );
}

/** 로딩 화면 전체를 감싸 스크린리더에 상태를 알린다 */
export function SkeletonScreen({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
