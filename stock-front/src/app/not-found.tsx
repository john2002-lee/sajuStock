import { button } from "@/shared/ui";
import Link from "next/link";
import {
  NotFoundScreen,
  RequestedPath,
  type NotFoundDestination,
} from "@/shared/components/feedback";
import { Footer } from "@/shared/components/layout/Footer";
import { Masthead } from "@/shared/components/layout/Masthead";

/**
 * 루트 404. `notFound()` 호출뿐 아니라 어떤 라우트에도 매칭되지 않은 URL 전부를
 * 여기서 받는다 (Next 16 not-found.js 규약).
 *
 * 전부 서버 컴포넌트다. 요청 헤더도 백엔드도 건드리지 않아 404 한 번에 붙는
 * 비용이 없다 — 유일한 클라이언트 조각은 주소 한 줄을 읽는 RequestedPath 다.
 *
 * ## 주식 서비스의 404 다
 *
 * 주식이 별도 프로젝트로 갈라져 나왔으므로 되돌아갈 곳은 주식 화면이다. 사주로
 * 가는 길은 시장 현황의 `SajuBand` 와 푸터가 맡는다 — 여기서 다른 사이트로 내보내지
 * 않는다.
 *
 * 시가총액 상위 종목을 백엔드에서 받아 "대신 볼 것" 으로 세우지 않는다. 404 를 훑는
 * 크롤러가 상류 호출을 만들지 않게 하기 위해서다.
 * (라우트가 ƒ 로 잡히는 건 루트 레이아웃이 테마 쿠키를 읽기 때문이고, 이 화면이
 * 더하는 동적 요인은 없다.)
 *
 * metadata 는 내보내지 않는다. Next 는 not-found.js 의 metadata export 를 읽지
 * 않고(레이아웃·페이지 전용), 404 응답에는 `noindex` 를 자동으로 붙인다.
 */

/** 되돌아갈 길. 이 앱이 실제로 가진 라우트만 적는다. */
const DESTINATIONS: readonly NotFoundDestination[] = [
  {
    href: "/stock",
    label: "시장 현황",
    hint: "지수 · 등락 상위",
    icon: "chart",
  },
  {
    href: "/stocks",
    label: "종목 탐색",
    hint: "시가총액 · 등락률 순위",
    icon: "compass",
  },
];

export default function NotFound() {
  return (
    <>
      <main className="mx-auto flex w-full max-w-shell flex-col gap-[22px] px-4 pb-28 pt-[26px] md:px-8 md:pb-[30px]">
        <Masthead
          caption="404 · 요청한 지면 없음"
          home="/stock"
          action={
            <Link
              href="/stock"
              className={button({ tap: false, className: "hidden md:inline-flex" })}
              style={{ fontSize: 13 }}
            >
              시장 현황
            </Link>
          }
        />

        <NotFoundScreen
          scope="route"
          title="이 주소에는 지면이 없습니다"
          description="주소가 바뀌었거나, 종목 코드가 6자리가 아니거나, 링크가 오래된 경우입니다. 아래에서 원하는 화면으로 바로 이동할 수 있습니다."
          trace={<RequestedPath />}
          primaryAction={{ href: "/stock", label: "시장 현황으로" }}
          destinations={DESTINATIONS}
          note="route_not_matched · app/not-found.tsx"
        />
      </main>

      {/* 404 는 서비스 그룹 밖이라 `(stock)` 레이아웃의 푸터가 닿지 않는다. 직접 든다. */}
      <Footer service="stock" />
    </>
  );
}
