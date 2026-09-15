import type { Metadata } from "next";
import { AUTH_ENABLED } from "@/auth";
import { AccountMenu } from "@/shared/components/layout/AccountMenu";
import { Footer } from "@/shared/components/layout/Footer";
import { SajuHeader } from "@/features/saju";

/**
 * 사주 서비스 셸 — **루트(`/`)와 `/saju` 이하가 쓴다.**
 *
 * 라우트 그룹 `(saju)` 는 URL 에 나타나지 않는다. 그래서 이 그룹의 `page.tsx` 가
 * 곧 `/` 이고, 사주 입력 화면이 제품의 첫 화면이면서 이 셸을 그대로 입는다.
 *
 * ## 하단 탭바가 없다
 *
 * 여기에는 바가 둘 연달아 있었다. 먼저 주식의 `MobileTabBar`(시장·검색·탐색) 를
 * 그대로 쓰다가 — 사주 화면에서 **여기 없는 기능을 상시 광고하는** 상태였다 —
 * 칸 셋짜리 `ServiceBar`(사주 · 서비스 선택 · 주식)로 바꿨다.
 *
 * 주식이 개발 전용으로 내려가고 사주가 메인이 되면서 그 셋 중 둘이 갈 곳을 잃었다.
 * **칸이 하나 남은 탭바는 탭바가 아니다** — 화면 아래를 상시 먹으면서 아무 선택도
 * 주지 않는다. 그래서 `ServiceBar` 는 걷어냈고, 소개·약관으로 가는 길은 헤더 메뉴와
 * 푸터가 맡는다. 함께 있던 하단 여백(`--tabbar-h`)도 같이 사라졌다 — 가릴 바가
 * 없는데 비워 두면 푸터 아래가 뜬다.
 *
 * ## `data-service="saju"` — 팔레트가 갈리는 지점
 *
 * 두 서비스는 디자인 언어가 다르다. 주식은 종이 위의 에디토리얼, 사주는 금빛
 * 카드와 둥근 모서리(FEEL Bright)다. 이 속성 하나가 `globals.css` 의 사주 팔레트를
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
 * 루트가 `"%s · FEEL"` 을 갖고 있어 `default` 로 두면 제목이 두 번 붙는다.
 * `absolute` 는 부모 템플릿을 무시하면서 하위 화면의 기본 제목 노릇은 한다.
 */
export const metadata: Metadata = {
  title: {
    absolute: "FEEL · 사주팔자",
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
    // 하단 여백은 없다. `ServiceBar` 를 걷어내면서 가릴 바가 사라졌다 (위 주석).
    <div
      data-service="saju"
      className="bg-sun-glow min-h-screen bg-background text-ink-body"
    >
      {/* 헤더가 여기 있는 이유: 사주 화면 넷이 전부 같은 헤더를 든다. 페이지마다
          붙이면 한 곳은 반드시 빠지고, 그 화면만 나갈 길이 없어진다. */}
      {/* 계정은 **레이아웃이** 만들어 넘긴다. `AccountMenu` 는 세션을 읽는 서버
          컴포넌트고 `SajuHeader` 는 클라이언트 컴포넌트라, 헤더가 직접 import 하면
          서버 전용 코드가 브라우저 번들을 탄다.

          `AUTH_ENABLED` 를 **여기서** 본다. `AccountMenu` 도 스스로 확인하고 꺼져
          있으면 `null` 을 그리지만, 엘리먼트는 그것과 무관하게 truthy 라 헤더가
          제목만 있는 빈 '계정' 섹션을 그린다. */}
      <SajuHeader account={AUTH_ENABLED ? <AccountMenu /> : undefined} />
      {children}
      <Footer service="saju" />
    </div>
  );
}
