import type { MetadataRoute } from "next";

/**
 * 크롤러 정책.
 *
 * ## 왜 필요한가 — 색인이 아니라 **상류 호출**이 문제다
 *
 * `/stocks/<문자열>` 은 어떤 입력에도 200 을 준다(못 찾으면 후보 고르기 화면이다).
 * 크롤러에게 그것은 "무한한 유효 페이지"로 보이고, 그 문자열이 KRX 목록에 없으면
 * 백엔드가 그대로 야후 티커로 써서 호출이 나간다. 즉 색인 낭비가 아니라 **우리
 * 상류 쿼터가 크롤러 속도로 소모된다.**
 *
 * 종목일 수 없는 모양에는 `page.tsx` 의 `generateMetadata` 가 `noindex` 를 붙이지만,
 * 그건 이미 요청이 도착한 뒤다. 여기서 미리 막는다.
 *
 * ## 무엇을 막나
 *
 *   /stocks/*   종목 상세. 목록(`/stocks`)과 조건 검색은 열어 둔다 — 그쪽은 우리 DB
 *               만 읽고 입력 공간이 유한하다
 *   /api/*      BFF. 사람이 볼 화면이 아니고, 자동완성은 팬아웃이 있다
 *   /admin/*    관리자. 익명에게는 404 지만 주소를 광고할 이유가 없다
 *   /watchlist  소유자별 데이터라 색인할 내용이 없다
 *
 * ## 열어 두는 것 — 서비스 셋
 *
 * `/`(서비스 선택) · `/stock`(시장 현황) · `/saju`(사주) · `/stocks`(랭킹) ·
 * `/stocks/screener`(조건 검색). 전부 입력 공간이 유한하고 상류 호출을 늘리지
 * 않는다. `/saju` 는 조회가 출생지 목록 하나뿐이고 그것도 캐시된다.
 *
 * **`allow: ["/"]` 하나로 다 되지 않는다.** `allow` 는 `disallow` 를 되돌리는
 * 규칙이지 "여기부터 다 열림" 이 아니고, 더 긴 규칙이 이기는 관례(Google·Bing)
 * 때문에 `/stocks/` 아래를 다시 열려면 그 경로를 따로 적어야 한다.
 *
 * `sitemap` 은 두지 않았다. 지금은 색인시킬 안정 URL 집합이 정해지지 않았고
 * (종목 상세는 위 이유로 닫혀 있다), 빈 사이트맵은 없는 것보다 나쁘다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // `/stocks/` 는 접두 일치라 조건 검색까지 함께 걸린다. 더 긴 규칙이 이기는
      // 관례(Google·Bing)에 기대 그것만 다시 열어 준다 — 목록(`/stocks`)은 슬래시가
      // 없어 애초에 걸리지 않는다.
      // `/terms`·`/privacy` 는 **색인되어야 한다** — 마케팅·법적 표면이고
      // 누구의 데이터도 없다. 구매 전에 읽을 수 있어야 하는 문서를 크롤러에게
      // 숨길 이유가 없다.
      allow: ["/", "/stock", "/saju", "/stocks/screener", "/terms", "/privacy"],
      // `/saju/reports/` — **주소 자체가 자격 증명이다.** 크롤러에게 가져가지
      // 말라고 요청하고, 링크를 이미 가진 크롤러는 그 페이지의 `noindex` 가 막는다.
      // `/saju/pay/` 와 `/saju/teaser`·`/saju/report` 는 저장된 결과가 없으면
      // 빈 화면이라 색인할 것이 없다.
      disallow: [
        "/stocks/",
        "/api/",
        "/admin/",
        "/watchlist",
        "/dashboard",
        "/login",
        "/signup",
        "/verify",
        "/saju/reports/",
        "/saju/pay/",
        "/saju/teaser",
        "/saju/report",
      ],
    },
  };
}
