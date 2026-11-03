/**
 * 매칭 구간 표시.
 * 라이트(3a)는 배경 하이라이트, 터미널(4a)은 앰버 글자색 — 둘 다 --pal-hit-* 로 받는다.
 */
export function HighlightedName({
  name,
  match,
}: {
  name: string;
  match?: [number, number];
}) {
  if (!match) return <>{name}</>;

  const [start, end] = match;
  return (
    <>
      {name.slice(0, start)}
      <mark
        className="px-px"
        style={{
          background: "var(--pal-hit-bg)",
          color: "var(--pal-hit-fg)",
        }}
      >
        {name.slice(start, end)}
      </mark>
      {name.slice(end)}
    </>
  );
}
