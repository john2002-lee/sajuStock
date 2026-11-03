import { Skeleton, SkeletonScreen } from "@/shared/components/feedback";

/**
 * 종목 탐색 골격. 제호(검색·토글·액션) → 정체성(제목·모집단) → 필터 바 → 목록 행.
 *
 * 실제 화면과 **같은 브레이크포인트**를 쓴다. 골격이 한 벌뿐이면 데이터가 도착하는
 * 순간 데스크탑에서 레이아웃이 통째로 튄다 — 필터 바가 md 부터 한 줄이 되는 것까지 맞춘다.
 */
export default function StockBrowseLoading() {
  return (
    <main className="mx-auto w-full max-w-shell px-4 pb-28 pt-[26px] md:px-8 md:pb-[30px]">
      <SkeletonScreen label="종목 목록을 불러오는 중입니다">
        <div className="flex flex-col gap-4">
          {/* 제호 — 우측 덩어리는 검색 필드 + 토글 + 관심 종목 */}
          <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton w="min(220px, 100%)" h={22} i={0} />
              <Skeleton w="min(300px, 100%)" h={10} i={1} />
            </div>
            <span className="hidden items-center gap-2.5 md:flex">
              <Skeleton w={250} h={34} i={2} />
              <Skeleton w={34} h={34} i={0} />
              <Skeleton w={92} h={36} i={1} />
            </span>
          </div>

          {/* 정체성 — 제목 + 모집단 */}
          <div className="flex flex-col gap-[7px]">
            <Skeleton w={118} h={22} i={0} />
            <Skeleton w={150} h={10} i={1} />
          </div>

          {/* 필터 바 — 모바일 세로, md 부터 시장 좌 · 정렬 우 한 줄 */}
          <div className="flex flex-col gap-2.5 border-t border-line-20 pt-3.5 md:flex-row md:items-center md:justify-between md:gap-6">
            <div className="flex items-center gap-2.5">
              <Skeleton w={40} h={10} i={1} />
              {[0, 1, 2].map((chip) => (
                <Skeleton key={chip} w={64} h={34} i={chip} />
              ))}
            </div>
            <div className="flex items-center gap-2.5">
              <Skeleton w={40} h={10} i={1} />
              {[0, 1].map((chip) => (
                <Skeleton key={chip} w={82} h={34} i={chip} />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
              <Skeleton key={row} w="100%" h={44} i={row} />
            ))}
          </div>
        </div>
      </SkeletonScreen>
    </main>
  );
}
