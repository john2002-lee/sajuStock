"use client";

import { useRef, useState } from "react";
import { APP_ORIGIN } from "@/lib/config/public";
import { bff } from "@/lib/http/browser";
import { SAJU_EVENT } from "@/shared/analytics/events";
import { Icon } from "@/shared/ui";
import { trackSaju } from "../model/analytics";
import { loadReading, saveReading } from "../model/storage";
import { shareLink, shareResultUrl, shareUrl, type ShareOutcome } from "../model/share";
import type { BirthInput } from "../model/types";
import type { WireShareCreated } from "../services/wire";
import { fromBirthInput } from "../services/wire";

/**
 * 친구에게 보내는 버튼.
 *
 * ## 무엇을 보내나
 *
 * `birth` 를 받으면 **결과 링크**(`/saju/s/{shareId}`)를 보낸다 — 받은 사람이 보낸
 * 사람의 여덟 글자를 본다. 받지 않으면 사이트 주소만 보낸다.
 *
 * 발급은 서버에 여덟 글자를 남긴다. 그 범위와 기한(무엇을 담지 않는지, 왜 7일인지)은
 * 백엔드 `app/models/saju_share.py` 모듈 주석에 있다. **생년월일시는 저장되지
 * 않는다** — 발급 요청에 실려 가지만 서버는 계산에만 쓰고 버린다.
 *
 * ## 발급은 한 번만
 *
 * 발급받은 id 를 `StoredReading` 안에 넣어 둔다(`model/storage.ts`). 두 번째 클릭은
 * 같은 링크를 다시 보낸다 — 누를 때마다 새로 발급하면 먼저 보낸 링크가 살아 있는
 * 채로 표에 쓰레기가 쌓이고, 주식 쪽 `enable_share` 가 같은 이유로 id 를 재발급하지
 * 않는다.
 *
 * **id 를 별도 키가 아니라 `StoredReading` 안에 두는 것이 중요하다.** 한 기기로
 * 본인·배우자·자녀의 사주를 대신 보는 것이 이 제품의 지배적 사용 행태다
 * (`docs/analytics/saju-amplitude-taxonomy.md`). 옆에 따로 두면 새 사주를 입력한 뒤
 * 공유를 눌렀을 때 **앞사람의 링크가 나가고**, 그건 남의 사주를 보내는 사고다.
 * `saveReading` 이 객체를 통째로 덮으므로 이 안에 있으면 새 계산이 id 를 함께
 * 무효화한다.
 *
 * ## 브라우저 API 를 여기서 집는다
 *
 * `navigator` 를 만지는 자리는 이 파일뿐이고, 무엇을 할지 정하는 것은 순수 함수다.
 * 그래야 "취소했다 / 실패했다" 분기를 테스트로 덮을 수 있다(`share.test.ts`).
 *
 * `navigator.share` 를 **호출 시점에** 본다. 렌더 시점에 보면 서버에는 `navigator`
 * 가 없어 하이드레이션이 어긋나고, "복사" 라벨이 한 번 번쩍인 뒤 "공유" 로 바뀐다.
 *
 * ## 제스처가 만료될 수 있다
 *
 * 발급은 네트워크 왕복이라, 그 뒤의 `navigator.share` 는 사용자 제스처의 유효
 * 기간을 벗어날 수 있다(Safari 가 엄격하다). 그때는 시트가 거절하고 **복사로
 * 내려간다** — `shareLink` 의 폴백이 이미 그 길이다. 링크를 손에 쥐여 주는 것이
 * 아무것도 하지 않는 것보다 낫고, 그래서 미리 발급해 두지 않는다: 누르지도 않은
 * 사람의 여덟 글자를 서버에 남기는 것이 훨씬 나쁘다.
 *
 * ## 결과를 말하는 방식
 *
 * 라벨 아래 한 줄이 잠깐 바뀌는 것으로 끝낸다. 상자를 띄우면 방금 읽던 풀이를
 * 밀어내고, 사용자가 그것을 닫는 동작을 하나 더 해야 한다.
 *
 * 되돌리지 않는다 — 문구를 원래대로 돌리는 타이머를 두면, 사용자가 다시 보려고
 * 눈을 돌린 사이에 문구가 사라진다. 다음 클릭이 덮는다.
 */

/** 공유 시트에 실리는 문구. OS 가 버릴 수도 있지만, 살면 받는 쪽이 먼저 읽는다. */
const TITLE = "AI Of Tellers · 사주팔자";
const SITE_TEXT = "태어난 시각을 진태양시로 바로잡은 사주 여덟 글자. 회원가입 없이 볼 수 있어요.";
const RESULT_TEXT = "제 사주 여덟 글자예요. 그쪽 것도 진태양시로 바로잡아 무료로 볼 수 있어요.";

/** 결과 → 아래 줄에 남길 말. `shared` 는 시트가 이미 말해 줬으므로 조용하다. */
const SAID: Record<ShareOutcome, string | null> = {
  shared: null,
  copied: "링크 복사됨",
  cancelled: null,
  // 복사도 공유도 못 하는 브라우저다. 주소창을 가리키는 것이 유일하게 정직한 안내다.
  unsupported: "주소창의 주소를 복사해 주세요",
  failed: "공유하지 못했습니다",
};

