import { AuditList, fetchAudit, fetchOps, OpsPanel } from "@/features/common/admin";
import { ApiError } from "@/lib/api";
import { requireAdmin } from "@/app/_data/admin";
import { AdminShell } from "./_components/AdminShell";
import { AdminUnavailable } from "./_components/AdminUnavailable";

/**
 * 관리자 · 운영 현황.
 *
 * 지금까지 DB 를 직접 쳐야만 보이던 숫자들을 한 화면에 모은다 — 배치 적재율,
 * 마지막 실행 시각, AI 캐시 현황, 자물쇠 상태.
 *
 * **캐시하지 않는다.** 운영 현황은 지금 이 순간의 상태여야 하고, 관리자 화면은
 * 호출 빈도가 낮아 캐시로 아낄 것이 없다.
 */
export const revalidate = 0;

export default async function AdminOpsPage() {
  // 가드가 **가장 먼저** 온다. 이 줄 아래의 모든 것은 관리자만 볼 수 있다.
  const actor = await requireAdmin();

  let ops;
  let audit;
  try {
    // 둘 다 백엔드 한 곳이라 병렬로 받는다. 하나가 실패하면 화면 전체가
    // 안내로 바뀌는 편이 낫다 — 반쪽짜리 운영 현황은 오해를 만든다.
    [ops, audit] = await Promise.all([fetchOps(actor), fetchAudit(actor, 20)]);
  } catch (error) {
    return (
      <AdminShell actor={actor} current="ops">
        <AdminUnavailable error={error instanceof ApiError ? error : null} />
      </AdminShell>
    );
  }

  return (
    <AdminShell actor={actor} current="ops">
      <OpsPanel ops={ops} />

      <section className="flex flex-col gap-2.5 pt-2">
        <h2
          className="font-mono uppercase tracking-label-wide text-muted-50"
          style={{ fontSize: 10 }}
        >
          최근 관리자 활동
        </h2>
        {/* 거절된 시도도 함께 나온다 — 그것이 봐야 할 신호다 (AuditList 주석) */}
        <AuditList rows={audit} />
      </section>
    </AdminShell>
  );
}
