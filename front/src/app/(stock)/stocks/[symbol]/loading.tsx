import { Skeleton, SkeletonScreen } from "@/shared/components/feedback";

/**
 * 2a 레이아웃 골격 그대로. 로드 완료 시 자리가 튀지 않는다.
 *
 * 조각 폭도 실제 화면과 같이 반응형이어야 한다 — 고정 px 로 두면 375px 에서
 * 골격이 뷰포트를 넘겨, 정작 로딩 중에만 가로 스크롤이 생긴다.
 */
export default function StockDetailLoading() {
  return (
    // 컨테이너 폭·패딩을 EditorialView 와 똑같이 둔다 — 다르면 로드 완료 순간 화면이 튄다.
    <main className="mx-auto w-full max-w-shell px-4 pb-[30px] pt-[26px] md:px-8">
      <SkeletonScreen label="종목 정보를 불러오는 중입니다">
        <div className="flex flex-col gap-5">
          <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton w="min(220px, 100%)" h={22} i={0} />
              <Skeleton w="min(300px, 100%)" h={10} i={1} />
            </div>
            {/* 마스트헤드 우측 검색·액션은 모바일에서 숨는다.
                Skeleton 자체가 `block` 을 갖고 있어 hidden 을 덧붙이면 어느 쪽이
                이길지 불확실하므로 래퍼로 감춘다. */}
            <span className="hidden md:block">
              <Skeleton w={380} h={36} i={2} />
            </span>
          </div>

          {/* 헤드라인 — 모바일 세로 스택 / 데스크탑 좌우.
              Skeleton 은 height 를 인라인 style 로 박으므로 반응형 높이는
              래퍼 div 가 정하고 조각은 h="100%" 로 채운다 (클래스로는 못 이긴다). */}
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="h-[32px] md:h-[46px]">
                <Skeleton w="min(260px, 80%)" h="100%" i={0} />
              </div>
              <Skeleton w="min(220px, 65%)" h={14} i={1} />
              <Skeleton w="min(240px, 70%)" h={18} i={2} />
            </div>
            <div className="flex flex-col gap-1.5 md:items-end">
              <div className="h-[34px] w-full md:h-[44px]">
                <Skeleton w="min(210px, 60%)" h="100%" i={0} />
              </div>
              <Skeleton w="min(130px, 40%)" h={15} i={1} />
            </div>
          </div>

          <div className="grid items-start gap-7 md:grid-cols-[1fr_292px]">
            <div className="flex min-w-0 flex-col gap-3.5">
              <Skeleton w="min(240px, 70%)" h={12} i={0} />
              {/* 차트는 모바일에서 풀블리드 220px */}
              <div className="-mx-4 h-[220px] md:mx-0 md:h-[344px] md:max-w-[748px]">
                <Skeleton w="100%" h="100%" i={1} />
              </div>
              <Skeleton w="min(320px, 100%)" h={20} i={2} />
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} w="100%" h={58} i={row} />
              ))}
            </div>
            <div className="flex min-w-0 flex-col gap-[18px]">
              <Skeleton w="100%" h={220} i={0} />
              <Skeleton w="100%" h={130} i={1} />
              <Skeleton w="100%" h={150} i={2} />
            </div>
          </div>
        </div>
      </SkeletonScreen>
    </main>
  );
}
