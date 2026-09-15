/**
 * 친구에게 이 사이트를 보내는 일.
 *
 * ## 무엇을 보내나 — **주소 하나뿐이다**
 *
 * 사주 결과도, 생년월일시도, 어떤 식별자도 링크에 싣지 않는다. 보내는 것은
 * `aiot21.com` 이고, 링크를 받은 사람은 **자기 사주를 새로 본다.** 그래서 이
 * 기능에는 서버도, 저장도, 공유 토큰도 없다 — 주식 쪽 `/verdict/{shareId}` 와
 * 다른 점이 이것이다(그쪽은 남의 판단을 열어 주므로 발급한 id 가 필요하다).
 *
 * 무료 경로가 아무것도 저장하지 않는다는 약속(`model/storage.ts`)을 공유 기능이
 * 깨지 않는다는 뜻이기도 하다.
 *
 * ## 왜 카카오 SDK 가 아닌가
 *
 * `navigator.share` 는 모바일에서 **OS 공유 시트**를 연다 — 카톡·문자·인스타가
 * 그 한 번에 전부 들어 있다. 카카오 SDK 를 붙이면 카톡 하나만 커버하면서 JS 키 ·
 * 도메인 등록 · 스크립트 로드가 따라온다. 얻는 것보다 드는 것이 크다.
 *
 * 데스크톱에는 대개 공유 시트가 없다. 거기서는 복사가 자연스럽다 — 주식 쪽
 * `VerdictSaveBar` 가 같은 판단을 했다.
 *
 * ## 왜 브라우저 API 를 직접 부르지 않고 주입받나
 *
 * 이 저장소의 프런트 테스트는 `node --test` 에 `src/**​/*.test.ts` 글롭 하나다
 * (`package.json`) — `.tsx` 도, DOM 도 없다. `navigator` 를 이 파일 안에서 만지면
 * **분기 하나도 확인할 수 없고**, 확인할 수 없는 분기가 하필 "사용자가 취소했다"
 * 와 "정말 실패했다" 를 가르는 자리다. 컴포넌트가 실제 `navigator` 를 넘긴다.
 */

/** 공유 시트에 실리는 것. `url` 만 필수다 — 제목·문구는 OS 가 버릴 수 있다. */
export interface ShareTarget {
  url: string;
  title?: string;
  text?: string;
}

/**
 * 이 브라우저가 할 수 있는 일. 없는 것은 넘기지 않는다.
 *
 * `navigator.share`·`navigator.clipboard` 를 그대로 받지 않고 함수 둘로 좁힌 것은,
 * 이 모듈이 알아야 하는 것이 "공유할 수 있나 · 복사할 수 있나" 뿐이기 때문이다.
 */
export interface ShareCapabilities {
  share?: (data: ShareTarget) => Promise<void>;
  copy?: (text: string) => Promise<void>;
}

/**
 * 무슨 일이 일어났나. **`cancelled` 를 따로 두는 것이 요점이다.**
 *
 * 사용자가 공유 시트를 닫은 것은 실패가 아니다. 그것을 `failed` 로 접으면 화면이
 * "공유하지 못했습니다" 를 띄우는데, 방금 스스로 그만둔 사람에게 그건 고장으로
 * 읽힌다.
 */
export type ShareOutcome = "shared" | "copied" | "cancelled" | "unsupported" | "failed";

/**
 * 친구에게 보낼 주소.
 *
 * 빌드에 박힌 `NEXT_PUBLIC_APP_ORIGIN` 을 우선한다(`PayButton` 이 토스 콜백 주소에
 * 쓰는 것과 같은 값). 없으면 브라우저가 보고 있는 주소를 쓴다 — 로컬·프리뷰
 * 배포에서 링크가 빈 채로 나가지 않게 하는 안전망이다.
 *
 * 끝의 슬래시는 떨어뜨린다. 채팅창에 붙은 `aiot21.com/` 은 손으로 적은 것처럼
 * 보이지 않는다.
 */
export function shareUrl(configured: string | undefined, fallback: string): string {
  const origin = configured?.trim() ? configured.trim() : fallback;
  return origin.replace(/\/+$/, "");
}

/**
 * 공유 시트를 열고, 없으면 복사한다.
 *
 * 순서가 중요하다 — 시트가 있으면 시트가 낫다. 복사는 "붙여 넣을 곳" 을 사용자가
 * 직접 찾아야 하지만 시트는 받는 사람을 고르는 것으로 끝난다.
 */
export async function shareLink(
  target: ShareTarget,
  capabilities: ShareCapabilities,
): Promise<ShareOutcome> {
  if (capabilities.share) {
    try {
      await capabilities.share(target);
      return "shared";
    } catch (error) {
      // **취소는 여기서 끝난다.** 아래 복사로 내려가면, 공유를 그만두겠다고 말한
      // 사람의 클립보드를 우리 링크로 덮어쓰게 된다 — 그 사람이 복사해 두었던
      // 것을 되돌릴 방법은 없다.
      if (isAbort(error)) return "cancelled";
      // 취소가 아닌 실패(권한·미지원 데이터)는 복사로 내려간다. 링크를 손에
      // 쥐여 주는 것이 아무것도 하지 않는 것보다 낫다.
    }
  }

  if (!capabilities.copy) return "unsupported";

  try {
    await capabilities.copy(target.url);
    return "copied";
  } catch {
    return "failed";
  }
}

/**
 * 사용자가 공유 시트를 닫았는가.
 *
 * `instanceof DOMException` 으로 보지 않는다 — 그 생성자는 환경마다 다르고
 * (테스트는 DOM 이 아니다) 여기서 알아야 하는 것은 클래스가 아니라 **이름**이다.
 * `AbortError` 는 이 API 가 취소를 말하는 방식이다.
 */
function isAbort(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}
