import { Icon, type IconName } from "@/shared/ui";
import type { FilterOption } from "../../model/filters";
import { FilterChip } from "../table";
import { FILTER_LABEL } from "./tokens";

export interface FilterGroupProps<Value extends string> {
  /** 이 그룹이 바꾸는 축 ("시장" · "정렬") */
  label: string;
  icon: IconName;
  options: readonly FilterOption<Value>[];
}

/**
 * 축 라벨 + 칩 한 묶음. 시장·정렬이 같은 컴포넌트를 값만 바꿔 쓴다.
 *
 * **라벨이 눈에 보여야 하는 이유.** 두 그룹은 칩 모양이 완전히 같은데 바꾸는 축이
 * 다르다 — 하나는 모집단을 자르고 하나는 순서를 바꾼다. 라벨 없이 다섯 개를 한 줄에
 * 늘어놓으면 같은 종류의 버튼으로 읽혀서, 코스피를 누르고 정렬이 바뀌길 기대하게 된다.
 * 아이콘(필터/정렬)은 그 구분을 글자를 읽기 전에 준다.
 *
 * 라벨은 `aria-hidden` 이다 — `role="group"` 이 같은 문자열을 `aria-label` 로 이미
 * 들고 있어, 그대로 두면 스크린리더가 "시장, 시장, 전체" 로 두 번 읽는다.
 *
 * `Value` 를 제네릭으로 남겨 두면 시장 그룹에 정렬 옵션을 넘기는 실수가 타입 에러가
 * 된다 — 둘 다 `{label, href, selected}` 구조라 string 으로 뭉개면 컴파일러가 못 잡는다.
 */
export function FilterGroup<Value extends string>({
  label,
  icon,
  options,
}: FilterGroupProps<Value>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5"
    >
      <span aria-hidden className={FILTER_LABEL}>
        <Icon name={icon} size={13} />
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
