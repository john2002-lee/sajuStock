/** 중앙 열 하단은 API 메서드 노트만 남는다 — UNIVERSE 는 좌측 레일에 있다 */
export function ConsoleFooter({ notes }: { notes: string[] }) {
  return (
    <footer className="mt-auto border-t border-line-14 px-5 py-3.5">
      <span
        className="num text-muted-45 text-10 leading-[1.6]"
      >
        {notes.join(" / ")}
      </span>
    </footer>
  );
}
