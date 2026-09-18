"use client";

import { useState } from "react";
import { APP_ORIGIN } from "@/lib/config/public";
import { SAJU_EVENT } from "@/shared/analytics/events";
import { Icon } from "@/shared/ui";
import { trackSaju } from "../model/analytics";
import { shareLink, shareUrl, type ShareOutcome } from "../model/share";

/**
 * 친구에게 이 사이트를 보내는 버튼.
 *
 * ## 보내는 것은 주소 하나다
 *
 * 사주 결과도 생년월일시도 링크에 실리지 않는다 — 무엇을 보내고 무엇을 보내지
 * 않는지, 그리고 왜 카카오 SDK 가 아닌지는 `../model/share` 모듈 주석에 있다.
 *
 * ## 브라우저 API 를 여기서 집는다
 *
 * `navigator` 를 만지는 자리는 이 파일뿐이고, 무엇을 할지 정하는 것은 순수 함수다.
 * 그래야 "취소했다 / 실패했다" 분기를 테스트로 덮을 수 있다(`share.test.ts`).
 *
 * `navigator.share` 를 **호출 시점에** 본다. 렌더 시점에 보면 서버에는 `navigator`
 * 가 없어 하이드레이션이 어긋나고, "복사" 라벨이 한 번 번쩍인 뒤 "공유" 로 바뀐다.
 *
 * ## 결과를 말하는 방식
 *
 * 라벨이 잠깐 바뀌는 것으로 끝낸다. 상자를 띄우면 방금 읽던 풀이를 밀어내고,
 * 사용자가 그것을 닫는 동작을 하나 더 해야 한다.
 *
 * 되돌리지 않는다 — 라벨을 원래대로 돌리는 타이머를 두면, 사용자가 다시 보려고
 * 눈을 돌린 사이에 문구가 사라진다. 다음 클릭이 덮는다.
 */

/** 공유 시트에 실리는 문구. OS 가 버릴 수도 있지만, 살면 받는 쪽이 먼저 읽는다. */
const TITLE = "AI Of Tellers · 사주팔자";
const TEXT = "태어난 시각을 진태양시로 바로잡은 사주 여덟 글자. 회원가입 없이 볼 수 있어요.";

/** 결과 → 버튼에 남길 말. `shared` 는 시트가 이미 말해 줬으므로 조용하다. */
const SAID: Record<ShareOutcome, string | null> = {
  shared: null,
  copied: "링크 복사됨",
  cancelled: null,
  // 복사도 공유도 못 하는 브라우저다. 주소창을 가리키는 것이 유일하게 정직한 안내다.
  unsupported: "주소창의 주소를 복사해 주세요",
  failed: "복사하지 못했습니다",
};

/**
 * 어느 화면의 버튼인가. 티저의 공유와 리포트를 다 읽은 뒤의 공유는 **동기가
 * 다르고**, 둘을 한 칸에 합치면 어느 쪽이 바이럴을 만드는지 알 수 없다.
 */
export type ShareSurface = "teaser" | "report";

export function ShareButton({
  surface,
  className = "",
}: {
  surface: ShareSurface;
  className?: string;
}) {
  const [said, setSaid] = useState<string | null>(null);

  async function onClick() {
    const url = shareUrl(
      APP_ORIGIN,
      // 이 함수는 클릭 핸들러 안에서만 돌므로 `window` 가 반드시 있다.
      window.location.origin,
    );

    const outcome = await shareLink(
      { url, title: TITLE, text: TEXT },
      {
        // `navigator.share` 는 사용자 제스처 안에서만 허용된다 — 그래서 여기,
        // 클릭 핸들러 안이어야 한다. `bind` 하는 것은 분리된 함수로 부르면
        // `Illegal invocation` 이 나기 때문이다.
        share: typeof navigator !== "undefined" && navigator.share
          ? navigator.share.bind(navigator)
          : undefined,
        copy: typeof navigator !== "undefined" && navigator.clipboard
          ? navigator.clipboard.writeText.bind(navigator.clipboard)
          : undefined,
      },
    );

    // 취소도 실패도 그대로 보낸다. 공유 시트를 열었다가 닫은 비율은 문구를
    // 고칠지 판단하는 재료이고, `unsupported` 가 잦으면 복사 폴백이 실제로
    // 필요하다는 증거다.
    trackSaju(SAJU_EVENT.siteShared, { outcome, surface });

    setSaid(SAID[outcome]);
  }

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[var(--tap)] items-center gap-2 rounded-pill border border-hairline bg-surface-warm px-5 py-2.5 text-[13.5px] font-medium text-gold-text-strong transition-colors hover:border-gold-text"
      >
        <Icon name="share" size={15} className="flex-none" />
        친구에게 알려주기
      </button>

      {/* `aria-live` — 라벨이 아니라 이 줄이 바뀌므로, 스크린리더 사용자에게는
          알려 주지 않으면 아무 일도 일어나지 않은 것과 같다. */}
      <p aria-live="polite" className="min-h-[1rem] text-[11.5px] text-muted-2">
        {said}
      </p>
    </div>
  );
}
