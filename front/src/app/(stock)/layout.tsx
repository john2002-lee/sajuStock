import type { Metadata } from "next";
import { Footer } from "@/shared/components/layout/Footer";

/**
 * 주식 서비스 셸 — `/stock` · `/stocks/**` · `/dashboard/**` 가 공유한다.
 *
 * 라우트 그룹 `(stock)` 은 **URL 에 나타나지 않는다.** `app/(stock)/stock/page.tsx`
 * 는 `/stock` 이고 `(stock)` 이라는 마디는 없다. 폴더를 도메인으로 묶으면서
 * 주소는 그대로 두기 위한 장치다.
 *
 * ## 여기가 하는 일 둘
 *
 * 1. **면책 푸터를 붙인다.** "시세·재무·뉴스·AI 판단은 투자 권유가 아닙니다" 는
 *    주식 서비스의 고지다. 예전에는 루트 레이아웃에 있어 사주 화면에도 그대로
 *    따라붙었는데, 그쪽은 시세를 그리지 않으므로 틀린 문장이었다. 서비스별
 *    레이아웃이 각자 자기 고지를 든다 (사주는
 *    [`(saju)/layout.tsx`](<../(saju)/layout.tsx>)).
 * 2. **제목 템플릿을 정한다.** 하위 화면이 `title` 만 적으면 접미사가 붙는다.
 *
 * ## `default` 가 아니라 `absolute` 인 이유
 *
 * `title.default` 는 **부모의 `template` 을 그대로 뒤집어쓴다**(Next 16
 * `generate-metadata.md`: "It will augment `title.template` from the closest parent
 * segment if it exists"). 루트가 `"%s · 종목 원장"` 을 갖고 있으므로 여기서
 * `default` 를 쓰면 제목이 "… · 종목 원장 · 종목 원장" 이 된다 — 실제로 그렇게 나왔다.
 * `absolute` 는 부모 템플릿을 무시하면서 하위 화면의 기본 제목 노릇은 그대로 한다.
 *
 * ## 여기가 하지 않는 일 — 하단 탭바
 *
 * 탭바는 **화면마다 다르게** 붙는다. `/stocks/[symbol]` 은 모바일에서 하단에 고정
 * AI 버튼을 띄우고(`pb-24`), 대시보드는 그 위에 액션 바를 하나 더 얹는다. 레이아웃이
 * 일괄로 탭바를 깔면 그 둘과 정확히 겹친다. 어느 화면이 탭바를 갖는지는
 * `docs/screen-spec.md` 1절의 표가 정본이고, 붙이는 일은 각 `page.tsx` 가 한다.
 */
export const metadata: Metadata = {
  title: {
    absolute: "종목 원장 · The Stock Ledger",
    template: "%s · 종목 원장",
  },
  description: "KRX·해외 종목의 주가·뉴스·리포트와 멀티 에이전트 AI 판단",
};

export default function StockServiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Footer service="stock" />
    </>
  );
}
