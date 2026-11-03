import {
  delta as fmtDelta,
  percent as fmtPercent,
  deltaColorClass,
  direction,
} from "@/lib/format";
import { Icon } from "./Icon";
import { TEXT_CLASS, type TextSize } from "./text";

/**
 * 등락 표시. 상승 빨강 / 하락 파랑 분기는 오직 여기서만 일어난다.
 *
 * 글리프와 색은 changePercent 의 부호에서 도출한다 — 디자인 프로토타입의
 * 목 데이터는 부호와 글리프가 어긋난 경우가 있는데(▲ 인데 -0.29%), 그건
 * 재현 대상이 아니다.
 */
export interface DeltaProps {
  /**
   * 변동 '금액'. 없는 데이터도 있다 — 관심종목(WatchItem)은 등락률만 갖는다.
   * 생략하면 금액 칸이 자동으로 빠진다.
   */
  change?: number;
  changePercent: number;
  /**
   * 타입 스케일 위의 값만 받는다. **숫자를 유지하는 이유는 아래 `DirectionMark`
   * 다** — 아이콘 크기를 글자 크기에서 도출하므로 문자열 토큰이면 여기서 다시
   * 숫자로 되돌리는 표가 필요해진다 (`text.ts` 주석).
   */
  size?: TextSize;
  /** 반전 배경(bg-ink · 다크 배너) 위에서 쓴다 */
  inverted?: boolean;
  showAmount?: boolean;
  arrow?: boolean;
  /**
   * "row" 는 [▲ 55,500 +26.81%] 한 줄 (2a 헤드라인·리스트).
   * "column" 은 금액과 퍼센트를 2줄로 쌓는다 (2b 콘솔 헤드라인).
   * 2b 가 자체적으로 화살표·색을 다시 계산하지 않게 하려고 여기에 둔다.
   */
  layout?: "row" | "column";
}

export function Delta({
  change,
  changePercent,
  size = 14,
  inverted = false,
  // 금액이 없으면 표시할 것도 없다. 호출부가 매번 showAmount={false} 를
  // 적어야 했던 자리를 기본값이 흡수한다.
  showAmount = change !== undefined,
  arrow = true,
  layout = "row",
}: DeltaProps) {
  const tone = deltaColorClass(changePercent, inverted);
  const amount = showAmount && change !== undefined;
  const text = TEXT_CLASS[size];

  if (layout === "column") {
    return (
      <span
        className={`num inline-flex flex-col items-end gap-0.5 font-medium ${tone} ${text}`}
      >
        {amount ? (
          <span className="inline-flex items-center gap-1">
            {arrow ? <DirectionMark value={changePercent} size={size} /> : null}
            {fmtDelta(change)}
          </span>
        ) : null}
        <span>{fmtPercent(changePercent)}</span>
      </span>
    );
  }

  return (
    <span className={`num inline-flex items-center gap-2.5 font-medium ${tone} ${text}`}>
      {arrow ? <DirectionMark value={changePercent} size={size} /> : null}
      {amount ? <span>{fmtDelta(change)}</span> : null}
      <span>{fmtPercent(changePercent)}</span>
    </span>
  );
}

/**
 * 방향 표식. ▲/▼ 는 BoxIcons 캐럿으로 교체했고(핸드오프 161행), 보합의 —
 * 는 글자 그대로 둔다 — '변화 없음'에 대응하는 아이콘이 세트에 없고,
 * 대시가 의미를 더 정확히 전달한다.
 *
 * 아이콘 광학 크기는 글자보다 커 보이므로 0.68 → 0.78 로 맞췄다.
 * 색은 부모 span 의 deltaColorClass 를 currentColor 로 상속한다.
 *
 * **여기 두 숫자는 타입 스케일을 따르지 않는다.** 글자 크기에 비례하는 광학
 * 보정값이지 조판 단계가 아니다 — 스케일에 올리면 큰 단에서 아이콘이 글자를
 * 앞지른다.
 */
function DirectionMark({ value, size }: { value: number; size: number }) {
  const d = direction(value);
  if (d === "flat") {
    return <span style={{ fontSize: Math.round(size * 0.68) }}>—</span>;
  }
  return (
    <Icon
      name={d === "up" ? "caret-up" : "caret-down"}
      size={Math.round(size * 0.78)}
    />
  );
}
