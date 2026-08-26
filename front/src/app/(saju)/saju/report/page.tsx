import { ReportScreen } from "@/features/saju";
import type { Metadata } from "next";

/**
 * `/saju/report` — 무당이 들려주는 전체 풀이.
 *
 * 티저와 같은 이유로 서버에서 조회하지 않는다. 리포트 생성은 클라이언트가
 * `POST /api/saju/report` 로 한 번 부르고, 그 사이 무당춤이 돈다.
 */

export const metadata: Metadata = {
  title: "사주 리포트",
  robots: { index: false, follow: false },
};

export default function SajuReportPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
      <ReportScreen />
    </main>
  );
}
