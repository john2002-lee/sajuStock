export interface MeterProps {
  /** 0~max. 칸 수로 나눠 떨어지지 않으면 **내림**한다 */
  value: number;
  max?: number;
  cells?: number;
  /** 반전 배경(`bg-ink`) 위에서 쓴다 — 빈 칸 색이 뒤집힌다 */
  inverted?: boolean;
  /** 스크린리더가 읽을 이름. 숫자만으로는 무엇의 값인지 알 수 없다 */
  label: string;
}

/**
 * 칸으로 끊어 보여주는 값. 지금 쓰는 곳은 AI 판단의 **신뢰도**다.
 *
 * ## 왜 연속 막대가 아니라 칸인가
 *
 * 신뢰도 72% 를 매끄러운 막대로 그리면 **소수점까지 의미가 있는 값처럼 읽힌다.**
 * 실제로는 모델이 낸 대략의 확신도라 5칸(20%p 단위)이 정직하다. 내림하는 것도
 * 같은 이유다 — 79% 를 4칸으로 올리면 80% 를 넘긴 것처럼 보인다.
 *
 * ## 채워지는 연출
 *
 * 칸마다 `animationDelay` 를 줘 왼쪽에서 순서대로 차오른다. 판단이 도착하는
 * 순간이 이 제품에서 가장 중요한 장면이라 그 값이 **쌓이는 것을 보여준다.**
 * `prefers-reduced-motion: reduce` 에서는 전역 규칙이 0.01ms 로 죽인다.
 *
 * 접근성: 시각적으로는 칸이지만 `role="progressbar"` 로 **원래 값**(백분율)을
 * 전한다. 5칸 중 3칸이라고 읽어 주면 그 반올림이 값인 줄 알게 된다.
 */
export function Meter({
  value,
  max = 100,
  cells = 5,
  inverted = false,
  label,
}: MeterProps) {
  const filled = Math.min(cells, Math.max(0, Math.floor((value / max) * cells)));

  return (
    <div
      className="flex gap-1"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} className="block h-1 flex-1 overflow-hidden">
          <span
            className={`block h-full origin-left ${
              i < filled
                ? "animate-meter-fill bg-up"
                : inverted
                  ? "bg-on-ink-20"
                  : "bg-line-20"
            }`}
            // 칸이 순서대로 차오르게 한다. 채워지지 않는 칸은 애니메이션이 없어
            // delay 도 뜻이 없다.
            style={i < filled ? { animationDelay: `${i * 70}ms` } : undefined}
          />
        </span>
      ))}
    </div>
  );
}
