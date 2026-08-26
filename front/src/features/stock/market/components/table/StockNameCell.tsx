export interface StockNameCellProps {
  name: string;
  /** 이름 아래 한 줄. 보통 `코드 · 시장` 이고, 화면에 따라 뒤에 뭔가 더 붙는다 */
  meta: string;
  /** 그리드 셀로 놓일 때 `role="cell"` 을 받는다. 좁은 목록에서는 생략한다 */
  asCell?: boolean;
}

/**
 * 종목 이름 + 그 아래 한 줄. **네 곳이 글자 하나까지 같았다** —
 * 랭킹 표 행 · 조건 검색 표 행 · 랭킹 카드 · 조건 검색 카드.
 *
 * `truncate` 와 `min-w-0` 이 한 벌이다. 부모가 flex/grid 아이템일 때
 * `min-width:auto` 가 기본이라, `min-w-0` 없이 `truncate` 만 주면 긴 종목명이
 * 잘리지 않고 **옆 열을 밀어낸다.** 복사해 갈 때 이 한 줄이 빠지면 넓은 화면에서는
 * 멀쩡하고 좁은 화면에서만 표가 깨져서 늦게 발견된다.
 *
 * 이름은 명조(`font-display`), 아래 줄은 고정폭(`num`)이다. 코드·시총 같은 숫자가
 * 섞이는 줄이라 자릿수가 흔들리면 목록 전체가 들썩인다.
 */
export function StockNameCell({ name, meta, asCell = false }: StockNameCellProps) {
  return (
    <span
      role={asCell ? "cell" : undefined}
      className={`flex min-w-0 flex-col gap-0.5 ${asCell ? "" : "flex-1"}`}
    >
      <span className="truncate font-display font-medium text-14">{name}</span>
      <span className="num truncate text-muted-45 text-10">{meta}</span>
    </span>
  );
}
