"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * 관심종목 행의 **드래그 정렬 배선**.
 *
 * 행이 세 벌(`WatchRow` 표 · `WatchRowCompact` 작업대 · `WatchCard` 모바일)인데
 * 셋 다 이 여섯 줄을 똑같이 들고 있었다. **레이아웃은 진짜로 다르지만 배선은 같다**
 * — 그래서 합치는 것은 행이 아니라 이쪽이다.
 *
 * `disabled: !reordering` 이 요점이다. '순서 편집' 모드가 아닐 때는 센서를 아예
 * 붙이지 않으므로, 평소에 행을 눌러 스크롤하거나 링크를 여는 동작이 드래그로
 * 오인되지 않는다.
 *
 * `style` 을 그대로 돌려주는 이유: `transform` 은 매 프레임 바뀌는 값이라 클래스로
 * 표현할 수 없다 — 인라인이 맞는 자리다(P0 이 인라인 style 을 걷어내면서도 이런
 * 동적 값은 남긴 것과 같은 판단).
 */
export function useWatchRowDrag(code: string, reordering: boolean) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: code, disabled: !reordering });

  return {
    setNodeRef,
    isDragging,
    style: { transform: CSS.Transform.toString(transform), transition },
    /** 드래그 핸들 버튼에 그대로 펼쳐 넣는다 */
    handleProps: { ...attributes, ...listeners },
  };
}
