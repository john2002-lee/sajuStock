"use client";

/**
 * 왼쪽 사이드바의 **껍데기**. 관심 종목 목록이 여기 담긴다.
 *
 * ## 왜 셸만 빼는가
 *
 * 이 자리에 필요한 값은 열일곱 개가 넘는다(집계·정렬·그룹·선택·AI 진행·핸들러들).
 * 전부 프롭으로 넘기면 조립하는 쪽보다 시그니처가 길어져 읽기가 더 나빠진다.
 * 그래서 **내용은 슬롯으로 받고 배치 지식만** 가져왔다 — 아래 주석들이 그 지식이고,
 * 실제로 두 번 잘못 만들어 본 끝에 남은 것이다.
 *
 * ## 뷰포트 왼쪽 끝에 붙고 전체 높이를 쓴다
 *
 * `fixed inset-y-0 left-0` 이라 중앙 정렬 컨테이너 밖이다. 그래서 넓은 화면에서
 * 사이드바 왼쪽에 여백이 생기지 않는다 — 앞선 두 번의 시도가 `max-w-shell` 안쪽
 * 격자였던 탓에 화면 왼쪽 끝과 사이드바 사이가 비어 있었고, 그게 "아예 왼쪽으로"
 * 가 아니었던 이유다.
 *
 * **제호는 여기 없다.** 상단 바의 기준 시각 위에 있다(`layout.tsx` 의 `Masthead`).
 * 한때 이 자리에 뒀는데 320px 에 24px 제호가 안 들어가 오른쪽 본문 위로 삐져나갔고,
 * 무엇보다 서비스명이 화면마다 다른 자리에 있으면 안 된다.
 *
 * 머리(제목·버튼·필터)는 붙박이고 **목록만 스크롤한다** — 통째로 스크롤하면 종목을
 * 고르러 내려간 사이 그룹 탭과 정렬이 화면 밖으로 나간다.
 */
export function WatchlistRail({
  head,
  children,
}: {
  /** 제목·버튼·정렬·그룹 탭 — 스크롤하지 않는 머리 */
  head: React.ReactNode;
  /** 종목 목록 — 이 안만 스크롤한다 */
  children: React.ReactNode;
}) {
  return (
    <aside
      aria-label="관심 종목"
      className="hidden md:fixed md:inset-y-0 md:left-0 md:z-20 md:flex md:w-[320px] md:flex-col md:border-r-2 md:border-ink md:bg-surface"
    >
      <div className="flex flex-none flex-col gap-3 border-b border-line-25 px-4 pb-3 pt-5">
        {head}
      </div>

      {/* `min-h-0` 이 없으면 flex 아이템의 기본 최소 높이 때문에 목록이 사이드바를
          밀어내고, 스크롤이 여기가 아니라 페이지에 생긴다. `overscroll-contain` 은
          목록 끝에서 페이지로 스크롤이 넘어가는 것을 막는다. */}
      <nav
        aria-label="담아 둔 종목"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2 pb-5"
      >
        {children}
      </nav>
    </aside>
  );
}
