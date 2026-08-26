import { apiGetCached, ApiError } from "@/lib/api";
import type { BirthPlace } from "../model/types";

/**
 * 출생지 선택지. **서버에서만 실행된다.**
 *
 * 백엔드가 소유한 폐쇄 목록이라 프런트에 상수로 복사해 두지 않는다 — 두 벌이 되면
 * 한쪽만 고치는 순간 화면에는 있는데 서버가 거부하는 지역이 생긴다.
 *
 * 캐시해도 되는 몇 안 되는 조회다: 사용자별 데이터가 아니고 (Next 데이터 캐시의
 * 키가 URL 이므로 그 점이 중요하다 — `lib/api/client.ts` 의 `CachedRequestOptions`
 * 주석), 값이 배포 사이에 바뀌지 않는다.
 */
const REVALIDATE_SECONDS = 60 * 60;

/** 백엔드가 없을 때 온보딩이 통째로 막히지 않게 하는 최소 목록. */
const FALLBACK: BirthPlace[] = [{ code: "SEOUL", label: "서울" }];

export async function getBirthPlaces(): Promise<BirthPlace[]> {
  try {
    const result = await apiGetCached<{ places: BirthPlace[] }>("/saju/places", {
      revalidate: REVALIDATE_SECONDS,
    });
    // 타임아웃은 예외가 아니라 값으로 온다 — 폼이 지역 하나로라도 뜨는 편이 낫다.
    if (!result.ok) return FALLBACK;
    return result.data.places;
  } catch (error) {
    if (error instanceof ApiError) return FALLBACK;
    throw error;
  }
}
