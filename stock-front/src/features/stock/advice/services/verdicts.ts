import { apiGet, apiPost } from "@/lib/api";
import {
  toSharedVerdict,
  toVerdictRecord,
  type SharedVerdict,
  type VerdictRecord,
  type WireSharedVerdict,
  type WireVerdict,
} from "../model/verdict";

/**
 * 저장된 AI 판단 조회·기록. **서버에서만 실행된다.**
 *
 * `advice/services/` 는 지금까지 `.gitkeep` 만 있던 빈 폴더였다 — 판단을 **만드는**
 * 일은 SSE 라 훅(`useAiAdvice`)이 하고, 서버가 백엔드를 부를 일이 없었기 때문이다.
 * 보관이 생기면서 처음으로 평범한 조회가 필요해졌다.
 *
 * **소유자를 인자로 받는다.** 쿠키를 여기서 직접 읽지 않는 이유는 신원을 어디서
 * 얻는지가 화면(`app/`)의 관심사이기 때문이다 — `getWatchlist` 와 같은 자세다.
 */

/**
 * **캐시를 끄는 코드가 없는 이유**: `apiGet` 은 axios 라 Next 데이터 캐시를 아예
 * 타지 않는다. 그 캐시를 타는 것은 `apiGetCached` 하나뿐이고, 사용자별 데이터에
 * 그것을 쓰지 않는다는 규칙이 이미 있다(키가 URL 이라 **남의 데이터가 서빙된다**).
 */

/**
 * 내 판단 기록. **실패를 예외로 올리지 않는다.**
 *
 * 홈의 한 섹션이라 이것 때문에 화면 전체가 500 이 되면 안 된다 — `getMovers`·
 * `getWatchlist` 와 같은 판단이다. 빈 목록이면 섹션째 그리지 않는다.
 */
export async function getVerdictHistory(
  ownerKey: string,
  limit = 6,
): Promise<VerdictRecord[]> {
  try {
    const wire = await apiGet<{ items: WireVerdict[] }>("/advice/verdicts", {
      query: { limit },
      headers: { "X-Owner-Key": ownerKey },
    });
    return (wire.items ?? []).map(toVerdictRecord);
  } catch {
    return [];
  }
}

/**
 * 공유 링크로 한 건. **여기만 소유자가 필요 없다** — 링크가 곧 열쇠다.
 *
 * 없으면 `null` 을 돌려준다. 페이지가 404 로 착지시킨다 — 예외를 올리면 오류
 * 화면이 뜨고, 그건 "링크가 틀렸다" 와 "서버가 아프다" 를 구분하지 못한다.
 */
export async function getSharedVerdict(shareId: string): Promise<SharedVerdict | null> {
  try {
    const wire = await apiGet<WireSharedVerdict>(
      `/advice/verdicts/shared/${encodeURIComponent(shareId)}`,
    );
    return toSharedVerdict(wire);
  } catch {
    return null;
  }
}

/** 백엔드에 넘기는 저장 본문. `personal` 은 **모양에 없다** (백엔드 스키마와 같은 이유). */
export interface VerdictCreateBody {
  code: string;
  symbol: string;
  name: string;
  decision: string;
  confidence: number;
  source: string;
  answer: string;
  price_at?: number | null;
  agent_opinions?: unknown[];
}

/** 판단 기록. 같은 종목이면 백엔드가 덮어쓴다. */
export async function saveVerdict(
  ownerKey: string,
  body: VerdictCreateBody,
): Promise<VerdictRecord> {
  const wire = await apiPost<WireVerdict>("/advice/verdicts", body, {
    headers: { "X-Owner-Key": ownerKey },
  });
  return toVerdictRecord(wire);
}

/** 공유를 켜고 갱신된 기록을 돌려준다. 두 번 켜도 같은 `shareId` 다. */
export async function enableVerdictShare(
  ownerKey: string,
  code: string,
): Promise<VerdictRecord> {
  const wire = await apiPost<WireVerdict>(
    `/advice/verdicts/${encodeURIComponent(code)}/share`,
    {},
    { headers: { "X-Owner-Key": ownerKey } },
  );
  return toVerdictRecord(wire);
}
