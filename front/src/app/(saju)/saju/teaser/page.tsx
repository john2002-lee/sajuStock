import { TeaserScreen } from "@/features/saju";
import type { Metadata } from "next";

/**
 * `/saju/teaser` — 계산된 여덟 글자와 무료 요약.
 *
 * 결과는 서버가 아니라 **sessionStorage** 에 있다(`features/saju/model/storage.ts`).
 * 이 제품은 사주를 저장하지 않으므로 다시 받아올 주소가 없고, 그래서 이 페이지는
 * 서버에서 아무것도 조회하지 않는 얇은 껍데기다.
 *
 * ## 서버가 정하는 것이 없다
 *
 * 한때 무료 행사 기간을 **여기서 서버 시각으로 판정해** 내려보냈고, 그 판정이
 * 캐시로 굳지 않도록 `revalidate = 0` 을 달고 있었다. 행사가 끝나면서 판정할
 * 것이 없어졌으므로 둘 다 걷어냈다 — 서버가 아무것도 정하지 않는 페이지에
 * 캐시를 끄는 선언만 남겨 두면, 다음 사람이 그 이유를 찾다가 없는 이유를
 * 지어내게 된다.
 *
 * 가격은 여전히 신선하다. 화면이 열린 뒤 `TeaserScreen` 이
 * `/api/saju/payment-config` 를 직접 부르므로 이 껍데기가 정적이어도 상관없다.
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
