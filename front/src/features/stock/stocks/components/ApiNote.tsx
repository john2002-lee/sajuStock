/**
 * 이 화면이 소비하는 백엔드 메서드. 개발 참고용이라 프로덕션에서는 제거 가능하다
 * (README "결과 그룹 헤더 우측 캡션"과 같은 성격).
 */
export function ApiNote({ notes }: { notes: string[] }) {
  return (
    <p
      className="num border-t border-line-20 pt-[9px] text-muted-45 text-10 leading-[1.6]"
    >
      {notes.join(" · ")}
    </p>
  );
}
