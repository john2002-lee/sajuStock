/**
 * 리스트 행 — 하단 점선. 뉴스 행은 tone="news" (rgba .25)
 *
 * 같은 파일에 `Hairline`(가로 구분선) 이 있었는데 쓰는 곳이 한 곳도 없어 걷어냈다.
 * 화면들은 구분선을 컨테이너의 `border-t` 로 직접 그리고 있고, 그쪽이 여백·색을
 * 그 자리에서 조절하기 쉬워 실제로 그렇게 굳었다. 필요해지면 되살린다.
 */
export function DottedRow({
  children,
  tone = "default",
  align = "center",
  hover = false,
  className = "",
}: {
  children: React.ReactNode;
  tone?: "default" | "news";
  align?: "center" | "start" | "baseline";
  hover?: boolean;
  className?: string;
}) {
  const border =
    tone === "news" ? "border-line-25" : "border-line-22";
  const items =
    align === "start"
      ? "items-start"
      : align === "baseline"
        ? "items-baseline"
        : "items-center";
  return (
    <div
      className={`flex border-b border-dotted ${border} ${items} ${
        hover ? "hover:bg-surface-hover" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
