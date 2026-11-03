import { fetchVisits, VisitPanel } from "@/features/common/admin";
import { ApiError } from "@/lib/api";
import { requireAdmin } from "@/app/_data/admin";
import { AdminShell } from "../_components/AdminShell";
import { AdminUnavailable } from "../_components/AdminUnavailable";

/**
 * 관리자 · 접속 통계.
 *
 * 총·일일 접속자수와 30일 추이, 회원별 접속수·최근 접속일시. 지금까지 DB 를 직접
 * 쳐야만 보이던 값들이고, 애초에 그 값을 담는 테이블조차 없었다.
 *
 * **캐시하지 않는다.** 운영 화면과 같은 이유다 — 지금 이 순간의 상태여야 하고,
 * 관리자 화면은 호출 빈도가 낮아 캐시로 아낄 것이 없다. 특히 "오늘 접속자수" 를
 * 캐시하면 새로고침해도 숫자가 안 늘어 기록이 죽은 것처럼 보인다.
 */
export const revalidate = 0;

export default async function AdminVisitsPage() {
  // 가드가 **가장 먼저** 온다. 레이아웃이 아니라 페이지가 부르는 이유는
  // `AdminShell` 주석에 있다 — 레이아웃 가드는 서버 액션을 막지 못한다.
  const actor = await requireAdmin();

  let visits;
  try {
    visits = await fetchVisits(actor);
  } catch (error) {
    return (
      <AdminShell actor={actor} current="visits">
        <AdminUnavailable error={error instanceof ApiError ? error : null} />
      </AdminShell>
    );
  }

  return (
    <AdminShell actor={actor} current="visits">
      <VisitPanel visits={visits} />
    </AdminShell>
  );
}
