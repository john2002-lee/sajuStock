import { Skeleton, SkeletonScreen } from "@/shared/components/feedback";

/**
 * 루트 골격 — **서비스를 모르는 최소 셸**이다.
 *
 * 예전에는 이 자리에 시장 현황 골격(지수 4카드 → 등락 상위 2열)이 있었다. 루트
 * `loading.tsx` 는 더 가까운 경계가 없는 **모든** 라우트의 폴백이라, 대시보드나
 * 로그인으로 이동할 때도 홈 골격이 잠깐 떴다 — 가려던 곳과 다른 화면을 보여 주는
 * 셈이었다(`(stock)/dashboard/layout.tsx` 주석이 그 문제를 적어 두고 있다).
 *
 * 서비스가 둘로 갈리면서 그 골격은 제 자리를 찾아갔다 —
 * [`(stock)/stock/loading.tsx`](<./(stock)/stock/loading.tsx>). 여기 남은 것은
 * 제호 한 줄과 본문 블록 몇 개뿐이고, 어느 서비스로 가는 중이든 틀리지 않는다.
 *
 * **비워 두지는 않는다.** 이 파일이 만드는 Suspense 경계에 기대는 코드가 있다 —
 * `proxy.ts` 가 대시보드·관리자 요청을 렌더 전에 끊는 이유가 "셸이 먼저 흘러나가
 * 페이지의 `redirect()` 가 meta refresh 로 내려간다" 이고, 그 전제가 바로 이 경계다.
 */
export default function RootLoading() {
  return (
    <main className="mx-auto w-full max-w-shell px-4 pb-28 pt-[26px] md:px-8 md:pb-[30px]">
      <SkeletonScreen label="불러오는 중입니다">
        <div className="flex flex-col gap-[22px]">
          {/* 제호 — 전 화면이 공유하는 유일한 구조물이라 여기만 실제와 같다 */}
          <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton w="min(220px, 100%)" h={22} i={0} />
              <Skeleton w="min(300px, 100%)" h={10} i={1} />
            </div>
            <span className="hidden md:block">
              <Skeleton w={220} h={36} i={2} />
            </span>
          </div>

          {/* 본문은 모양을 흉내 내지 않는다 — 어떤 화면이 올지 모르기 때문이다 */}
          <Skeleton w="min(320px, 100%)" h={18} i={0} />
          <Skeleton w="100%" h={180} i={1} />
          <Skeleton w="100%" h={120} i={2} />
        </div>
      </SkeletonScreen>
    </main>
  );
}
