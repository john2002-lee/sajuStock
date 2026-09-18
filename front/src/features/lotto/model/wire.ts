import { parseDraws } from "./draws.ts";
import type { Draw } from "./types.ts";

/**
 * 동행복권 응답 → 우리 회차 형태.
 *
 * ## 엔드포인트
 *
 * ```
 * GET https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do
 *     ?srchDir=center&srchLtEpsd={회차}
 * ```
 *
 * 요청한 회차부터 **아래로 10회차** 를 한 번에 준다. 옛 엔드포인트
 * (`common.do?method=getLottoNumber`)와 `gameResult.do` 는 2026년 개편으로
 * 폐기됐다 — 302 나 404 가 온다.
 *
 * 응답 봉투는 `{ resultCode, resultMessage, data: { list: [...] } }` 이고, 아직
 * 없는 회차를 물으면 `list` 가 비어 온다. 그것이 "새 회차가 아직 없다" 를 아는
 * 방법이다.
 *
 * ## 왜 필드를 통째로 믿지 않나
 *
 * 이 변환은 매주 GitHub Actions 안에서, 사람이 보지 않는 채로 돈다. 응답 형식이
 * 조금 바뀌었을 때 **조용히 이상한 값을 커밋하는 것** 이 최악의 결과다. 그래서
 * 이름만 옮겨 담고 판단은 `parseDraws` 에 맡긴다 — 오름차순·중복없음·범위·보너스
 * 규칙이 이미 거기 있고, 어긋나는 회차는 버려진다.
 *
 * 버려지면 신규가 0건이 되고, 스크립트는 파일을 건드리지 않는다. 직전 스냅샷이
 * 그대로 살아 있는 상태로 다음 주에 다시 시도한다.
 */

/** 응답 한 건의 필드 이름. 값은 검증하지 않는다 — `parseDraws` 가 한다. */
interface WireDraw {
  ltEpsd?: unknown;
  ltRflYmd?: unknown;
  tm1WnNo?: unknown;
  tm2WnNo?: unknown;
  tm3WnNo?: unknown;
  tm4WnNo?: unknown;
  tm5WnNo?: unknown;
  tm6WnNo?: unknown;
  bnsWnNo?: unknown;
}

function toLooseDraw(item: unknown): unknown {
  if (typeof item !== "object" || item === null) return null;
  const wire = item as WireDraw;

  return {
    round: wire.ltEpsd,
    date: wire.ltRflYmd,
    numbers: [wire.tm1WnNo, wire.tm2WnNo, wire.tm3WnNo, wire.tm4WnNo, wire.tm5WnNo, wire.tm6WnNo],
    bonus: wire.bnsWnNo,
  };
}

/** 응답 봉투에서 성한 회차만, 회차 오름차순으로 꺼낸다. */
export function parseWireDraws(raw: unknown): Draw[] {
  if (typeof raw !== "object" || raw === null) return [];

  const data = (raw as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return [];

  const list = (data as { list?: unknown }).list;
  if (!Array.isArray(list)) return [];

  return parseDraws({ draws: list.map(toLooseDraw) });
}
