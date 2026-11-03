import { direction } from "@/lib/format";

/**
 * 리스트용 초소형 라인. 홈 76×24 · 검색 92×26 · 관심종목 104×28.
 *
 * 색은 changePercent 기준 — 마지막/첫 값 비교로 따로 계산하지 않는다.
 * 그래야 옆 칸의 등락률 색과 항상 일치한다.
 */
export function Sparkline({
  points,
  changePercent,
  w = 92,
  h = 26,
  inverted = false,
  area = false,
}: {
  points: number[];
  changePercent: number;
  w?: number;
  h?: number;
  inverted?: boolean;
  /** 면 채움 (README: opacity .1 옵션). 홈 지수 카드에서 쓴다. */
  area?: boolean;
}) {
  if (points.length < 2) return <svg width={w} height={h} aria-hidden />;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 2;

  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * (w - pad * 2) + pad;
      const y = h - pad - ((p - min) / span) * (h - pad * 2);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const dir = direction(changePercent);
  const stroke =
    dir === "flat"
      ? "var(--muted-60)"
      : inverted
        ? dir === "up"
          ? "var(--up-on-ink)"
          : "var(--down-on-ink)"
        : dir === "up"
          ? "var(--up)"
          : "var(--down)";

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      className="block max-w-full flex-none"
    >
      {area ? (
        <path
          d={`${d} L${w - pad} ${h} L${pad} ${h} Z`}
          fill={stroke}
          fillOpacity={0.1}
          stroke="none"
        />
      ) : null}
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
