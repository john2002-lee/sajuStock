import { apiGetCached, ApiError } from "@/lib/api";
import { USE_MOCK } from "@/lib/config/env";
import { REVALIDATE_STATIC } from "@/lib/config/marketHours";
import type { CalendarBlock, CalendarEvent } from "../model/types";

/** back/app/schemas/market.py : CalendarEvent */
export interface WireCalendarEvent {
  name: string;
  symbol: string;
  code: string;
  board: "KOSPI" | "KOSDAQ" | null;
  kind: "earnings" | "ex_dividend";
  date: string;
  d_day: number;
  market_cap: number | null;
}

/** back/app/schemas/market.py : MarketCalendar */
export interface WireMarketCalendar {
  as_of: string | null;
  days: number;
  total: number;
  events: WireCalendarEvent[];
  covered: number;
  universe_size: number;
  updated_at: string;
}

function toEvent(row: WireCalendarEvent): CalendarEvent {
  return {
    name: row.name,
    code: row.code,
    board: row.board,
    kind: row.kind,
    date: row.date,
    dDay: row.d_day,
  };
}

/**
 * 오늘의 일정 (실적발표 · 배당락). 서버에서만 실행된다.
 *
 * **시세가 아니다.** 백엔드가 하루 1회 배치로 적재한 날짜를 읽을 뿐이라 장중에도
 * 값이 바뀌지 않는다 — `marketRevalidate()`(장중 60초) 대신 고정 1시간을 쓴다.
 *
 * 실패해도 예외를 올리지 않는다. 홈의 한 블록 때문에 첫 화면이 에러가 될 이유가 없다
 * (`getMovers` 와 같은 규약). 다만 **빈 목록으로 뭉개지 않는다**: 호출부가 '일정 없음'
 * 과 '조회 실패' 를 구분할 수 있어야 하므로 실패는 null 이다.
 */
export async function getCalendar(days = 7, limit = 6): Promise<CalendarBlock | null> {
  if (USE_MOCK) return null;

  let result;
  try {
    result = await apiGetCached<WireMarketCalendar>("/markets/calendar", {
      query: { days, limit },
      revalidate: REVALIDATE_STATIC,
    });
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }

  if (!result.ok) return null;

  const data = result.data;
  return {
    events: data.events.map(toEvent),
    days: data.days,
    covered: data.covered,
    universeSize: data.universe_size,
    asOf: data.as_of,
  };
}
