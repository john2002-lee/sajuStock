import rawDraws from "../_data/draws.json";
import { parseDraws } from "../model/draws";
import { buildStats } from "../model/stats";
import type { Draw, PositionStats } from "../model/types";

/**
 * 회차 데이터를 읽어 자리별 분포로 집계한다. **서버에서만 부른다.**
 *
 * ## 왜 `server.ts` 쪽인가
 *
 * `_data/draws.json` 이 89KB 다. 클라이언트 컴포넌트가 이 모듈에 닿으면 그 89KB가
 * 브라우저 번들에 그대로 실린다 — 화면이 쓰는 것은 집계된 6×45 표뿐인데.
 * 그래서 `index.ts`(브라우저 경계)에는 내보내지 않는다.
 *
 * ## 왜 모듈 스코프에 담아 두나
 *
 * 1241회를 훑어 집계하는 일은 한 번만 하면 된다. 데이터는 배포 사이에 바뀌지
 * 않으므로(매주 GitHub Actions 가 갱신 → 재배포) 프로세스 수명 동안 같은 값이다.
 *
 * 그리고 이 캐시는 **실제로 일한다.** 로또 화면은 사주 셸(`(saju)/layout.tsx`)을
 * 공유하는데, 그 레이아웃의 `AccountMenu` 가 `auth()` 로 세션을 읽는다. 쿠키를
 * 읽는 순간 그 아래 라우트는 전부 요청마다 렌더된다(`next build` 가 `/lotto` 를
 * `ƒ` 로 표시한다). 캐시가 없으면 방문마다 1241회를 다시 훑는다.
 */

export interface LottoSnapshot {
  readonly stats: PositionStats;
  /** 가장 최근 회차. 데이터가 비면 `null`. */
  readonly latestDraw: Draw | null;
}

let cached: LottoSnapshot | null = null;

export function getLottoSnapshot(): LottoSnapshot {
  if (cached) return cached;

  const draws = parseDraws(rawDraws);
  cached = {
    stats: buildStats(draws),
    latestDraw: draws.length > 0 ? draws[draws.length - 1] : null,
  };
  return cached;
}
