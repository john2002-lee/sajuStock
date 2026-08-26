import type { Metadata } from "next";
import { Footer } from "@/shared/components/layout/Footer";
import { ServiceBar } from "@/shared/components/layout/ServiceBar";
import { SajuHeader } from "@/features/saju";

/**
 * 사주 서비스 셸 — `/saju` 이하가 쓴다.
 *
 * 라우트 그룹 `(saju)` 는 URL 에 나타나지 않는다. 주소는 `/saju` 그대로다.
 *
 * ## 왜 주식 셸과 갈라야 했나 — 탭바가 거짓말을 하고 있었다
 *
 * 사주 화면은 `MobileTabBar` 를 그대로 쓰고 있었다. 그 탭바의 칸은 **시장 · 검색 ·
 * 탐색 · (대시보드)** 넷이고 전부 주식 서비스 주소다. 즉 사주 화면 하단에 종목
 * 검색 팔레트를 여는 버튼과 종목 랭킹으로 가는 칸이 상시 떠 있었다.
 *
 * 서비스가 둘로 갈린 지금 답은 간단하다 — 사주 화면은 주식 탭바를 들지 않는다.
 * 대신 [`ServiceBar`](../../shared/components/layout/ServiceBar.tsx) 가 서비스
 * 선택(`/`)과 주식 서비스(`/stock`)로 나가는 길만 준다.
 *
 * ## `data-service="saju"` — 팔레트가 갈리는 지점
 *
 * 두 서비스는 디자인 언어가 다르다. 주식은 종이 위의 에디토리얼, 사주는 금빛
 * 카드와 둥근 모서리(천명 Bright)다. 이 속성 하나가 `globals.css` 의 사주 팔레트를
 * 이 서브트리에만 켠다 — 커스텀 속성은 상속되므로 더 가까운 조상의 선언이 이기고,
 * `<html data-theme="terminal">` 이 켜져 있어도 사주 화면은 밝은 팔레트를 유지한다
 * (사주 쪽 디자인 문서가 다크를 MVP 밖으로 두었다).
 *
 * 통합 기획 5.7 의 "판단 영역과 재미 영역을 시각적으로 완전히 분리한다" 를 색
 * 층위에서 지키는 것이 이 한 줄이다.
 *
 * ## `default` 가 아니라 `absolute` 인 이유
 *
 * `title.default` 는 부모의 `template` 을 뒤집어쓴다(Next 16 `generate-metadata.md`).
 * 루트가 `"%s · 종목 원장"` 을 갖고 있어 `default` 로 두면 제목이 두 번 붙는다.
 * `absolute` 는 부모 템플릿을 무시하면서 하위 화면의 기본 제목 노릇은 한다.
 */
export const metadata: Metadata = {
  title: {
    absolute: "사주팔자 · 종목 원장",
    template: "%s · 사주",
  },
  description: "진태양시 보정을 적용한 사주팔자. 회원가입 없이 여덟 글자를 확인하세요.",
};

export default function SajuServiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `bg-sun-glow` 는 해무리 그라데이션이다(모바일에서는 위쪽에서 퍼지는 형태로
    // 바뀐다 — globals.css). `min-h-screen` 이 없으면 짧은 화면에서 배경이 본문
    // 높이에서 끊긴다.
    //
    // 하단 여백이 **여기** 있는 이유: `ServiceBar` 가 모바일에서 화면 아래에 고정돼
    // 있어(`--tabbar-h` + 홈 인디케이터), 그만큼을 비워 두지 않으면 마지막 요소 —
    // 대개 푸터 — 가 바 뒤로 들어간다. 페이지마다 적으면 네 곳이 되고 한 곳은
    // 반드시 어긋난다. 바를 아는 것은 이 레이아웃이므로 규칙도 여기 둔다.
    // `md:` 부터는 바가 사라지므로(`md:hidden`) 여백도 없앤다.
    <div
      data-service="saju"
      className="bg-sun-glow min-h-screen bg-background pb-[calc(var(--tabbar-h)+var(--safe-b)+12px)] text-ink-body md:pb-0"
    >
      {/* 헤더가 여기 있는 이유: 사주 화면 넷이 전부 같은 헤더를 든다. 페이지마다
          붙이면 한 곳은 반드시 빠지고, 그 화면만 나갈 길이 없어진다. */}
      <SajuHeader />
      {children}
      <ServiceBar current="saju" />
      <Footer service="saju" />
    </div>
  );
}
