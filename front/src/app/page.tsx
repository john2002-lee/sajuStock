import Link from "next/link";
import { AccountMenu } from "@/shared/components/layout/AccountMenu";
import { Footer } from "@/shared/components/layout/Footer";
import { Icon, type IconName } from "@/shared/ui";

/**
 * 서비스 선택 — **두 서비스의 갈림길이자 이 주소의 전부다.**
 *
 * ## 왜 시장 현황이 여기서 내려갔나
 *
 * `/` 에는 시장 현황(지수·등락 상위·일정)이 있었다. 그 화면은 주식 서비스의 홈이지
 * 제품의 홈이 아니다 — 사주로 들어온 사람에게 첫 화면이 코스피 지수인 것은 다른
 * 제품을 연 것과 같다. 시장 현황은 [`/stock`](<./(stock)/stock/page.tsx>)으로 내려갔고,
 * 여기는 **어느 쪽으로 갈지만 묻는다.**
 *
 * ## 조회를 하나도 하지 않는다
 *
 * 이 화면이 하는 일은 링크 둘을 그리는 것뿐이다. 백엔드를 부르지 않으므로
 * `revalidate` 를 적을 이유도, `next build` 가 빌드 머신에서 백엔드에 접속할 이유도
 * 없다 — 다른 화면들이 `revalidate = 0` 을 붙이고 있는 바로 그 문제가 여기서는
 * 생기지 않는다. 유일한 동적 요인은 제호의 `AccountMenu`(세션)이고, 그건 루트
 * 레이아웃이 테마 쿠키를 읽는 것과 같은 층위다.
 *
 * ## 두 카드에 색을 다르게 쓴다 — 규약이 섞이면 안 된다
 *
 * 주식 카드는 등락색(`--up`/`--down`), 사주 카드는 오행색(`--wuxing-*`)을 쓴다.
 * 이 앱에서 빨강은 **상승**이고 파랑은 하락이라, 사주 카드에 그 둘을 쓰면 오행이
 * 등락으로 읽힌다. 반대도 마찬가지다. 판단 영역과 재미 영역을 시각적으로 섞지
 * 않는다는 통합 기획 5.7 을 이 화면에서 먼저 지킨다 —
 * 사용자가 제품에서 처음 보는 색이 여기 있기 때문이다.
 */

interface ServiceCard {
  href: string;
  /** 카드 머리의 일련번호 — 신문 지면처럼 순서를 명시한다 */
  index: string;
  kicker: string;
  title: string;
  lede: string;
  body: string;
  items: readonly string[];
  cta: string;
  icon: IconName;
  /** 좌측 4px 축 색. 카드마다 다른 색 규약을 쓴다 (위 주석) */
  spine: string;
  /** 머리의 색 표식. 주식은 등락 두 색, 사주는 오행 다섯 색 */
  swatches: readonly string[];
}

const SERVICES: readonly ServiceCard[] = [
  {
    href: "/stock",
    index: "01",
    kicker: "STOCK",
    title: "주식",
    lede: "시장을 읽습니다",
    body:
      "지수와 등락, 종목의 재무·뉴스·리포트를 한 지면에 놓고 봅니다. 판단이 필요할 때는 여러 관점의 AI 에이전트가 각자 근거를 대고 마지막에 하나로 모읍니다.",
    items: [
      "시장 현황 — 지수 8종 · 등락 상위 · 일정",
      "종목 탐색 — 시가총액·등락률 랭킹 · 조건 검색",
      "종목 상세 — 차트 · 재무 · 뉴스 · 애널리스트 리포트",
      "관심종목 대시보드 — 보유 · 알림 · 일괄 AI 판단",
    ],
    cta: "주식 서비스 열기",
    icon: "chart",
    spine: "var(--up)",
    swatches: ["var(--up)", "var(--down)"],
  },
  {
    href: "/saju",
    index: "02",
    kicker: "SAJU",
    title: "사주",
    lede: "당신을 읽습니다",
    body:
      "태어난 시각을 진태양시로 바로잡아 여덟 글자를 뽑습니다. 경도·균시차·서머타임·절기 경계까지 셈에 넣습니다. 회원가입은 받지 않으며, 여덟 글자까지는 그냥 보여 드립니다.",
    items: [
      "사주 여덟 글자 — 연·월·일·시 네 기둥",
      "오행 분포 · 일간의 강약 · 대운 흐름",
      "무당이 풀어 주는 전체 리포트",
      "궁금한 것을 더 묻는 추가 질문",
    ],
    cta: "여덟 글자 보러 가기",
    icon: "user",
    spine: "var(--wuxing-wood)",
    swatches: [
      "var(--wuxing-wood)",
      "var(--wuxing-fire)",
      "var(--wuxing-earth)",
      "var(--wuxing-metal)",
      "var(--wuxing-water)",
    ],
  },
];

