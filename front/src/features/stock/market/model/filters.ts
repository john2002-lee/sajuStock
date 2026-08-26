/**
 * 필터·조건 칩이 공유하는 모양.
 *
 * `ranking.ts` 의 `RankingFilterOption` 과 `screener.ts` 의 `ScreenerFilterOption` 이
 * 같은 네 필드를 각자 선언하고 있었고, 뒤쪽 주석은 그 사실을 **"`RankingFilterOption`
 * 과 같은 모양"** 이라고 적어 두기까지 했다. 같은 모양임을 주석으로 약속하면 그
 * 약속을 컴파일러가 지켜 주지 않는다 — 한쪽에 필드가 하나 늘어도 아무 일도 일어나지
 * 않고, 그 칩을 그리는 `FilterChip` 은 두 타입 중 하나만 만족시켜도 통과한다.
 *
 * 여기 한 벌만 둔다. 두 모듈은 이것을 자기 이름으로 별칭해 내보내므로 기존 호출부는
 * 그대로다 — 축(시장·PER·정렬)마다 부르는 이름이 다른 것은 그 자체로 정보다.
 */
export interface FilterOption<Value extends string> {
  /** 이 칩이 고르는 값. 같은 축의 다른 칩과 겹치지 않는다 (React key 로도 쓴다) */
  value: Value;
  label: string;
  /** 이 칩을 눌렀을 때 갈 주소. 다른 축의 현재 선택은 유지된다 */
  href: string;
  selected: boolean;
}
