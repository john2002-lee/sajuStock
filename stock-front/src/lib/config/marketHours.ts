/**
 * KRX 장 운영 시간 기준 재검증 주기.
 *
 * 장중에는 시세가 계속 바뀌므로 짧게, 장 마감 후·주말에는 값이 고정이므로 길게 잡는다.
 * 같은 60초를 밤새 유지하면 하루에 수백 번을 무의미하게 다시 가져온다.
 *
 * 서버 타임존에 의존하지 않는다 — 배포 환경은 대개 UTC 이고, 로컬은 KST 다.
 * `Intl.DateTimeFormat` 에 timeZone 을 명시해 어디서 돌든 같은 판정을 내린다.
 * 공휴일 캘린더는 두지 않는다: 휴장일에 60초로 잠깐 더 자주 가져와도 손해가
 * 크지 않고, 캘린더는 매년 갱신해야 하는 부채가 된다.
 */

/** 장중 09:00~15:40 (분 단위). 15:30 정규장 + 동시호가 여유 10분. */
const OPEN_MINUTES = 9 * 60;
const CLOSE_MINUTES = 15 * 60 + 40;

/** 장중 — 시세가 계속 움직인다 */
export const REVALIDATE_MARKET_OPEN = 60;
/** 장외 — 다음 개장까지 값이 고정이다 */
export const REVALIDATE_MARKET_CLOSED = 900;

/** 시세와 무관한 데이터(종목 메타·상장사 정보)의 고정 주기 */
export const REVALIDATE_STATIC = 3600;

/**
 * 시세 지연 고지.
 *
 * 공급자(야후)가 KRX 데이터를 `exchangeDataDelayedBy = 20` 으로 명시한다 — 실측 20분 지연이다.
 * 인트라데이 봉은 09:00~14:59 까지만 오고 장 마감(15:30) 직전 30분이 비기도 한다.
 * 실시간이 아닌 값을 실시간처럼 보이게 두는 것이 이 화면이 저지를 수 있는 가장 큰 거짓말이라
 * 마스트헤드에 상시 노출한다.
 *
 * 컴포넌트가 아니라 문자열인 이유: `Masthead` 의 `caption` 이 ReactNode 가 아니라 string 이다.
 */
export const QUOTE_DELAY_NOTE = "20분 지연 시세";

const KST = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const WEEKEND = new Set(["Sat", "Sun"]);

export interface SeoulClock {
  /** Mon … Sun */
  weekday: string;
  /** 자정부터 지난 분 */
  minutes: number;
}

/** 주어진 시각을 서울 기준 요일·분으로 환산한다. */
export function toSeoulClock(now: Date = new Date()): SeoulClock {
  const parts = KST.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  // en-US + hour12:false 는 자정을 "24" 로 주는 구현이 있다 — 0 으로 정규화한다.
  const hour = Number(get("hour")) % 24;
  return {
    weekday: get("weekday"),
    minutes: hour * 60 + Number(get("minute")),
  };
}

/** 서울 기준 평일 장중인가. */
export function isMarketOpen(now: Date = new Date()): boolean {
  const { weekday, minutes } = toSeoulClock(now);
  if (WEEKEND.has(weekday)) return false;
  return minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES;
}

/**
 * 마스트헤드 캡션 꼬리 — 장중이면 "장중", 아니면 "장 마감"을 현재 KST 시각과 함께 싣는다.
 *
 * 예전에는 "장 마감 15:30 KST" 를 화면·시각과 무관하게 고정으로 붙였다 — 장이 열려
 * 있는 오전 10시에 들어와도 "장 마감"이라고 말하는 셈이었다. 시세 신선도를 실제와
 * 다르게 말하는 것이 이 화면이 저지를 수 있는 가장 큰 거짓말이라는 원칙
 * (`QUOTE_DELAY_NOTE` 주석)을 정작 개장 여부 표시에는 지키지 못하고 있었다.
 *
 * `now` 는 이 함수를 부르는 서버 렌더 시각이다 — 시세 계열 fetch 의 재검증 주기가
 * 장중 60초라 렌더 시각과 시세 시각의 차이가 실질적으로 작다.
 */
export function marketCaptionSuffix(now: Date = new Date()): string {
  const { minutes } = toSeoulClock(now);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  const state = isMarketOpen(now) ? "장중" : "장 마감";
  return `${state} · ${hh}:${mm} 기준 · ${QUOTE_DELAY_NOTE}`;
}

/**
 * 시세 계열 fetch 에 줄 revalidate 초.
 *
 * 라우트 세그먼트의 `export const revalidate` 는 정적 값만 허용하므로 여기서
 * 계산한 값은 반드시 fetch 의 `next.revalidate` 로 전달한다.
 */
export function marketRevalidate(now: Date = new Date()): number {
  return isMarketOpen(now) ? REVALIDATE_MARKET_OPEN : REVALIDATE_MARKET_CLOSED;
}
