import { PaidReportScreen } from "@/features/saju";
import type { Metadata } from "next";

/**
 * `/saju/reports/[token]` — 구매한 리포트.
 *
 * **주소 자체가 자격 증명이다.** 이 링크를 아는 사람이 곧 구매자이므로 로그인이 없고,
 * 그래서 색인되어서는 안 된다. `robots.ts` 가 크롤러에게 요청하지 않도록 안내하고,
 * 아래 metadata 가 **링크를 이미 가진** 크롤러에게도 색인을 거부한다.
 *
 * Next 16 은 `params` 를 Promise 로 준다 — await 해야 한다.
 */

export const metadata: Metadata = {
  title: "사주 리포트",
  robots: { index: false, follow: false },
};

export default async function SajuPaidReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
      <PaidReportScreen token={token} />
    </main>
  );
}
