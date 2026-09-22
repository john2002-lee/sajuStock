import { apiGet } from "@/lib/api";
import type { SharedReading } from "../model/types";
import { toSharedReading, type WireSharedReading } from "./wire";

/**
 * 공유된 사주 조회. **서버에서만 실행된다** (`features/saju/server.ts`).
 *
 * ## 왜 발급(POST)은 여기 없나
 *
 * 발급은 BFF 라우트가 본문을 **그대로 흘려보낸다**(`app/api/saju/shares/route.ts`)
 * — `api/saju/chart` 와 같은 모양이다. 와이어 변환은 이미 클라이언트가 하고
 * (`fromBirthInput`), 라우트가 할 일은 레이트리밋과 실패 코드 보존뿐이라 그 사이에
 * 함수를 하나 더 두면 타입만 한 겹 늘고 검증은 늘지 않는다.
 *
 * ## `null` 을 돌려준다 — 던지지 않는다
 *
 * 서버 컴포넌트가 부르므로 던지면 페이지가 500 이 된다. 만료된 링크에 맞는 답은
 * 500 이 아니라 "없다" 다. 주식 쪽 `getSharedVerdict` 가 같은 판단을 했다.
 *
 * ## 캐시하지 않는다
 *
 * `apiGetCached` 를 쓰지 않는다. Next 데이터 캐시의 키는 URL 이라
 * (`lib/api/client.ts` 의 `CachedRequestOptions` 주석) 사용자별 데이터가 들어가면
 * 안 되고, 무엇보다 **만료가 캐시보다 오래 살면 안 된다** — 7일이 지나 404 가 되어야
 * 할 링크가 캐시 때문에 계속 열린다.
 */
export async function getSharedReading(shareId: string): Promise<SharedReading | null> {
  try {
    const wire = await apiGet<WireSharedReading>(
      `/saju/shares/${encodeURIComponent(shareId)}`,
    );
    if (!wire) return null;
    return toSharedReading(wire);
  } catch {
    // 없는 링크 · 만료된 링크 · 백엔드 장애를 구분하지 않는다. 화면이 할 수 있는
    // 일이 셋 다 같고(404 를 그린다), 구분해 주면 "있었지만 만료됐다" 가 곧 그
    // 사람이 이 서비스를 썼다는 확인이 된다 — 백엔드도 같은 이유로 합쳤다.
    return null;
  }
}
