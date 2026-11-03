import { Skeleton, SkeletonScreen } from "@/shared/components/feedback";
import { DetailSkeleton } from "./DetailSkeleton";

/**
 * 대시보드 골격 — 목록 조회가 끝나기 전. 레이아웃의 `Suspense` 가 쓴다.
 *
 * **실제 화면과 같은 앱 셸이어야 한다.** 사이드바가 `fixed` 로 뷰포트 왼쪽에 붙고
 * 본문이 `md:pl-[320px]` 로 밀려 있는데, 골격이 중앙 정렬 한 덩어리면 채워지는 순간
 * 화면이 통째로 왼쪽으로 튄다.
 */
export function BoardSkeleton() {
  return (
    <SkeletonScreen label="관심 종목을 불러오는 중입니다">
      {/* 사이드바 — 제목 2줄 · 버튼 2+1 · 정렬 줄 · 그룹 칩 · 목록.
          제호는 여기 없다 (상단 바의 `Masthead` 가 든다). */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-20 md:flex md:w-[320px] md:flex-col md:border-r-2 md:border-ink md:bg-surface">
        <div className="flex flex-none flex-col gap-3 border-b border-line-25 px-4 pb-3 pt-5">
          <Skeleton w="min(150px, 100%)" h={18} i={1} />
          <Skeleton w="min(190px, 100%)" h={10} i={2} />
          <div className="flex gap-1.5">
            <Skeleton w="50%" h={28} i={3} />
            <Skeleton w="50%" h={28} i={4} />
          </div>
          <Skeleton w="100%" h={30} i={0} />
          <div className="flex items-center justify-between gap-2">
            <Skeleton w={72} h={22} i={1} />
            <Skeleton w={140} h={14} i={2} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[0, 1, 2, 3].map((chip) => (
              <Skeleton key={chip} w={66} h={28} i={chip} />
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col px-2 pb-5">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
            <div
              key={row}
              className="flex gap-1.5 border-b border-dotted border-line-22 px-1.5 py-2"
            >
              <Skeleton w={13} h={13} i={row} className="mt-1" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <Skeleton w="55%" h={15} i={row} />
                  <Skeleton w={50} h={12} i={row + 1} className="ml-auto" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton w="40%" h={9} i={row + 1} />
                  <Skeleton w={48} h={16} i={row + 2} className="ml-auto" />
                  <Skeleton w={36} h={11} i={row} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="md:pl-[320px]">
        <main className="mx-auto flex w-full max-w-shell flex-col gap-5 px-4 pb-40 pt-[26px] md:px-8 md:pb-[30px]">
          {/* 상단 바 — 제호(위) + 기준 시각(아래) + 전역 컨트롤. `Masthead` 와 같은 형태 */}
          <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton w="min(220px, 100%)" h={22} i={0} />
              <Skeleton w="min(300px, 100%)" h={10} i={1} />
            </div>
            <Skeleton w={220} h={34} i={2} />
          </div>

          {/* 모바일 제목 줄 — 데스크탑에서는 사이드바가 대신한다 */}
          <div className="flex flex-col gap-4 md:hidden">
            <div className="flex items-end justify-between gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton w="min(180px, 100%)" h={19} i={0} />
                <Skeleton w="min(240px, 100%)" h={10} i={1} />
              </div>
              <Skeleton w={110} h={32} i={2} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[0, 1, 2, 3, 4].map((chip) => (
                <Skeleton key={chip} w={72} h={31} i={chip} />
              ))}
            </div>
          </div>

          <div className="hidden md:block">
            <DetailSkeleton />
          </div>
        </main>
      </div>
    </SkeletonScreen>
  );
}
