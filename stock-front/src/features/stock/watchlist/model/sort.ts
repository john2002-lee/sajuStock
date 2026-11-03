import { returnPercent, type SortKey, type WatchItem } from "./types";

/** 그룹 탭의 '전체' — 이 값일 때는 필터를 걸지 않는다 */
export const ALL_GROUP = "전체";

/**
 * 그룹 필터 + 정렬을 적용한 표시용 목록.
 *
 * 화면(app/)이 아니라 도메인이 소유하는 이유: '평가손익 정렬'이 `returnPercent`
 * 규칙을 알아야 하고, 보유 정보가 없는 종목을 어디에 둘지도 도메인 판단이다.
 *
 * `sort === "order"` 는 **원본 순서를 그대로 돌려준다.** 사용자가 드래그로 만든
 * 순서가 곧 정렬이므로 여기서 손대면 안 된다. 호출부는 이 경우에만 드래그를
 * 허용한다 — 정렬이 걸린 상태에서 순서를 바꾸면 화면과 저장 순서가 어긋난다.
 *
 * 원본 배열은 변경하지 않는다 (정렬 전에 복사한다).
 */
export function visibleItems(
  items: WatchItem[],
  group: string,
  sort: SortKey,
): WatchItem[] {
  const filtered =
    group === ALL_GROUP ? items : items.filter((item) => item.group === group);

  if (sort === "order") return filtered;

  return [...filtered].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ko");
    if (sort === "change") return b.changePercent - a.changePercent;
    // 보유 정보가 없으면 평가손익을 낼 수 없다 — 맨 뒤로 보낸다.
    return (returnPercent(b) ?? -Infinity) - (returnPercent(a) ?? -Infinity);
  });
}
