import Link from "next/link";
import { currentUser } from "@/auth";
import { Icon } from "@/shared/ui";

/** 각 탭은 44×44 히트 영역을 갖는다 (WCAG 2.5.5). 라벨 10px + 아이콘 15px 는 그대로다.
 *  라벨 크기가 여기 있는 이유: 칸 셋이 같은 값을 각자 인라인으로 들고 있었는데,
 *  이 바는 높이가 `--tabbar-h` 로 고정이라 한 칸만 커져도 정렬이 어긋난다. */
const ITEM =
  "flex min-h-[var(--tap)] min-w-[var(--tap)] flex-col items-center justify-center gap-1 text-10";

/**
 * 모바일(<768) 하단 탭바. 패딩 11px 12px 22px (README 1절).
 *
 * 높이는 --tabbar-h 로 고정한다. 관심종목(4b)처럼 이 위에 액션 바를 하나 더
 * 얹는 화면이 그 값만큼 띄워야 겹치지 않는다 — 두 요소가 서로를 모른 채
 * 각자 bottom-0 을 잡으면 정확히 포개진다.
 *
 * 검색 트리거는 features/search 소유라 슬롯으로 받는다.
 *
 * ## 칸이 바뀌어 온 경위
 *
 * 넷째 자리는 원래 AI 안내용 비활성 칸이었다. 누를 수 없는데다 `title` 툴팁은
 * 터치에서 보이지 않아 사실상 죽은 자리였고, AI 는 종목을 고른 뒤에만 의미가 있어
 * 탭바에서 잃을 것이 없었다 — 종목 탐색으로 바꿨다.
 *
 * 대시보드가 생기면서 하나가 더 붙어 다섯이 됐다가, **관심 칸이 빠져 다시 넷이
 * 됐다.** 관심종목 화면이 대시보드로 합쳐져 `/watchlist` 가 그쪽으로 리다이렉트되기
 * 때문이다 — 같은 곳으로 가는 칸을 둘 둘 이유가 없다.
 *
 * 대시보드가 첫 자리인 것은 로그인하면 도착하는 화면이어서다. 그러면서 시장 칸의
 * 라벨을 **홈 → 시장**으로 바꿨다. 대시보드와 홈이 나란히 서면 둘 다 "첫 화면" 으로
 * 읽혀 무엇이 다른지 알 수 없다. 하나는 내 현황이고 하나는 시장이라 이름이 그
 * 차이를 말해야 한다.
 *
 * ## 이 바는 **주식 서비스 전용**이다
 *
 * 네 칸이 전부 종목 화면이고 검색 칸은 종목 팔레트를 연다. 서비스가 둘로 갈리기
 * 전에는 사주 화면도 이 바를 썼는데, 거기서는 없는 기능을 하단에 광고하는 셈이었다
 * — 지금 사주 쪽은 `ServiceBar` 를 쓴다.
 *
 * 시장 칸이 `/` 가 아니라 **`/stock`** 인 것도 같은 분리의 결과다. `/` 는 서비스
 * 선택 화면이 됐고, 시장 현황은 주식 서비스의 홈으로 내려갔다. 서비스 선택으로
 * 돌아가는 길은 푸터가 든다 — 탭바에 칸을 하나 더 만들면 자주 쓰지 않는 이동이
 * 매일 쓰는 넷과 같은 크기로 서게 된다.
 *
 * ## 대시보드 칸은 로그인했을 때만 뜬다 — 그래서 세 칸이 되기도 한다
 *
 * `/dashboard` 는 신원을 요구하는 유일한 화면이라, 로그인하지 않은 사람에게 이 칸을
 * 보여 주면 **누를 때마다 로그인으로 튕기는 미끼**가 된다. 막을 곳이 화면 하나면
 * 입구도 같이 닫아야 앞뒤가 맞는다.
 *
 * 세션을 여기서 직접 읽는다 — 이 컴포넌트를 쓰는 화면들이 각자 `showDashboard` 를
 * 계산해 내려보내는 것보다 낫고, `currentUser` 가 요청 단위로 캐시되므로
 * 제호(`AccountMenu`)가 이미 읽은 값을 그대로 받는다 (`auth.ts`).
 */
export async function MobileTabBar({
  current,
  search,
}: {
  /** 생략하면 어느 탭도 활성이 아니다 — 404 처럼 탭 어디에도 속하지 않는 화면용 */
  current?: "dashboard" | "market" | "stocks";
  search: React.ReactNode;
}) {
  const signedIn = Boolean(await currentUser());

  return (
    <nav
      aria-label="주요 화면"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t-2 border-ink bg-paper px-2 pt-[11px] md:hidden"
      style={{
        minHeight: "var(--tabbar-h)",
        paddingBottom: "calc(21px + var(--safe-b))",
      }}
    >
      {signedIn ? (
        <Link
          href="/dashboard"
          aria-current={current === "dashboard" ? "page" : undefined}
          className={`${ITEM} ${current === "dashboard" ? "text-ink" : "text-muted-35"}`}
        >
          <Icon name="chart" size={17} />
          대시보드
        </Link>
      ) : null}

      <Link
        href="/stock"
        aria-current={current === "market" ? "page" : undefined}
        className={`${ITEM} ${current === "market" ? "text-ink" : "text-muted-35"}`}
      >
        <Icon name="home" size={17} />
        시장
      </Link>

      {search}

      <Link
        href="/stocks"
        aria-current={current === "stocks" ? "page" : undefined}
        className={`${ITEM} ${current === "stocks" ? "text-ink" : "text-muted-35"}`}
      >
        <Icon name="compass" size={17} />
        탐색
      </Link>
    </nav>
  );
}
