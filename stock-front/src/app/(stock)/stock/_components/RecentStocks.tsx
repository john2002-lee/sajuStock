"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { useRecentSearches, type SuggestionResponse } from "@/features/stock/search";
import { bff } from "@/lib/http/browser";
import { SectionLabel } from "@/shared/ui";

/**
 * 서버에서는 `false`, 브라우저에서는 `true`.
 *
 * `useState(false)` + `useEffect(() => setMounted(true))` 로도 되지만 그건
 * `react-hooks/set-state-in-effect` 에 걸린다(실제로 걸렸다). 이쪽은 상태를 만들지
 * 않고 **렌더 환경 자체를 구독**하는 형태라 규칙과 다투지 않는다 — 구독할 것이 없어
 * `subscribe` 는 빈 해제 함수를 돌려준다.
 */
const NO_SUBSCRIBE = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    NO_SUBSCRIBE,
    () => true,
    () => false,
  );
}

/**
 * 홈의 **최근 본 종목**.
 *
 * ## 이미 쌓고 있던 것을 처음으로 보여준다
 *
 * `store/recentSearches` 는 검색 팔레트에서 종목을 고를 때마다 최대 5개를
 * `localStorage` 에 적어 왔는데, **그 값을 읽는 화면이 팔레트 하나뿐이었다.**
 * 입문 단계에는 관심종목에 담기 전에 여러 종목을 오가며 보게 되는데, 그때 돌아갈
 * 길이 없었다.
 *
 * ## 평소에는 요청을 만들지 않는다
 *
 * 팔레트는 코드를 자동완성 BFF 에 넘겨 이름을 받아 오지만(`useSuggestions`), 홈에서
 * 그러면 방문할 때마다 요청이 하나 더 붙는다. 그래서 담을 때 이미 알고 있던 **이름을
 * 스토어에 함께 적어 두고**(`names`) 여기서는 그대로 읽는다.
 *
 * 예외는 **이름을 모르는 코드가 있을 때 한 번**이다(아래 `useEffect`). `names` 가
 * 생기기 전에 담긴 항목이 그렇고, 받아 온 이름을 스토어에 적어 두므로 그다음부터는
 * 다시 묻지 않는다.
 *
 * 시세는 안 보여준다 — 낡은 값을 보여주느니 없는 편이 낫고, 이 블록의 일은 "돌아가기" 다.
 *
 * ## 하이드레이션 이후에만 그린다
 *
 * `localStorage` 는 서버에 없다. 첫 렌더에 그리면 서버 HTML(빈 목록)과 클라이언트
 * (복원된 목록)가 어긋나 하이드레이션이 깨진다. 한 프레임 늦춘다 — 이 블록은 보조
 * 정보라 늦게 나타나도 잃는 것이 없다.
 */
export function RecentStocks() {
  const { codes, names, learnNames, clear } = useRecentSearches();
  const hydrated = useHydrated();

  /**
   * 이름을 모르는 코드를 **한 번만** 물어본다.
   *
   * `names` 가 생기기 전에 담긴 항목은 이름이 없어서 코드로 대신 그려야 하는데,
   * 그러면 "005930 005930" 처럼 같은 값이 두 번 나온다. 폴백이 아니라 고장으로 보인다.
   *
   * 자동완성 BFF 가 `recent` 파라미터로 **코드를 표시명으로 바꿔 주는 일**을 이미 한다
   * (검색 팔레트가 쓰는 그 경로다). 빈 `q` 로 불러도 안전하다 — 본 검색은
   * `if (!query.trim()) return []` 로 즉시 빠지고 최근 그룹만 채워진다.
   *
   * 받은 이름은 스토어에 적어 두므로 **다음 방문부터는 요청이 없다.**
   */
  const unknown = hydrated ? codes.filter((code) => !names[code]) : [];
  const unknownKey = unknown.join(",");

  useEffect(() => {
    if (!unknownKey) return;
    const controller = new AbortController();

    bff
      .get<SuggestionResponse>("/api/stocks/suggestions", {
        query: { recent: unknownKey },
        signal: controller.signal,
      })
      .then((data) => {
        const items = data?.groups.find((group) => group.key === "recent")?.items;
        if (!items?.length) return;
        learnNames(Object.fromEntries(items.map((item) => [item.code, item.name])));
      })
      // 이름을 못 채워도 화면은 코드로 선다. 홈이 이것 때문에 깨질 이유가 없다.
      .catch(() => {});

    return () => controller.abort();
  }, [unknownKey, learnNames]);

  if (!hydrated || codes.length === 0) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <SectionLabel
        variant="panel"
        right={
          <button type="button" onClick={clear} className="hover:text-ink">
            지우기
          </button>
        }
      >
        최근 본 종목
      </SectionLabel>

      <div className="flex flex-wrap gap-1.5">
        {codes.map((code) => (
          <Link
            key={code}
            href={`/stocks/${code}`}
            className="flex min-h-[var(--tap)] items-center gap-2 border border-line-28 px-3 py-2 hover:bg-surface md:min-h-0"
          >
            <span className="font-display font-medium text-14">
              {/* 위 `useEffect` 가 이름을 채우기 전 한 프레임 동안만 코드가 보인다.
                  조회에 실패해도 여기까지 온다 — 빈 칸이나 '알 수 없음' 보다 누를 수
                  있는 값이 낫다. */}
              {names[code] ?? code}
            </span>
            {/* 이름을 아직 모르면 코드가 두 번 나온다. 그때는 아래를 접는다 —
                "005930 005930" 은 폴백이 아니라 고장으로 읽힌다. */}
            {names[code] ? (
              <span className="num font-mono text-muted-45 text-10">
                {code}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
