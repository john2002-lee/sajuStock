import { Icon } from "@/shared/ui";
import {
  screenerAxes,
  screenerSortOptions,
  type ScreenerQuery,
} from "../../model/screener";
import { FilterChip } from "../table";
import { CONDITION_LABEL } from "./tokens";

export interface ScreenerFilterBarProps {
  /** 현재 URL 이 들고 있는 조건 */
  query: ScreenerQuery;
}

/**
 * 조건 검색의 조건 바 — 축 여섯(시장·시총·PER·PBR·배당·ROE) + 정렬 하나.
 *
 * **랭킹 필터 바와 다른 조판을 쓴다.** 그쪽은 축이 둘이라 한 줄에 들어가지만, 여기는
 * 여섯이다. 같은 가로 배열로 늘어놓으면 6줄이 되어 표가 첫 화면에서 사라진다.
 * 그래서 데스크탑에서 2열 격자로 접고, 각 축은 `라벨 | 칩들` 한 줄로 만든다.
 *
 * 정렬은 격자 밖 아래에 따로 둔다 — 나머지 여섯은 **모집단을 자르고** 정렬은
 * **순서만 바꾼다.** 같은 격자에 섞으면 일곱 번째 조건처럼 읽혀서, 정렬을 바꾸고
 * 결과 수가 달라지길 기대하게 된다 (랭킹 필터 바가 아이콘으로 그 구분을 주는 것과
 * 같은 문제를 배치로 푼다).
 *
 * 서버 컴포넌트다. 칩은 링크고 옵션 계산은 순수 함수(model/screener)라 이 바에서
 * 브라우저로 내려가는 JS 는 없다.
 */
export function ScreenerFilterBar({ query }: ScreenerFilterBarProps) {
  return (
    <section
      aria-label="검색 조건"
      className="flex flex-col gap-3 border-t border-line-20 pt-3.5"
    >
      <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 md:grid-cols-2">
        {screenerAxes(query).map((axis) => (
          <ConditionRow key={axis.key} label={axis.label} options={axis.options} />
        ))}
      </div>

      <div className="border-t border-dotted border-line-22 pt-3">
        <ConditionRow
          label="정렬"
          icon="sort-desc"
          options={screenerSortOptions(query)}
        />
      </div>
    </section>
  );
}

interface ConditionRowProps {
  label: string;
  icon?: "sort-desc";
  options: readonly { value: string; label: string; href: string; selected: boolean }[];
}

/**
 * 축 하나 — 라벨과 칩들.
 *
 * 라벨은 `aria-hidden` 이다. `role="group"` 이 같은 문자열을 `aria-label` 로 이미
 * 들고 있어, 그대로 두면 스크린리더가 "PER, PER, 10배 이하" 로 두 번 읽는다
 * (`FilterGroup` 과 같은 이유).
 *
 * 라벨에 `w-[68px]` 를 주는 것은 격자 안에서 **칩의 시작 위치를 맞추기** 위해서다.
 * 라벨 길이가 2~5자로 제각각이라(시장 · 배당수익률) 그대로 두면 여섯 줄의 칩이
 * 계단처럼 어긋나 훑기 어려워진다.
 */
function ConditionRow({ label, icon, options }: ConditionRowProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5"
    >
      <span
        aria-hidden
        className={`${CONDITION_LABEL} flex flex-none items-center gap-1.5 md:w-[68px] text-10`}
      >
        {icon ? <Icon name={icon} size={13} /> : null}
        {label}
      </span>

      <span className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <FilterChip
            key={option.value}
            href={option.href}
            label={option.label}
            selected={option.selected}
          />
        ))}
      </span>
    </div>
  );
}
