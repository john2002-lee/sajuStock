"use client";

/**
 * 사주 퍼널 전 구간에 **함께 실리는 값**을 들고 있는 곳.
 *
 * ## 왜 필요한가
 *
 * Amplitude 퍼널 차트의 Holding Constant 는 "아디다스 상세를 본 사람이 아디다스를
 * 샀는가" 처럼 **같은 프로퍼티 값으로 단계를 묶어** 전환율을 잰다. 그러려면 그
 * 프로퍼티가 퍼널의 **모든 단계**에 실려 있어야 한다. 일간이 계산 이벤트에만
 * 있으면 "일간별 결제 전환율" 은 영원히 못 그린다.
 *
 * 그래서 몇 개의 값은 한 번 정해진 뒤 끝까지 따라다녀야 한다. 화면마다 props 로
 * 나르면 컴포넌트 경계를 넘을 때마다 하나씩 빠지므로, 계측용 컨텍스트를 따로 둔다.
 *
 * ## 왜 5개뿐인가
 *
 * 상속을 늘리면 **퍼널의 순서가 고정된다** — 앞 단계가 없으면 뒤 단계의 값이
 * 비고, 그러면 경로를 바꾸는 순간 데이터가 왜곡된다. 그래서 Holding Constant 가
 * 실제로 필요한 축만 남겼다 (`docs/analytics/saju-amplitude-taxonomy.md` 5절).
 * 이벤트마다 달라지는 값(경과 시간·실패 코드·질문 순번)은 여기 들어오지 않는다.
 *
 * ## 왜 sessionStorage 인가
 *
 * 옆의 `storage.ts` 와 같은 이유다. 이 값들은 화면 이동과 **함께 움직여야** 하고
 * (입력 → 티저 → 토스 결제창 → 리다이렉트 복귀 → 리포트), 결제 리다이렉트는
 * 페이지를 통째로 새로 띄우므로 메모리에 두면 그 순간 끊긴다.
 *
 * 생년월일시는 여기 **들어오지 않는다**. 일간과 오행 최다 원소만 담는데, 그
 * 둘로는 생년월일시가 역산되지 않는다 (같은 문서 6절).
 */

import type {
  DayMaster,
  DominantElement,
  ReportTier,
  RootPath,
  SajuAnalyticsContext,
} from "@/shared/analytics/events";

/**
 * 어휘는 택소노미 계약(`shared/analytics/events.ts`)이 정하고 여기서는 **보관만**
 * 한다. 호출부가 두 곳에서 import 하지 않도록 그대로 다시 내보낸다.
 */
export type {
  DayMaster,
  DominantElement,
  ReportTier,
  RootPath,
  SajuAnalyticsContext,
};

/** 저장 키. 테스트가 깨진 값을 심어 보기 위해 내보낸다. */
export const ANALYTICS_CONTEXT_KEY = "sajustock:analytics";

/**
 * 시간 마크는 컨텍스트와 **다른 키**에 둔다.
 *
 * 마크는 이벤트에 실려 나가지 않는다 — 경과를 계산하는 재료일 뿐이다. 한 객체에
 * 섞으면 `readContext()` 를 그대로 이벤트 속성에 붓는 자리에서 타임스탬프가
 * 딸려 나가고, 그건 아무도 안 본 채로 쌓인다.
 */
const TIME_MARK_KEY = "sajustock:analytics-marks";

/** 경과를 재는 지점들. */
export type TimeMark = "entry_viewed" | "birth_submitted" | "teaser_viewed";

type TimeMarks = Partial<Record<TimeMark, number>>;

/**
 * 저장소 읽기.
 *
 * 서버(window 없음)·시크릿 모드(접근 시 예외)·깨진 JSON 세 경우가 모두 "없음"으로
 * 떨어진다. **분석 때문에 화면이 죽는 일은 없어야 한다** — 사용자가 요청한 일이
 * 아니기 때문이고, `api/visit` 라우트가 통계 실패를 삼키는 것과 같은 규약이다.
 */
function read<T extends object>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

function write(key: string, value: object): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소를 못 쓰는 환경이다. 이 세션의 상속 값이 비는 것이 전부이고,
    // 이벤트 자체는 그대로 나간다.
  }
}

function remove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // 지우지 못해도 다음 쓰기가 덮는다.
  }
}

/** 지금까지 쌓인 상속 컨텍스트. 이벤트 속성에 그대로 부어도 되는 모양이다. */
export function readContext(): SajuAnalyticsContext {
  return read<SajuAnalyticsContext>(ANALYTICS_CONTEXT_KEY) ?? {};
}

function patch(values: SajuAnalyticsContext): void {
  write(ANALYTICS_CONTEXT_KEY, { ...readContext(), ...values });
}

