import { adminHeaders, type AdminActor } from "@/lib/auth/admin";
import { apiGet, apiSend } from "@/lib/api";
import type {
  AdminUser,
  AdminUserPage,
  AuditEntry,
  OpsSnapshot,
  Role,
  WireAdminUser,
  WireAuditEntry,
  WireOpsSnapshot,
} from "../model/types";

/**
 * 관리자 API 호출. **서버에서만 실행된다.**
 *
 * 모든 함수가 `AdminActor` 를 첫 인자로 받는다. 이건 편의가 아니라 **강제**다 —
 * `AdminActor` 는 `requireAdmin()` 만이 만들 수 있으므로, 인가를 통과하지 않고는
 * 이 함수들을 부를 수 없다. 호출부가 실수로 가드를 빠뜨리면 타입 에러가 난다.
 *
 * 캐시하지 않는다(`apiGet` = axios). 관리자 화면은 지금 이 순간의 상태를 봐야 하고,
 * 권한을 바꾼 직후 예전 목록이 뜨면 방금 한 일을 의심하게 된다.
 */

function toUser(row: WireAdminUser): AdminUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    emailVerified: row.email_verified,
    watchlistCount: row.watchlist_count,
    hasProfile: row.has_profile,
    activeSessions: row.active_sessions,
  };
}

export async function fetchOps(actor: AdminActor): Promise<OpsSnapshot> {
  const raw = await apiGet<WireOpsSnapshot>("/admin/ops", {
    headers: adminHeaders(actor),
  });

  return {
    calendarCovered: raw.calendar_covered,
    fundamentalsCovered: raw.fundamentals_covered,
    marketCapCovered: raw.market_cap_covered,
    universeSize: raw.universe_size,
    lastCalendarBatch: raw.last_calendar_batch,
    lastFundamentalsBatch: raw.last_fundamentals_batch,
    adviceCached: raw.advice_cached,
    adviceCapacity: raw.advice_capacity,
    adviceInFlight: raw.advice_in_flight,
    adviceMaxConcurrent: raw.advice_max_concurrent,
    adviceLocked: raw.advice_locked,
    ragEnabled: raw.rag_enabled,
    // 목록이 비어 있을 수 있다 — 아직 마이그레이션 전인 DB 나 배치가 한 번도 돌지
    // 않은 상태다. 화면이 그 둘을 구분해 말한다.
    batches: (raw.batches ?? []).map((batch) => ({
      name: batch.name,
      lastRunAt: batch.last_run_at,
      lastRunOk: batch.last_run_ok,
      attempted: batch.attempted,
      answered: batch.answered,
      applied: batch.applied,
      detail: batch.detail,
      lastFailureAt: batch.last_failure_at,
      lastFailureDetail: batch.last_failure_detail,
    })),
    generatedAt: raw.generated_at,
  };
}

export async function fetchUsers(
  actor: AdminActor,
  options: { q?: string; limit?: number; offset?: number } = {},
): Promise<AdminUserPage> {
  const raw = await apiGet<{
    rows: WireAdminUser[];
    total: number;
    admin_count: number;
  }>("/admin/users", {
    query: { q: options.q, limit: options.limit ?? 50, offset: options.offset ?? 0 },
    headers: adminHeaders(actor),
  });

  return {
    rows: raw.rows.map(toUser),
    total: raw.total,
    adminCount: raw.admin_count,
  };
}

export async function fetchUser(actor: AdminActor, userId: string): Promise<AdminUser> {
  return toUser(
    await apiGet<WireAdminUser>(`/admin/users/${encodeURIComponent(userId)}`, {
      headers: adminHeaders(actor),
    }),
  );
}

export async function fetchAudit(
  actor: AdminActor,
  limit = 50,
): Promise<AuditEntry[]> {
  const raw = await apiGet<{ rows: WireAuditEntry[] }>("/admin/audit", {
    query: { limit },
    headers: adminHeaders(actor),
  });

  return raw.rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    actorEmail: row.actor_email,
    action: row.action,
    targetEmail: row.target_email,
    detail: row.detail,
    ok: row.ok,
  }));
}

export async function updateRole(
  actor: AdminActor,
  userId: string,
  role: Role,
): Promise<AdminUser> {
  return toUser(
    await apiSend<WireAdminUser>(
      "patch",
      `/admin/users/${encodeURIComponent(userId)}/role`,
      { role },
      { headers: adminHeaders(actor) },
    ),
  );
}

export async function deleteUser(
  actor: AdminActor,
  userId: string,
): Promise<{ deletedWatchlist: number; deletedProfiles: number }> {
  const raw = await apiSend<{ deleted_watchlist: number; deleted_profiles: number }>(
    "delete",
    `/admin/users/${encodeURIComponent(userId)}`,
    undefined,
    { headers: adminHeaders(actor) },
  );

  return {
    deletedWatchlist: raw.deleted_watchlist,
    deletedProfiles: raw.deleted_profiles,
  };
}