export default function ServicePickerPage() {
  return (
    <>
      <main className="mx-auto flex w-full max-w-shell flex-col gap-8 px-4 pb-[30px] pt-[26px] md:px-8">
        {/* **제호를 두지 않는다.**
            다른 화면은 `Masthead` 로 "종목 원장" 을 이고 있지만 이 화면은 아니다 —
            여기는 **주식과 사주 중 하나를 고르는 갈림길**이고, 그중 하나의 이름을
            머리에 걸면 아직 고르지도 않은 사람에게 답을 먼저 말하는 셈이 된다.
            제품 이름은 두 카드를 지난 뒤 각 서비스의 셸이 든다.

            계정 메뉴만 남긴다. `/` 에서 로그인할 수 있는 자리가 여기뿐이라
            제호와 함께 지우면 랜딩에서 로그인할 방법이 사라진다. */}
        <div className="flex justify-end">
          <AccountMenu />
        </div>

        <header className="max-w-3xl space-y-3.5">
          <h1 className="font-display text-[28px] leading-[1.25] text-ink md:text-[36px]">
            두 개의 축으로 봅니다
            {/* 제품 단계 표기 — **제호가 없는 화면이라 여기가 유일한 자리다.**
                두 서비스를 잇는 계산은 아직 화면에 붙지 않았고(아래 각주),
                주식 판단도 판정 이력이 쌓이는 중이다. 그 상태를 첫 문장 옆에서
                밝히지 않으면 사용자가 완성된 제품으로 읽는다.

                `font-sans-kr` 로 표제 서체를 빠져나온다 — `font-display`(Gothic A1)는
                700 이상만 불러오므로 이 크기에서 얇은 자를 쓰면 합성 굵기가 된다.
                금빛 pill(사주 `ConventionNotice`)이 아니라 중립 테두리를 쓰는 것은
                이 화면이 어느 서비스의 팔레트도 들이지 않기 때문이다 (위 주석). */}
            {" "}
            <span className="ml-2 inline-block whitespace-nowrap rounded-pill border border-line-25 px-2.5 py-1 align-middle font-sans-kr text-[11px] font-medium leading-none tracking-normal text-muted-65 md:ml-2.5 md:text-[12px]">
              베타 테스트 중
            </span>
          </h1>
          <p className="text-[14px] leading-relaxed text-muted-65 md:text-[15px]">
            하나는 시장이고, 하나는 당신입니다. 같은 종목이라도 누가 보느냐에 따라
            맞는 판단이 다르기 때문에, 이 제품은 그 둘을 따로 만듭니다.
          </p>
        </header>

        {/* gap-px + bg-line-16 — 두 카드 사이가 헤어라인 하나가 된다. 카드마다
            보더를 그리면 맞닿은 자리에 2px 이 생긴다 (홈의 지수 카드와 같은 수법). */}
        <div className="grid gap-px bg-line-16 md:grid-cols-2">
          {SERVICES.map((service) => (
            <ServicePanel key={service.href} service={service} />
          ))}
        </div>

        {/* 두 서비스가 어떤 사이인지 한 줄. 이 문장이 없으면 사주 카드가 "재미로
            보는 부록" 으로 읽히고, 그 순간 사람들은 누르지 않는다.

            **다만 아직 일어나지 않은 일을 일어난다고 적지 않는다.** 성향을 종목
            판단에 결합하는 계산은 백엔드에 있지만(`domain/fit.py`·`verdict.py`),
            사용자가 자기 성향을 만들고 확인하는 화면은 지금 빠져 있다
            (`features/saju/_parked/`). 그 상태에서 "나란히 보여 줍니다" 라고 쓰면
            눌러 본 사람이 없는 기능을 찾게 된다. */}
        <p className="border-t border-line-20 pt-4 text-[12.5px] leading-relaxed text-muted-55">
          두 서비스는 <span className="text-ink">같은 전제</span> 위에 있습니다 — 같은
          종목이라도 누가 보느냐에 따라 맞는 판단이 다르다는 것. 지금은 각자 답하고,
          사주로 읽은 성향을 종목 판단에 결합하는 것은 준비 중입니다. 그때에도 성향은
          판단을 보수적인 쪽으로만 움직이며, 없던 매수 판단을 만들어내지 않습니다.
        </p>
      </main>

      <Footer service="both" />
    </>
  );
}

