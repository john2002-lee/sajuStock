import { IntroStory } from "@/features/saju";
import type { Metadata } from "next";

/**
 * `/saju/intro` — 서비스 소개. 리포트와 같은 웹툰 형식이라 첫 방문부터 마지막
 * 패널까지 목소리가 끊기지 않는다.
 *
 * 정적이다. 파라미터도 클라이언트 상태도 없어 서버 컴포넌트로 남고, 첫 HTML 에
 * 전부 렌더된다 — 소개 화면이 크롤러와 링크 미리보기에 필요한 것이 그것이다.
 */

export const metadata: Metadata = {
  title: "서비스 소개",
  description:
    "태어난 시각을 진태양시(경도·균시차·서머타임)로 보정해 사주를 계산합니다. 회원가입 없이 여덟 글자를 확인하세요.",
};

export default function SajuIntroPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
      <IntroStory />
    </main>
  );
}
