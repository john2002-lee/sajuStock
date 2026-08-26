import { Skeleton } from "@/shared/components/feedback";

/**
 * 오른쪽 상세 칸의 골격. `StockDetailBody variant="flow"` 와 같은 순서다 —
 * 헤드라인 → 액션 → 차트 → 지표 2칸 → 탭. 순서가 다르면 채워질 때 자리가 튄다.
 */
export function DetailSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton w="min(280px, 100%)" h={44} i={0} />
          <Skeleton w={140} h={14} i={1} />
          <div className="mt-0.5 flex gap-1.5">
            <Skeleton w={74} h={20} i={2} />
            <Skeleton w={62} h={20} i={3} />
          </div>
        </div>
        <div className="flex flex-none flex-col items-end gap-1.5">
          <Skeleton w={170} h={42} i={0} />
          <Skeleton w={110} h={14} i={1} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Skeleton w={78} h={30} i={0} />
        <Skeleton w={78} h={30} i={1} />
        <Skeleton w={96} h={30} i={2} />
      </div>

      <div className="flex flex-col gap-3.5">
        <Skeleton w={220} h={12} i={0} />
        <Skeleton w="100%" h={344} i={1} />
      </div>

      <div className="flex flex-wrap gap-4">
        {[0, 1].map((panel) => (
          <div
            key={panel}
            className="flex min-w-[240px] flex-1 flex-col gap-[11px] bg-surface px-4 pb-[18px] pt-4"
          >
            <Skeleton w={80} h={11} i={panel} />
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} w="100%" h={13} i={row} />
            ))}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-4 border-b border-line-20 pb-2.5">
          {[92, 132, 46].map((w, i) => (
            <Skeleton key={w} w={w} h={13} i={i} />
          ))}
        </div>
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex flex-col gap-1.5 py-1">
            <Skeleton w="85%" h={15} i={row} />
            <Skeleton w="40%" h={10} i={row + 1} />
          </div>
        ))}
      </div>
    </div>
  );
}
