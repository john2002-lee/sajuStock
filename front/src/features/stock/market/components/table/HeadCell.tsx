import { Icon } from "@/shared/ui";
import { TABLE_HEAD } from "./tokens";

export interface HeadCellProps {
  label: string;
  align?: "left" | "right";
  /** 이 열이 목록의 순서를 만들었다면 그 방향. 아니면 넘기지 않는다 */
  sorted?: "asc" | "desc";
}

/**
 * 표 머리 셀 하나. 정렬 기준 열에만 방향 표식이 붙는다.
 *
 * **방향을 boolean 이 아니라 `"asc" | "desc"` 로 받는다.** 랭킹 표는 전부 내림차순이라
 * 예전에는 boolean 하나로 충분했지만, 조건 검색은 축이 방향을 정한다 — 시가총액·
 * 배당수익률·ROE 는 큰 값이, PER·PBR 은 작은 값이 위로 온다. 캐럿이 항상 아래를
 * 가리키면 'PER 낮은 순' 목록에 "내림차순" 이라고 써 붙이는 셈이고, `aria-sort` 는
 * 그 거짓을 스크린리더에까지 전한다.
 *
 * 그래서 두 벌이던 이 컴포넌트 중 **넓은 쪽을 남겼다.** 좁은 쪽(boolean)은 넓은 쪽으로
 * 표현되지만 그 반대는 안 된다 — 랭킹 표는 `"desc"` 를 넘긴다.
 *
 * `sr-only` 를 쓰지 않는다 — 이 셀들은 그리드 아이템이라 `position:absolute` 가 되면
 * 그리드에서 빠지고 나머지 열이 한 칸씩 밀린다 (`browse/RankingTable` 주석).
 */
export function HeadCell({ label, align = "left", sorted }: HeadCellProps) {
  return (
    <span
      role="columnheader"
      aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined}
      className={`${TABLE_HEAD} flex items-center gap-0.5 ${
        align === "right" ? "justify-end" : ""
      } ${sorted ? "text-ink" : "text-muted-50"}`}
    >
      {label}
      {sorted ? <Icon name={sorted === "asc" ? "caret-up" : "caret-down"} size={12} /> : null}
    </span>
  );
}
