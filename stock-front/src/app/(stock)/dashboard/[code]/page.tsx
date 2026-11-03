import { DashboardDetail } from "../_components/DashboardDetail";

/**
 * `/dashboard/005930` — nav 에서 고른 종목의 상세.
 *
 * 이 페이지만 다시 렌더된다. 레이아웃이 들고 있는 nav 와 그 클라이언트 상태
 * (그룹·정렬·선택·일괄 AI 진행), 그리고 아래 시장 타일은 그대로다 (`../layout.tsx`).
 *
 * `revalidate = 0` 을 쓴다(`force-dynamic` 이 아니다) — 레이아웃과 같은 이유다.
 */
export const revalidate = 0;

export default async function DashboardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ ai?: string }>;
}) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  return <DashboardDetail code={code} adviceOpen={query.ai === "1"} />;
}
