"use client";

import { Icon } from "@/shared/ui";

export interface SelectOrDragProps {
  /** '순서 편집' 모드인가. 참이면 드래그 핸들, 아니면 체크박스 */
  reordering: boolean;
  selected: boolean;
  onSelect: (next: boolean) => void;
  /** 스크린리더 문구에 쓰는 종목명 — "삼성전자 선택" · "삼성전자 순서 이동" */
  label: string;
  /** `useWatchRowDrag` 이 돌려준 것을 그대로 넘긴다 */
  handleProps: Record<string, unknown>;
  /** 감싸는 요소의 클래스. 히트 영역과 정렬은 행마다 달라서 호출부가 정한다 */
  className?: string;
  iconSize?: number;
}

/**
 * 행 맨 왼쪽의 **선택 체크박스 또는 드래그 핸들.**
 *
 * ## 왜 모드로 나뉘어 있나
 *
 * 26px 안에 컨트롤 둘을 겹쳐 넣을 수 없다. 그래서 '순서 편집' 을 켜면 체크박스가
 * 핸들로 **바뀐다** — 둘을 나란히 두면 좁은 폭에서 종목명이 그만큼 잘린다.
 *
 * ## 왜 공용인가 — 그리고 왜 클래스는 호출부가 주나
 *
 * 행 세 벌이 이 분기를 각자 적고 있었고, 안쪽은 글자 하나까지 같았다(13px 상자 ·
 * `accent-[var(--ink)]` · sr-only 라벨 · aria-label 문구). 반면 **감싸는 기하는
 * 셋이 다르다** — 표는 그리드 셀이라 히트 영역을 따로 잡지 않고, 작업대는 24px 폭에
 * 세로 가운데, 모바일 카드는 44px 정사각형을 위쪽에 붙인다. 그 차이는 각 행의
 * 레이아웃이 정하는 것이라 `className` 으로 받는다.
 *
 * 체크박스 상자는 13px 로 고정이다. 44px 은 **누를 수 있는 영역**이지 상자 크기가
 * 아니다 — 상자를 키우면 표에서 다른 컨트롤과 크기가 어긋난다.
 */
export function SelectOrDrag({
  reordering,
  selected,
  onSelect,
  label,
  handleProps,
  className,
  iconSize = 15,
}: SelectOrDragProps) {
  if (reordering) {
    return (
      <button
        type="button"
        {...handleProps}
        aria-label={`${label} 순서 이동`}
        className={`cursor-grab text-muted-30 active:cursor-grabbing ${className ?? ""}`}
      >
        <Icon name="drag" size={iconSize} />
      </button>
    );
  }

  return (
    <label className={`cursor-pointer ${className ?? ""}`}>
      <span className="sr-only">{label} 선택</span>
      <input
        type="checkbox"
        checked={selected}
        onChange={(event) => onSelect(event.target.checked)}
        className="h-[13px] w-[13px] flex-none accent-[var(--ink)]"
      />
    </label>
  );
}