/** 발급에 실패했을 때. 결과는 못 보내지만 사이트는 보낸다 — 그 사실을 말해 준다. */
const MINT_FAILED = "결과 링크를 만들지 못해 사이트 주소를 보냈어요";

/**
 * 어느 화면의 버튼인가. 티저의 공유와 리포트를 다 읽은 뒤의 공유는 **동기가
 * 다르고**, 둘을 한 칸에 합치면 어느 쪽이 바이럴을 만드는지 알 수 없다.
 */
export type ShareSurface = "teaser" | "report";

export function ShareButton({
  surface,
  birth,
  className = "",
}: {
  surface: ShareSurface;
  /**
   * 공유할 사주의 원본 입력. 없으면 사이트 주소만 보낸다.
   *
   * 유료 리포트 화면은 이 값을 갖고 있지 않다(토큰만 든다). 그쪽이 결과 링크를
   * 보내려면 토큰으로 발급하는 별도 경로가 필요하고, 그건 아직 없다 — 그래서
   * 그 화면은 사이트 주소를 보낸다. **`/saju/reports/{token}` 을 공유 주소로
   * 쓰는 길은 없다**: 그 토큰은 전체 접근 자격증명이고 응답에 양력 생년월일이
   * 들어 있다.
   */
  birth?: BirthInput;
  className?: string;
}) {
  const [said, setSaid] = useState<string | null>(null);
  /** 연타 막기. 발급이 왕복이라 두 번 누르면 링크가 둘 생긴다. */
  const busy = useRef(false);

  /**
   * 공유할 주소를 정한다. 필요하면 발급하고, 발급한 id 는 저장소에 되돌려 넣는다.
   *
   * `null` 은 "결과 링크를 못 만들었다" 다 — 부르는 쪽이 사이트 주소로 내려간다.
   */
  async function resultUrl(origin: string): Promise<string | null> {
    if (!birth) return null;

    // 이미 발급받았으면 그것을 쓴다. 저장소를 다시 읽는 이유는, 이 컴포넌트가
    // 마운트된 뒤 다른 탭·다른 화면이 값을 갱신했을 수 있기 때문이다.
    const stored = loadReading();
    if (stored?.shareId) return shareResultUrl(origin, stored.shareId);

    try {
      const created = await bff.post<WireShareCreated>("/api/saju/shares", {
        birth: fromBirthInput(birth),
      });
      if (!created?.share_id) return null;

      // 저장소에 되돌려 넣는다. 실패해도 링크는 이미 손에 있으므로 조용하다 —
      // 다음 클릭이 한 번 더 발급하는 것이 최악이다.
      if (stored) saveReading({ ...stored, shareId: created.share_id });

      return shareResultUrl(origin, created.share_id);
    } catch {
      // 레이트리밋·검증 실패·백엔드 장애. 화면이 할 수 있는 일이 셋 다 같다.
      return null;
    }
  }

  async function onClick() {
    if (busy.current) return;
    busy.current = true;

    try {
      const origin = shareUrl(
        APP_ORIGIN,
        // 이 함수는 클릭 핸들러 안에서만 돌므로 `window` 가 반드시 있다.
        window.location.origin,
      );

      const url = await resultUrl(origin);
      const mintFailed = Boolean(birth) && url === null;

      const outcome = await shareLink(
        {
          url: url ?? origin,
          title: TITLE,
          text: url ? RESULT_TEXT : SITE_TEXT,
        },
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
      //
      // `share_kind` 는 **결과 링크가 실제로 나갔는지**다 — `birth` 를 받았는지가
      // 아니다. 발급이 실패하면 조용히 사이트 주소가 나가므로, 그 둘을 한 값으로
      // 합치면 "공유는 됐는데 결과가 아니었다" 를 영원히 못 본다.
      trackSaju(SAJU_EVENT.siteShared, {
        outcome,
        surface,
        share_kind: url ? "result" : "site",
      });

      // 발급 실패는 결과보다 먼저 말한다 — "링크 복사됨" 만 뜨면 사용자는 자기
      // 사주가 담긴 링크를 보냈다고 믿는다.
      setSaid(mintFailed ? MINT_FAILED : SAID[outcome]);
    } finally {
      busy.current = false;
    }
  }

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[var(--tap)] items-center gap-2 rounded-pill border border-hairline bg-surface-warm px-5 py-2.5 text-[13.5px] font-medium text-gold-text-strong transition-colors hover:border-gold-text"
      >
        <Icon name="share" size={15} className="flex-none" />
        {birth ? "결과 공유하기" : "친구에게 알려주기"}
      </button>

      {/* `aria-live` — 라벨이 아니라 이 줄이 바뀌므로, 스크린리더 사용자에게는
          알려 주지 않으면 아무 일도 일어나지 않은 것과 같다. */}
      <p aria-live="polite" className="min-h-[1rem] text-center text-[11.5px] text-muted-2">
        {said}
      </p>
    </div>
  );
}
