import { TeaserScreen, isFreeEvent } from "@/features/saju";
import type { Metadata } from "next";

/**
 * `/saju/teaser` — 계산된 여덟 글자와 무료 요약.
 *
 * 결과는 서버가 아니라 **sessionStorage** 에 있다(`features/saju/model/storage.ts`).
 * 이 제품은 사주를 저장하지 않으므로 다시 받아올 주소가 없고, 그래서 이 페이지는
 * 서버에서 아무것도 조회하지 않는 얇은 껍데기다.
 *
 * ## 딱 하나 서버가 정하는 것 — 이벤트 기간
 *
 * 무료 기간 여부는 **여기서 서버 시각으로 판정해** 아래로 내린다. 화면이 스스로
 * `new Date()` 를 보면 기기 시계를 옮기는 것만으로 결제를 건너뛸 수 있다.
 *
 * 그래서 `revalidate = 0` 이 필요하다 — 응답이 캐시되면 그 판정도 함께 굳어,
 * 기간이 끝난 뒤에도 무료 화면이 계속 나갈 수 있다.
 */

export const revalidate = 0;

export const metadata: Metadata = {
  title: "귀하의 명반",
  // 저장된 결과가 없으면 아무것도 못 보여 주는 화면이라 색인될 이유가 없다.
  robots: { index: false, follow: false },
};

export default function SajuTeaserPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
      <TeaserScreen freeEvent={isFreeEvent(new Date())} />
    </main>
  );
}
