/**
 * 관리자 화면 스켈레톤.
 *
 * 이 파일이 없으면 루트 `loading.tsx` 가 잡혀 **"시장 현황을 불러오는 중입니다"** 가
 * 뜬다 — 관리자 경로에서 홈 문구가 나오는 셈이고, 실제로 그렇게 렌더됐다.
 *
 * 관리자 화면은 백엔드 왕복이 둘(현황 + 감사 로그)이라 잠깐 비는 순간이 있다.
 * 그때 화면 구조를 미리 그려 두면 레이아웃이 튀지 않는다.
 */
export default function AdminLoading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex w-full max-w-shell flex-col gap-4 px-4 pb-[30px] pt-[26px] md:px-8"
    >
      <div className="h-[52px] animate-pulse border-b-2 border-ink" />
      <div className="h-[42px] w-[180px] animate-pulse bg-surface" />
      <div className="h-[30px] w-full animate-pulse border-b border-line-20" />

      <div className="flex flex-col gap-3 pt-2">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex flex-col gap-1.5">
            <div className="h-[14px] w-[160px] animate-pulse bg-surface" />
            <div className="h-[6px] w-full animate-pulse bg-surface" />
          </div>
        ))}
      </div>

      <span className="sr-only">관리자 화면을 불러오는 중입니다</span>
    </main>
  );
}
