import { adminHeaders, type AdminActor } from "@/lib/auth/admin";
import { apiGet, apiSend } from "@/lib/api";
import type {
  AdminUser,
  AdminUserPage,
  AuditEntry,
  OpsSnapshot,
  Role,
  TokenTotals,
  TokenUsage,
  VisitStats,
  WireAdminUser,
  WireAuditEntry,
  WireOpsSnapshot,
  WireTokenTotals,
  WireTokenUsage,
  WireVisitStats,
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

const NO_TOKENS: TokenTotals = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cacheReadTokens: 0,
  totalTokens: 0,
};

/**
 * 칸 하나하나에 `?? 0` 을 붙인다. **객체만 확인하는 것으로는 부족하다** —
 * 필드가 하나 비면 `undefined` 가 그대로 포맷터에 들어가 화면에 "NaN 토큰" 이
 * 찍힌다. 값이 없다는 것과 값이 깨졌다는 것은 보는 사람에게 전혀 다른 신호다.
 */
function toTotals(raw: WireTokenTotals | undefined): TokenTotals {
  if (!raw) return NO_TOKENS;
  return {
    calls: raw.calls ?? 0,
    inputTokens: raw.input_tokens ?? 0,
    outputTokens: raw.output_tokens ?? 0,
    reasoningTokens: raw.reasoning_tokens ?? 0,
    cacheReadTokens: raw.cache_read_tokens ?? 0,
    totalTokens: raw.total_tokens ?? 0,
  };
}

/**
 * 토큰 사용량. **필드가 통째로 없을 수 있다.**
 *
 * 프런트와 백엔드가 따로 배포되므로, 프런트가 먼저 올라가면 예전 백엔드의 응답에
 * 이 키가 없다. 그때 `raw.today` 를 읽으면 런타임에서 죽고 관리자 화면 **전체**가
 * 안내로 바뀐다 — 배치 목록을 `?? []` 로 받는 것과 같은 이유로 0 으로 접는다.
 */
function toTokenUsage(raw: WireTokenUsage | undefined): TokenUsage {
  return {
    today: toTotals(raw?.today),
    month: toTotals(raw?.month),
    total: toTotals(raw?.total),
    byModel: (raw?.by_model ?? []).map((row) => ({
      model: row.model,
      totals: toTotals(row.totals),
    })),
    startedOn: raw?.started_on ?? null,
    lastUsedAt: raw?.last_used_at ?? null,
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
    tokenUsage: toTokenUsage(raw.token_usage),
    generatedAt: raw.generated_at,
  };
}

export async function fetchVisits(
  actor: AdminActor,
  options: { limit?: number; offset?: number } = {},
): Promise<VisitStats> {
  const raw = await apiGet<WireVisitStats>("/admin/visits", {
    query: { limit: options.limit ?? 50, offset: options.offset ?? 0 },
    headers: adminHeaders(actor),
  });

  return {
    totalVisitors: raw.total_visitors,
    totalVisitDays: raw.total_visit_days,
    anonVisitors: raw.anon_visitors,
    memberVisitors: raw.member_visitors,
    todayVisitors: raw.today_visitors,
    today: raw.today,
    // 서버가 빈 날까지 채워 보낸다 — 여기서 축을 다시 세우지 않는다.
    // 세우면 두 곳이 날짜를 판단하고, 그 둘이 어긋나는 순간 그래프가 하루 밀린다.
    daily: (raw.daily ?? []).map((point) => ({
      day: point.day,
      visitors: point.visitors,
    })),
    members: (raw.members ?? []).map((row) => ({
      userId: row.user_id,
      email: row.email,
      name: row.name,
      visitCount: row.visit_count,
      lastSeenAt: row.last_seen_at,
      firstSeenAt: row.first_seen_at,
    })),
    memberTotal: raw.member_total,
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
