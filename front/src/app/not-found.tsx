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
 * ## 주식 조각을 전부 걷어냈다
 *
 * 이 화면에는 종목 검색 팔레트(`SearchTrigger`)와 주식 탭바가 있었고, 시가총액
 * 상위 다섯 종목을 **백엔드에서 받아** "대신 볼 것" 으로 세워 두었다. 주식이 개발
 * 전용으로 내려간 지금 그것은 공개 404 에서 **들어갈 수 없는 제품을 광고하는**
 * 셈이고, 사주를 보러 온 사람에게는 처음부터 뜻이 없는 목록이었다.
 *
 * 덤으로 이 화면은 이제 조회를 하나도 하지 않는다 — 404 를 훑는 크롤러가 상류
 * 호출을 전혀 만들지 않는다.
 * (라우트가 ƒ 로 잡히는 건 루트 레이아웃이 테마 쿠키를 읽기 때문이고, 이 화면이
 * 더하는 동적 요인은 없다.)
 *
 * metadata 는 내보내지 않는다. Next 는 not-found.js 의 metadata export 를 읽지
 * 않고(레이아웃·페이지 전용), 404 응답에는 `noindex` 를 자동으로 붙인다.
 */

/**
 * 되돌아갈 길. 이 앱이 실제로 가진 **공개** 라우트만 적는다.
 *
 * 주식 화면 둘(`/stock` · `/stocks`)이 여기 있었다. 관리자만 들어가는 표면이 된
 * 지금 404 에서 안내하면, 눌러 본 사람 대부분이 아무 설명 없이 되돌아온다.
 */
const DESTINATIONS: readonly NotFoundDestination[] = [
  {
    href: "/",
    label: "사주 보기",
    hint: "생년월일시로 보는 여덟 글자",
    icon: "user",
  },
  {
    href: "/saju/intro",
    label: "서비스 소개",
    hint: "어떻게 계산하는지",
    icon: "article",
  },
];

export default function NotFound() {
  return (
    <>
      <main className="mx-auto flex w-full max-w-shell flex-col gap-[22px] px-4 pb-28 pt-[26px] md:px-8 md:pb-[30px]">
        <Masthead
          caption="404 · 요청한 지면 없음"
          action={
            <Link
              href="/"
              className={button({ tap: false, className: "hidden md:inline-flex" })}
              style={{ fontSize: 13 }}
            >
              사주 보기
            </Link>
          }
        />

        <NotFoundScreen
          scope="route"
          title="이 주소에는 지면이 없습니다"
          description="주소가 바뀌었거나 링크가 오래된 경우입니다. 아래에서 원하는 화면으로 바로 이동할 수 있습니다."
          trace={<RequestedPath />}
          primaryAction={{ href: "/", label: "사주 보러 가기" }}
          destinations={DESTINATIONS}
          note="route_not_matched · app/not-found.tsx"
        />
      </main>

      {/* 404 는 서비스 그룹 밖이라 `(saju)` 레이아웃의 푸터가 닿지 않는다.
          직접 든다 — 공개 표면은 사주 하나이므로 사주 고지를 든다. */}
      <Footer service="saju" />
    </>
  );
}
