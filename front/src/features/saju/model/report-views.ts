"use client";

/**
 * 구매한 리포트를 **몇 번째로 여는가**.
 *
 * ## 왜 세야 하는가
 *
 * 첫 열람은 매출 퍼널의 최종 전환이고(`saju_report_viewed`), 두 번째부터는
 * 리텐션이다(`saju_report_reopened`). 둘을 한 이벤트로 두면 재방문할 때마다
 * 전환이 부풀어 전환율이 100% 를 넘는 차트가 나온다.
 *
 * 보관 기간(`retention_days`) 동안 다시 볼 수 있다는 약속이 실제로 쓰이는지도
 * 이 숫자로만 확인된다.
 *
 * ## 왜 localStorage 인가
 *
 * 재열람은 **며칠 뒤**에 일어난다 — sessionStorage 는 탭을 닫으면 사라지므로
 * 그때마다 1회차로 보인다. 옆의 `storage.ts` 가 sessionStorage 인 것과 목적이
 * 다르다: 그쪽은 한 흐름 안에서만 살아야 하는 값이고, 이쪽은 흐름을 넘어 남아야
 * 하는 값이다.
 *
 * ## 토큰은 브라우저 밖으로 나가지 않는다
 *
 * 여기 저장되는 키는 리포트 토큰이고, 그것은 **자격 증명**이다. 이 파일은 그것을
 * 로컬 저장소에만 두고 이벤트에는 회차와 경과 일수만 싣는다 —
 * `shared/analytics/redact.ts` 가 토큰 이름의 속성을 막는 것과 같은 선이다.
 * 주소 자체가 이미 브라우저 기록에 있으므로 로컬에 두는 것은 새로운 노출이 아니다.
 */

const KEY = "sajustock:report-views";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReportViewRecord {
  /** 이 리포트를 처음 연 시각. 결제 직후이므로 사실상 구매 시각이다. */
  firstAt: number;
  count: number;
}

export type ReportViewMap = Record<string, ReportViewRecord>;

export interface ViewResult {
  map: ReportViewMap;
  /** 1 이면 첫 열람이다. */
  viewIndex: number;
  daysSinceFirst: number;
}

/** 저장된 기록이 쓸 만한가. 손으로 넣은 값이나 옛 모양이 들어올 수 있다. */
function isUsable(record: ReportViewRecord | undefined): record is ReportViewRecord {
  return (
    record !== undefined &&
    Number.isFinite(record.firstAt) &&
    Number.isFinite(record.count) &&
    record.count > 0
  );
}

/**
 * 열람을 한 번 기록하고 **새 맵**을 돌려준다. 원본은 고치지 않는다.
 *
 * 깨진 기록은 첫 열람으로 되돌린다. 그 편이 "9999회차" 같은 값이 차트에 박히는
 * 것보다 낫다 — 틀린 값은 눈에 띄지 않지만 차트는 망가뜨린다.
 */
export function recordView(
  map: ReportViewMap,
  token: string,
  now: number = Date.now(),
): ViewResult {
  const previous = map[token];
  const usable = isUsable(previous);

  const firstAt = usable ? previous.firstAt : now;
  const count = (usable ? previous.count : 0) + 1;

  return {
    map: { ...map, [token]: { firstAt, count } },
    viewIndex: count,
    // 시계가 뒤로 가도 음수를 내지 않는다. 내림하므로 23시간은 아직 0일이다.
    daysSinceFirst: Math.max(0, Math.floor((now - firstAt) / DAY_MS)),
  };
}

export function loadViews(): ReportViewMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as ReportViewMap;
  } catch {
    return {};
  }
}

export function saveViews(map: ReportViewMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // 저장소를 못 쓰면 다음 열람이 다시 1회차로 보인다. 재열람 지표가 낮게
    // 나오는 것이 전부이고, 화면은 그대로 돌아간다.
  }
}
