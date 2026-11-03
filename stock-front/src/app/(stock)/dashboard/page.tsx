import { loadWatchlist } from "@/app/_data/watchlist";
import { Card } from "@/shared/ui";
import { DashboardDetail } from "./_components/DashboardDetail";

/**
 * `/dashboard` — nav **맨 위 종목**의 상세를 그린다.
 *
 * 리다이렉트하지 않는다. `/dashboard/{첫코드}` 로 튕기면 주소가 사용자가 고르지도
 * 않은 종목으로 바뀌고, 모바일(상세를 안 쓰는 폭)에서도 코드가 붙은 주소를 갖게 된다.
 * 여기서 그냥 그리면 주소는 `/dashboard` 로 남는다.
 *
 * 목록 조회는 레이아웃과 공유한다 — `loadWatchlist` 가 요청 단위로 캐시한다.
 *
 * `revalidate = 0` 을 쓴다(`force-dynamic` 이 아니다) — 레이아웃과 같은 이유로,
 * 동적 렌더는 강제하되 시장 데이터의 fetch 캐시는 무력화하지 않는다.
 */
export const revalidate = 0;

export default async function DashboardDefaultPage({
  searchParams,
}: {
  searchParams: Promise<{ ai?: string }>;
}) {
  const [watchlist, query] = await Promise.all([loadWatchlist(), searchParams]);
  const first = watchlist.items[0];

  if (!first) {
    return (
      // **`empty` 라벨을 지웠다.** 화면이 비어 있다는 것은 이미 보이고, 그 자리에
      // 영어 한 단어를 두면 "여기서 무엇을 하면 되는가" 를 말할 줄이 하나 줄어든다.
      // 대신 다음 동작을 구체적으로 적는다 — 이 화면은 담아 둔 것이 없으면
      // 아무것도 할 수 없어서, 안내가 곧 유일한 내용이다.
      <Card variant="empty">
        <p className="font-display font-bold leading-[1.35] text-20">
          담아 둔 종목이 여기 열립니다
        </p>
        <p className="max-w-sm text-muted-65 text-13 leading-relaxed">
          왼쪽 목록에서 고른 종목의 차트·재무·뉴스와 AI 판단이 이 자리에 함께 뜹니다.
        </p>
        <p className="num text-muted-45 text-12">
          ⌘K 로 검색을 열고 ⇥ 로 담습니다
        </p>
      </Card>
    );
  }

  return <DashboardDetail code={first.code} adviceOpen={query.ai === "1"} />;
}