/**
 * 최초 유입 퍼널. **첫 값만 지킨다.**
 *
 * 소개를 읽고 들어온 사람이 뒤로 갔다가 루트로 다시 들어와도 `root_path` 는
 * `intro` 로 남아야 한다. 이 세션이 답해야 할 질문은 "어느 문으로 들어온 사람이
 * 결제하는가" 이고, 그 답은 **처음 들어온 문**이지 마지막 문이 아니다.
 */
export function setRootPathOnce(value: RootPath): void {
  if (readContext().root_path !== undefined) return;
  patch({ root_path: value });
}

/** 무료/유료 모드. 서버 `payment.enabled` 가 원천이다. */
export function setReportTier(value: ReportTier): void {
  patch({ report_tier: value });
}

/**
 * 사주 계산 결과에서 나온 두 값. **덮어쓴다.**
 *
 * `root_path` 와 반대다. 한 기기로 본인 사주를 보고 이어서 배우자 사주를 보는
 * 흐름이 이 서비스에서는 흔하고, 그때 일간은 **새 조회의 것**이어야 한다.
 * 이 값들이 유저 프로퍼티가 아니라 이벤트 프로퍼티인 이유와 같은 사실이다.
 */
export function setChartContext(values: {
  day_master: DayMaster;
  dominant_element: DominantElement;
}): void {
  patch(values);
}

export function setTimeUnknown(value: boolean): void {
  patch({ is_time_unknown: value });
}

/** 새 사주를 처음부터 볼 때 호출한다. 마크까지 함께 지운다. */
export function clearContext(): void {
  remove(ANALYTICS_CONTEXT_KEY);
  remove(TIME_MARK_KEY);
}

/**
 * 경과 측정의 시작점을 찍는다.
 *
 * `now` 를 인자로 받는 이유는 테스트 때문만이 아니다 — 호출부가 이미 재고 있는
 * 시각이 있으면 그것을 그대로 넘겨 두 값이 어긋나지 않게 한다.
 */
export function markTime(mark: TimeMark, now: number = Date.now()): void {
  const marks = read<TimeMarks>(TIME_MARK_KEY) ?? {};
  write(TIME_MARK_KEY, { ...marks, [mark]: now });
}

/**
 * 마크로부터 지금까지의 밀리초.
 *
 * 마크가 없으면 `undefined` 다. **0 이 아니다** — 0 을 주면 "즉시 일어났다" 는
 * 거짓이 데이터에 남고, 계측이 빠진 것과 구분할 수 없게 된다. 이벤트 조립기가
 * `undefined` 를 떨어뜨리므로 그 속성은 아예 실리지 않는다.
 *
 * 음수도 내지 않는다. 사용자가 시계를 되돌리거나 서머타임이 걸리면 실제로
 * 음수가 나오는데, 그건 "그 사이 시간이 흐르지 않았다" 고 보는 편이 낫다.
 */
export function elapsedSince(
  mark: TimeMark,
  now: number = Date.now(),
): number | undefined {
  const at = (read<TimeMarks>(TIME_MARK_KEY) ?? {})[mark];
  if (at === undefined) return undefined;
  return Math.max(0, now - at);
}

/**
 * 같은 경과를 **초**로. 반올림한다.
 *
 * 사람이 화면 앞에서 보낸 시간을 밀리초로 보내면 차트가 읽히지 않는다 —
 * "42초 고민하고 결제" 가 알고 싶은 것이지 41,983 이 아니다. 네트워크 지연처럼
 * 기계가 만든 시간만 `_ms` 로 남긴다.
 */
export function secondsSince(
  mark: TimeMark,
  now: number = Date.now(),
): number | undefined {
  const ms = elapsedSince(mark, now);
  return ms === undefined ? undefined : Math.round(ms / 1000);
}

/**
 * "지금부터 잰다" — 부른 시점을 붙잡아 경과 밀리초를 돌려주는 함수를 준다.
 *
 * 마크(`markTime`)와 달리 저장소를 쓰지 않는다. 한 핸들러 안에서 시작과 끝이
 * 모두 일어나는 측정에는 그것이 맞고, 저장소를 거치면 같은 화면의 두 요청이
 * 서로의 시작 시각을 덮는다.
 *
 * 호출부가 `Date.now()` 를 직접 읽지 않게 하는 효과도 있다. React 19 의
 * `react-hooks/purity` 규칙은 컴포넌트 본문에 정의된 함수를 렌더 코드로 보고
 * 시계 읽기를 막는데, 이벤트 핸들러에서는 안전한 일이다. 규칙이 보수적으로
 * 넓게 잡는 것이고, 시계 읽기에 이름을 붙이는 편이 호출부도 더 잘 읽힌다.
 */
export function startTimer(startedAt: number = Date.now()): (now?: number) => number {
  return (now: number = Date.now()) => Math.max(0, now - startedAt);
}
