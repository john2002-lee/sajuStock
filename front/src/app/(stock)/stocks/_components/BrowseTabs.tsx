import Link from "next/link";
import { segmented } from "@/shared/ui";

export type BrowseTab = "ranking" | "screener";

export interface BrowseTabsProps {
  current: BrowseTab;
}

const TABS: readonly { key: BrowseTab; label: string; href: string; hint: string }[] = [
  {
    key: "ranking",
    label: "랭킹",
    href: "/stocks",
    hint: "시가총액 상위 200종목의 시세",
  },
  {
    key: "screener",
    label: "조건 검색",
    href: "/stocks/screener",
    hint: "상장 전 종목을 지표로 거르기",
  },
];

/**
 * 종목 탐색의 두 화면을 오가는 탭.
 *
 * **하나의 화면에 필터를 더 얹지 않고 탭으로 가른 이유는 데이터 경로가 다르기
 * 때문이다.** 랭킹은 등락률 스냅샷(시가총액 상위 200종목, 5분 갱신)에서 나와 가격·
 * 등락률·스파크라인을 갖고, 조건 검색은 DB(상장 전 종목, 하루 1회 배치)에서 나와
 * 지표만 갖는다. 한 표에 합치려면 전 종목 시세를 매번 스캔하거나(수 분) 조건 검색을
 * 200종목으로 줄여야 하는데 어느 쪽도 답이 아니다
 * (`back/app/services/screener_service` 모듈 주석에 같은 맞바꿈을 적어 뒀다).
 *
 * 그래서 탭이 **경계를 눈에 보이게** 만든다. 같은 표에 조건 칩만 늘렸다면 사용자는
 * 'PER 10 이하' 를 걸고 나온 목록이 전 종목에서 나온 것이라 믿었을 텐데, 실제로는
 * 200종목 안에서만 걸러졌을 것이다 — 오류 없이 틀리는 종류다.
 *
 * `<button>` 이 아니라 링크다. 두 화면은 서로 다른 URL 이고, 링크로 두면 이 조각이
 * 서버 컴포넌트로 남아 브라우저로 내려가는 JS 가 없다 (FilterChip 과 같은 판단).
 */
export function BrowseTabs({ current }: BrowseTabsProps) {
  return (
    <nav aria-label="탐색 방식" className="flex items-end border-b border-line-20">
      {TABS.map((tab) => {
        const active = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            title={tab.hint}
            className={segmented({ active, shape: "underline" })}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
