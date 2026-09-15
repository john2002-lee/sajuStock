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

/** back/app/schemas/admin.py : TokenTotals */
export interface WireTokenTotals {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
}

/** back/app/schemas/admin.py : ModelTokenUsage */
export interface WireModelTokenUsage {
  model: string;
  totals: WireTokenTotals;
}

/** back/app/schemas/admin.py : TokenUsage */
export interface WireTokenUsage {
  today: WireTokenTotals;
  month: WireTokenTotals;
  total: WireTokenTotals;
  by_model: WireModelTokenUsage[];
  started_on: string | null;
  last_used_at: string | null;
}

export interface TokenTotals {
  /** 성공한 호출 수. 실패는 사용량 메타가 없어 세지 않는다 */
  calls: number;
  inputTokens: number;
  /** 본문 출력. **사고 토큰은 여기 포함되지 않는다** */
  outputTokens: number;
  /**
   * 사고(thinking) 토큰. Gemini 는 이것을 **출력과 같은 단가로 과금한다** —
   * 실측에서 `llm_effort=medium` 은 사고가 과금 출력의 절반을 넘었다. 출력과 합쳐
   * 한 칸에 넣으면 비용이 어디서 나는지 화면에서 사라진다.
   */
  reasoningTokens: number;
  /** 캐시에서 읽은 입력. 입력의 부분집합이라 합계에 더하지 않는다 */
  cacheReadTokens: number;
  totalTokens: number;
}

export interface ModelTokenUsage {
  model: string;
  totals: TokenTotals;
}

export interface TokenUsage {
  today: TokenTotals;
  month: TokenTotals;
  total: TokenTotals;
  /** 누적 합계 내림차순. 모델마다 단가가 달라 합계만으로는 비용을 못 읽는다 */
  byModel: ModelTokenUsage[];
  /**
   * 집계를 시작한 날 (KST `YYYY-MM-DD`). **과거는 채우지 않았다** — 화면이 이것을
   * 밝혀야 "누적" 이 언제부터의 누적인지 오해가 없다. 한 건도 없으면 null.
   */
  startedOn: string | null;
  lastUsedAt: string | null;
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
  token_usage: WireTokenUsage;
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
  /**
   * AI 토큰 사용량. 위 `adviceCached` 와 **다른 질문**에 답한다 — 그쪽은
   * 재시작하면 0 이 되는 현재 상태고, 이쪽은 DB 에 쌓이는 누적이다.
   */
  tokenUsage: TokenUsage;
  generatedAt: string;
}

/** back/app/schemas/admin.py : DailyVisitPoint */
export interface WireDailyVisitPoint {
  day: string;
  visitors: number;
}

/** back/app/schemas/admin.py : MemberVisit */
export interface WireMemberVisit {
  user_id: string;
  email: string | null;
  name: string | null;
  visit_count: number;
  last_seen_at: string | null;
  first_seen_at: string | null;
}

/** back/app/schemas/admin.py : VisitStats */
export interface WireVisitStats {
  total_visitors: number;
  total_visit_days: number;
  anon_visitors: number;
  member_visitors: number;
  today_visitors: number;
  today: string;
  daily: WireDailyVisitPoint[];
  members: WireMemberVisit[];
  member_total: number;
  generated_at: string;
}

export interface DailyVisitPoint {
  /** KST 기준 날짜 (`YYYY-MM-DD`) */
  day: string;
  visitors: number;
}

export interface MemberVisit {
  userId: string;
  email: string | null;
  name: string | null;
  /** 방문한 **날 수**. 접속 정의가 하루 1회라 이것이 접속수다 */
  visitCount: number;
  lastSeenAt: string | null;
  firstSeenAt: string | null;
}

export interface VisitStats {
  /**
   * 서로 다른 방문자 수 (익명 + 회원).
   *
   * **회원 수가 아니다.** 사주 서비스는 회원가입을 받지 않으므로 대부분이 익명이고,
   * 그래서 화면이 `anonVisitors`·`memberVisitors` 로 구성을 함께 밝힌다.
   */
  totalVisitors: number;
  /** 방문일의 합. `totalVisitors` 보다 크면 재방문이 있었다 */
  totalVisitDays: number;
  anonVisitors: number;
  memberVisitors: number;
  /** 오늘(KST) 접속자수 */
  todayVisitors: number;
  /** 그 "오늘" 이 며칠인지. KST 환산이 살아 있는지가 이 값으로 드러난다 */
  today: string;
  /** 최신이 먼저. **방문 0 인 날도 들어 있다** — 축은 서버가 세운다 */
  daily: DailyVisitPoint[];
  members: MemberVisit[];
  /** 접속 기록이 있는 회원 수. `members` 는 그중 한 페이지다 */
  memberTotal: number;
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