/**
 * 카드 하나. **전체가 링크다** — 제목이나 CTA 만 링크로 두면 카드 가운데를 눌렀을 때
 * 아무 일도 일어나지 않고, 모바일에서 그 면적이 화면의 절반이다.
 */
function ServicePanel({ service }: { service: ServiceCard }) {
  return (
    <Link
      href={service.href}
      className="group flex flex-col gap-4 bg-paper px-5 py-6 transition-colors hover:bg-surface md:px-7 md:py-8"
      style={{ borderLeft: `4px solid ${service.spine}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="num text-muted-35"
            style={{ fontSize: 11, letterSpacing: "0.06em" }}
          >
            {service.index}
          </span>
          <span
            className="font-mono uppercase text-muted-50"
            style={{ fontSize: 10.5, letterSpacing: "0.2em" }}
          >
            {service.kicker}
          </span>
        </div>

        {/* 색 표식 — 라벨 없이 규약만 보여 준다. 주식은 둘(등락), 사주는 다섯(오행) */}
        <div aria-hidden className="flex flex-none items-center gap-1">
          {service.swatches.map((color) => (
            <span
              key={color}
              className="block h-2.5 w-2.5"
              style={{ background: color }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <h2 className="font-display text-[26px] leading-none text-ink md:text-[30px]">
          {service.title}
        </h2>
        <p className="text-[15px] leading-none text-muted-60">{service.lede}</p>
      </div>

      <p className="max-w-prose text-[13px] leading-relaxed text-muted-65">
        {service.body}
      </p>

      <ul className="flex flex-col gap-1.5 border-t border-dotted border-line-22 pt-4">
        {service.items.map((item) => (
          <li
            key={item}
            className="flex gap-2 text-[12.5px] leading-relaxed text-muted-60"
          >
            <span aria-hidden className="flex-none text-muted-30">
              ·
            </span>
            {item}
          </li>
        ))}
      </ul>

      {/* mt-auto — 두 카드의 항목 수가 달라도(넷·넷이지만 길이가 다르다) CTA 는
          같은 높이에 선다. md 이상에서 나란히 놓이므로 어긋나면 바로 보인다. */}
      <span className="mt-auto flex items-center gap-2 pt-2 text-ink">
        <Icon name={service.icon} size={15} />
        <span className="text-[13px] font-medium">{service.cta}</span>
        <span
          aria-hidden
          className="transition-transform group-hover:translate-x-1"
          style={{ fontSize: 13 }}
        >
          →
        </span>
      </span>
    </Link>
  );
}
