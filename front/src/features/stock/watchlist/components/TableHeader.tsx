import { WATCH_GRID } from "./grid";

const LABEL =
  "font-mono font-medium uppercase tracking-label-wide text-muted-50";

/**
 * 표 머리. WatchRow 와 같은 WATCH_GRID 를 써야 컬럼이 어긋나지 않는다.
 *
 * 첫 칸(선택 체크박스)에 `sr-only` 를 직접 걸면 안 된다 — `sr-only` 는
 * position:absolute 라 그리드 아이템이 배치에서 빠지고, 나머지 7개 라벨이
 * 한 칸씩 왼쪽으로 밀려 데이터와 전부 어긋난다. 칸을 차지하는 껍데기를
 * 남기고 그 안쪽 텍스트만 감춘다.
 *
 * 정렬은 대응하는 데이터 칸과 같아야 한다:
 * 현재가·등락률·보유·AI 는 우측, 3개월 스파크라인은 가운데, 종목·알림은 좌측.
 */
export function TableHeader() {
  return (
    <div
      role="row"
      className={`${WATCH_GRID} border-y border-line-20 py-[9px] text-10`}
    >
      <span role="columnheader">
        <span className="sr-only">선택</span>
      </span>
      <span role="columnheader" className={LABEL}>
        종목
      </span>
      <span role="columnheader" className={`${LABEL} text-right`}>
        현재가
      </span>
      <span role="columnheader" className={`${LABEL} text-right`}>
        등락률
      </span>
      <span role="columnheader" className={`${LABEL} text-center`}>
        3개월
      </span>
      <span role="columnheader" className={`${LABEL} text-right`}>
        보유 / 평단
      </span>
      <span role="columnheader" className={`${LABEL} pl-[18px]`}>
        알림 조건
      </span>
      <span role="columnheader" className={`${LABEL} text-right`}>
        AI 판단
      </span>
    </div>
  );
}
