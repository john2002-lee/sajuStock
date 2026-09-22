/**
 * 친구에게 보내는 일.
 *
 * ## 무엇을 보내나 — 주소, 또는 **결과 링크**
 *
 * 길이 둘이다.
 *
 * - `shareUrl` — 사이트 주소(`aiot21.com`) 하나. 링크를 받은 사람은 자기 사주를
 *   새로 본다. 결과도, 생년월일시도, 식별자도 실리지 않는다.
 * - `shareResultUrl` — 발급받은 공유 id 로 만든 `/saju/s/{shareId}`. 링크를 받은
 *   사람이 **보낸 사람의 여덟 글자**를 본다.
 *
 * 둘을 한 함수로 합치지 않았다. 아래 `shareUrl` 의 주석이 "오직 오리진만 보낸다"
 * 는 **진술**이고, 그 진술이 계속 참이어야 이 모듈을 읽는 사람이 무료 경로가
 * 무엇을 흘리는지 한 번에 판단할 수 있다.
 *
 * ## 결과 링크는 서버에 여덟 글자를 남긴다
 *
 * 그 대가와 범위 — 무엇을 담지 않는지, 왜 7일인지 — 는 백엔드
 * `app/models/saju_share.py` 모듈 주석에 있다. 생년월일시 원본은 **어느 경로에서도
 * 저장되지 않는다**: 발급 요청에 실려 가지만 서버는 계산에만 쓰고 버린다.
 *
 * 링크에는 사주가 실리지 않는다 — `shareId` 는 서버가 낸 128비트 난수이고, 주소
 * 자체에서 역산할 수 있는 것이 없다. 생년월일시를 쿼리스트링에 싣지 않는다는
 * `model/storage.ts` 의 판단이 여기서도 유지되는 이유다.
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
 * 공유된 결과를 여는 주소의 경로. 한 곳에 둔다 — 화면 링크·`robots.ts` 의 차단
 * 목록·분석 마스킹(`shared/analytics/redact.ts`)이 같은 문자열을 말해야 한다.
 */
export const SHARE_PATH = "/saju/s";

/**
 * 발급받은 공유 id 로 친구에게 보낼 주소를 만든다.
 *
 * `origin` 은 이미 `shareUrl` 을 거친 값을 넘긴다 — 끝 슬래시 정리를 두 곳에서
 * 하면 한쪽을 고칠 때 다른 쪽이 남는다.
 *
 * id 를 인코딩하는 것은 `token_urlsafe` 가 URL 안전 알파벳만 쓰기 때문에 사실상
 * 변화가 없지만, **서버가 id 생성 방식을 바꾸는 날** 이 자리가 조용히 깨지지 않게
 * 한다.
 */
export function shareResultUrl(origin: string, shareId: string): string {
  return `${origin}${SHARE_PATH}/${encodeURIComponent(shareId)}`;
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
