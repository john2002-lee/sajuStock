import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, apiGet } from "@/lib/api";
import { TalismanOrderView, type TalismanOrder } from "@/features/talisman";
import type { Metadata } from "next";

/**
 * `/talisman/orders/{token}` — 구매한 부적을 보고 내려받는 자리.
 *
 * **토큰이 곧 자격 증명이다.** 주소를 아는 사람이 산 사람이므로 색인되면 안 된다.
 * 요청마다 렌더한다 — 다운로드 기한을 지금 시각으로 판정해야 한다.
 */

export const metadata: Metadata = {
  title: "구매한 부적",
  robots: { index: false, follow: false },
};

export const revalidate = 0;

export default async function TalismanOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let order: TalismanOrder;
  try {
    order = await apiGet<TalismanOrder>(`/talismans/orders/${encodeURIComponent(token)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <main className="mx-auto w-full max-w-md px-5 py-10 sm:px-6 sm:py-14">
        <div role="alert" className="rounded-card bg-surface p-6 shadow-card sm:p-8">
          <h1 className="font-display text-xl text-ink">부적을 열 수 없습니다</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-body">
            {error instanceof ApiError
              ? error.message
              : "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."}
          </p>
          <Link href="/support" className="mt-4 block text-[13px] text-gold-text underline underline-offset-2">
            고객센터
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 py-10 sm:px-6 sm:py-14">
      <TalismanOrderView token={token} order={order} />
    </main>
  );
}
