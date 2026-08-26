export interface TableShellProps {
  /** 스크린리더가 읽을 표 이름 — "종목 순위" · "조건 검색 결과" */
  label: string;
  /** 본문 행 수. `aria-rowcount` 는 머리 행을 포함하므로 여기에 1 을 더한다 */
  rowCount: number;
  /** 데스크탑 그리드 — 머리 행 + 본문 행들 */
  desktop: React.ReactNode;
  /** 모바일 목록 — `StockListRow` 들. `<li>` 는 여기서 감싼다 */
  mobile: React.ReactNode;
}

/**
 * 표 하나의 **껍데기**. 데스크탑 그리드와 모바일 목록을 브레이크포인트로 가른다.
 *
 * 랭킹 표와 조건 검색 표가 이 스무 줄을 각자 들고 있었다. 안에 들어가는 행은
 * 서로 다르지만(열이 다르다 — 각 `tokens.ts`), **가르는 방식은 같아야 한다.**
 *
 * `<table>` 이 아니라 CSS 그리드 + ARIA 인 이유: 진짜 표 요소로는 여러 열 중 일부만
 * 다른 폭으로 접는 반응형을 만들 수 없다. 그 대가로 지켜야 할 것이 하나 있다 —
 * **`sr-only` 를 그리드 아이템에 직접 주면 안 된다.** `position:absolute` 가 되어
 * 그리드에서 빠지고 나머지 열이 한 칸씩 밀린다.
 *
 * 두 벌을 다 렌더한다(하나는 `hidden`). 서버는 뷰포트를 모르므로 CSS 로만 가를 수
 * 있고, 행 데이터는 이미 손에 있어 상류 비용이 늘지 않는다.
 */
export function TableShell({ label, rowCount, desktop, mobile }: TableShellProps) {
  return (
    <>
      <div
        role="table"
        aria-label={label}
        aria-rowcount={rowCount + 1}
        className="hidden md:block"
      >
        {desktop}
      </div>

      <ol className="flex flex-col md:hidden">{mobile}</ol>
    </>
  );
}
