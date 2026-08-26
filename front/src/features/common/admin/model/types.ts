// 관리자 도메인 타입. 백엔드 `back/app/schemas/admin.py` 와 이름을 맞춘다.
//
// Wire 타입(snake_case)과 화면 타입(camelCase)을 나누는 것은 이 프로젝트의 다른
// feature 와 같은 규칙이다 — 백엔드 필드명이 바뀌어도 컴포넌트는 손대지 않는다.

export type Role = "user" | "admin";

/** back/app/schemas/admin.py : AdminUser */
export interface WireAdminUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  role: Role;
  email_verified: string | null;
  watchlist_count: number;
  has_profile: boolean;
  active_sessions: number;
}

export interface AdminUser {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
  /** 메일 인증 시각. 매직링크로 가입한 계정에만 있다 */
  emailVerified: string | null;
  /** 담아 둔 관심종목 수. **삭제 확인이 이 숫자를 보여준다** */
  watchlistCount: number;
  hasProfile: boolean;
  /** 만료되지 않은 세션 수. 0 이면 지금 로그인해 있지 않다 */
  activeSessions: number;
}

export interface AdminUserPage {
  rows: AdminUser[];
  /** 검색 적용 후 전체 건수 */
  total: number;
  /** 전체 관리자 수. 마지막 관리자의 강등 버튼을 미리 잠그는 근거 */
  adminCount: number;
}

/** back/app/schemas/admin.py : AuditEntry */
export interface WireAuditEntry {
  id: number;
  created_at: string;
  actor_email: string | null;
  actor_user_id: string;
  action: string;
  target_email: string | null;
  target_user_id: string | null;
  detail: string | null;
  ok: boolean;
}

export interface AuditEntry {
  id: number;
  createdAt: string;
  actorEmail: string | null;
  action: string;
  targetEmail: string | null;
  detail: string | null;
  /** 거절된 시도도 남는다. 화면이 성공과 다르게 그려야 한다 */
  ok: boolean;
}

/** back/app/schemas/admin.py : BatchStatus */
export interface WireBatchStatus {
  name: string;
  last_run_at: string | null;
  last_run_ok: boolean | null;
  attempted: number;
  answered: number;
  applied: number;
  detail: string | null;
  last_failure_at: string | null;
  last_failure_detail: string | null;
}

export interface BatchStatus {
  name: string;
  /** 마지막 실행. **null 이면 한 번도 돌지 않았다** — 실패보다 더 나쁜 상태다 */
  lastRunAt: string | null;
  lastRunOk: boolean | null;
  attempted: number;
  answered: number;
  applied: number;
  detail: string | null;
  /** 가장 최근 실패. 지금이 정상이어도 남는다 — 되풀이되는 실패를 보려면 필요하다 */
  lastFailureAt: string | null;
  lastFailureDetail: string | null;
}

/** 배치 이름 → 화면에 쓸 말. 백엔드 `_RECORDED_BATCHES` 와 짝이다 */
const BATCH_LABELS: Record<string, string> = {
  snapshot: "일정 · 지표 스냅샷",
  market_cap: "시가총액",
  movers: "등락률 스캔",
};

export function batchLabel(name: string): string {
  return BATCH_LABELS[name] ?? name;
}

/** back/app/schemas/admin.py : OpsSnapshot */
export interface WireOpsSnapshot {
  calendar_covered: number;
  fundamentals_covered: number;
  market_cap_covered: number;
  universe_size: number;
  last_calendar_batch: string | null;
  last_fundamentals_batch: string | null;
  advice_cached: number;
  advice_capacity: number;
  advice_in_flight: number;
  advice_max_concurrent: number;
  advice_locked: boolean;
  rag_enabled: boolean;
  batches: WireBatchStatus[];
  generated_at: string;
}

export interface OpsSnapshot {
  /** 배치 진행률 셋. 분모(universeSize)는 셋이 공유한다 */
  calendarCovered: number;
  fundamentalsCovered: number;
  marketCapCovered: number;
  universeSize: number;
  lastCalendarBatch: string | null;
  lastFundamentalsBatch: string | null;
  /** AI 캐시 — **프로세스 메모리라 재시작하면 0 이다.** 누적이 아니라 현재 상태 */
  adviceCached: number;
  adviceCapacity: number;
  adviceInFlight: number;
  adviceMaxConcurrent: number;
  /** 자물쇠가 꺼져 있으면 화면이 경고한다 */
  adviceLocked: boolean;
  ragEnabled: boolean;
  /**
   * 배치 실행 기록. 진행률과 **다른 질문**에 답한다 — 진행률은 "얼마나 채웠나",
   * 이쪽은 "그 채우는 일이 돌고 있나" 다. 커버리지가 며칠째 같은 숫자일 때
   * 정상인지 배치가 죽은 것인지는 이쪽만 답할 수 있다.
   */
  batches: BatchStatus[];
  generatedAt: string;
}

/** 행위 코드 → 사람이 읽는 말. 백엔드 `admin_service` 의 ACTION_* 과 짝이다 */
export const ACTION_LABELS: Record<string, string> = {
  "role.grant": "관리자 지정",
  "role.revoke": "권한 회수",
  "user.delete": "회원 삭제",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
