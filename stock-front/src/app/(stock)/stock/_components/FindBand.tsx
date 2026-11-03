import Link from "next/link";
import { SearchTrigger } from "@/features/stock/search";
import { Icon, type IconName } from "@/shared/ui";

/**
 * 홈 최상단 "종목 찾기" 밴드 — 검색 히어로 + 이름을 모를 때의 진입구 3개.
 *
 * 원래 검색은 마스트헤드 가운데 250px 버튼이었고, 그 아래 별도 섹션으로
 * 진입구 3개(BeginnerGuide)가 있었다. 문제가 둘이었다.
 *  1) 마스트헤드 안에서는 검색이 테마 토글·관심종목과 같은 크기 위계로 읽힌다.
 *     이 서비스에서 가장 많이 쓰는 동작이 부가 기능처럼 보인다.
 *  2) `hidden md:block` 이라 모바일에서는 아예 없었다 — 하단 탭바까지
 *     시선을 내려야 검색을 만난다.
 * 둘을 한 밴드로 합쳐 본문 첫 블록에 둔다. "종목을 고른다" 는 한 가지 결정을
 * 한 곳에서 끝내게 하는 것이 목적이라, 검색과 진입구를 떼어 놓지 않는다.
 *
 * 데이터가 하나도 없어(순수 링크·클라이언트 트리거) 라우트 전용 `_components/` 에 둔다.
 *
 * '큰 회사부터' 를 첫 타일로 두는 것은 의도적이다 — 시가총액순은 가장 덜 흔들리는
 * 정렬이고, 급등 종목을 첫인상으로 주면 초보자에게 추격 매수를 가르치는 셈이 된다.
 *
 * SampleFrame 으로 감싸지 않는다: 세 목적지가 전부 실제 라우트다. 그 뱃지는
 * "이 데이터는 꾸며낸 것" 이라는 뜻이라 내비게이션에 붙이면 의미가 희석된다.
 * 같은 이유로 타일에 종목 수 같은 숫자를 넣지 않는다.
 */

interface Entry {
  href: string;
  icon: IconName;
  title: string;
  hint: string;
}

const ENTRIES: Entry[] = [
  {
    href: "/stocks?sort=market_cap",
    icon: "compass",
    title: "큰 회사부터",
    hint: "시가총액 상위 — 이름을 아는 회사부터 봅니다",
  },
  {
    href: "/stocks?sort=change",
    icon: "caret-up",
    title: "오늘 움직인 종목",
    hint: "등락률 상위 — 오늘 시장이 주목한 종목",
  },
  {
    href: "/dashboard",
    icon: "star",
    title: "내 종목 대시보드",
    hint: "담아 둔 종목·시장·AI 판단을 한 화면에서 (로그인 필요)",
  },
];

export function FindBand() {
  return (
    <section aria-label="종목 찾기" className="flex flex-col gap-3">
      <SearchTrigger variant="hero" />

      {/* 진입구는 검색의 대안이지 동급이 아니다 — 라벨로 종속 관계를 밝힌다 */}
      <h2
        className="border-b border-line-20 pb-2 font-mono font-medium uppercase tracking-label text-muted-55 text-11"
      >
        이름이 떠오르지 않는다면
      </h2>

      {/* gap-px + 배경으로 1px 헤어라인을 만든다 (IndexCards 와 같은 관용구) —
          카드마다 보더를 주면 인접 변이 2px 로 겹친다. */}
      <div className="grid gap-px bg-line-16 md:grid-cols-3">
        {ENTRIES.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="flex min-h-[var(--tap)] flex-col justify-center gap-1.5 bg-paper px-4 py-3.5 hover:bg-surface-hover"
          >
            <span className="flex items-center gap-2">
              <Icon name={entry.icon} size={14} className="text-muted-55" />
              <span className="font-medium text-14">
                {entry.title}
              </span>
            </span>
            <span
              className="text-muted-60 text-12 leading-[1.45]"
            >
              {entry.hint}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
