import { TeaserScreen } from "@/features/saju";
import type { Metadata } from "next";

/**
 * `/saju/teaser` — 계산된 여덟 글자와 무료 요약.
 *
 * 결과는 서버가 아니라 **sessionStorage** 에 있다(`features/saju/model/storage.ts`).
 * 이 제품은 사주를 저장하지 않으므로 다시 받아올 주소가 없고, 그래서 이 페이지는
 * 서버에서 아무것도 조회하지 않는 얇은 껍데기다.
 */

export const metadata: Metadata = {
  title: "귀하의 명반",
  // 저장된 결과가 없으면 아무것도 못 보여 주는 화면이라 색인될 이유가 없다.
  robots: { index: false, follow: false },
};

export default function SajuTeaserPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
      <TeaserScreen />
    </main>
  );
}
