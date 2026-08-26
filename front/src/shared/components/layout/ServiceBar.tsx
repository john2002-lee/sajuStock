import Link from "next/link";
import { Icon } from "@/shared/ui";

/** 탭 하나의 히트 영역 44×44 (WCAG 2.5.5). `MobileTabBar` 와 같은 규격이다 —
 *  라벨 크기(`text-10`)를 여기 두는 것도 그쪽과 같은 이유다. */
const ITEM =
  "flex min-h-[var(--tap)] min-w-[var(--tap)] flex-col items-center justify-center gap-1 text-10";

/**
 * 모바일(<768) 하단 서비스 바 — **칸이 셋뿐인 탭바**다.
 *
 * ## `MobileTabBar` 와 무엇이 다른가
 *
 * `MobileTabBar` 는 주식 서비스 안에서 움직이는 바다 — 시장·검색·탐색·대시보드가
 * 전부 종목 화면이고, 검색 칸은 ⌘K 종목 팔레트를 연다. 사주 화면이 그 바를 그대로
 * 쓰고 있었던 것이 문제였다. `current` 를 주지 않아 아무 칸도 켜지지 않게 해 두긴
 * 했지만, **여기 없는 기능(종목 검색·랭킹)을 하단에 상시 광고하는** 상태는 그대로였다.
 *
 * 사주 화면에서 하단에 있어야 할 것은 "다른 종목 찾기" 가 아니라 **여기서 나가는
 * 길**이다. 그래서 칸이 셋이다 — 지금 있는 곳, 서비스 선택, 반대편 서비스.
 *
 * ## 세션을 읽지 않는다
 *
 * `MobileTabBar` 는 대시보드 칸 때문에 `currentUser()` 를 부른다(로그인 안 한
 * 사람에게 보여 주면 누를 때마다 로그인으로 튕기는 미끼가 된다). 여기 셋은 전부
 * 로그인과 무관한 주소라 세션을 볼 이유가 없고, 그래서 동기 컴포넌트다 —
 * 사주 온보딩은 익명 소유자 키로도 끝까지 돌아간다.
 *
 * 높이는 `--tabbar-h` 로 `MobileTabBar` 와 맞춘다. 두 바가 화면마다 다른 높이면
 * 본문 하단 여백(`pb-28`)을 화면별로 다시 계산해야 한다.
 */
export function ServiceBar({ current }: { current: "saju" }) {
  return (
    <nav
      aria-label="서비스 이동"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t-2 border-ink bg-paper px-2 pt-[11px] md:hidden"
      style={{
        minHeight: "var(--tabbar-h)",
        paddingBottom: "calc(21px + var(--safe-b))",
      }}
    >
      <Link
        href="/saju"
        aria-current={current === "saju" ? "page" : undefined}
        className={`${ITEM} ${current === "saju" ? "text-ink" : "text-muted-35"}`}
      >
        <Icon name="user" size={17} />
        사주
      </Link>

      <Link href="/" className={`${ITEM} text-muted-35`}>
        <Icon name="home" size={17} />
        서비스 선택
      </Link>

      <Link href="/stock" className={`${ITEM} text-muted-35`}>
        <Icon name="chart" size={17} />
        주식
      </Link>
    </nav>
  );
}
