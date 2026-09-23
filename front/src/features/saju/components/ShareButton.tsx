"use client";

import { useRef, useState } from "react";
import { APP_ORIGIN } from "@/lib/config/public";
import { bff } from "@/lib/http/browser";
import { SAJU_EVENT } from "@/shared/analytics/events";
import { Icon } from "@/shared/ui";
import { trackSaju } from "../model/analytics";
import { loadReading, saveReading } from "../model/storage";
import {
  shareLink,
  shareReportUrl,
  shareResultUrl,
  shareUrl,
  type ShareOutcome,
} from "../model/share";
import type { BirthInput } from "../model/types";
import type { WireShareCreated } from "../services/wire";
import { fromBirthInput } from "../services/wire";

/**
 * 친구에게 보내는 버튼.
 *
 * ## 무엇을 보내나
 *
 * `birth` 나 `token` 을 받으면 **결과 링크**(`/saju/s/{shareId}`)를 보낸다 — 받은
 * 사람이 보낸 사람의 여덟 글자를 본다. 둘 다 없으면 사이트 주소만 보낸다.
 *
 * 발급은 서버에 여덟 글자를 남긴다. 그 범위와 기한(무엇을 담지 않는지, 왜 7일인지)은
 * 백엔드 `app/models/saju_share.py` 모듈 주석에 있다. **생년월일시는 저장되지
 * 않는다** — 발급 요청에 실려 가지만 서버는 계산에만 쓰고 버린다.
 *
 * ## 무료와 유료가 보내는 것이 다르다
 *
 * - 무료(`birth`) → `/saju/s/{shareId}`. 여덟 글자와 무료 요약. 생년월일시를 보내
 *   서버가 다시 계산한다 — 브라우저가 만든 요약문을 공개 페이지에 실을 수 없다.
 * - 유료(`token`) → `/saju/r/{shareId}`. **리포트 본문과 계산 패널.** 산 사람이
 *   보내고 싶어 하는 것이 여덟 글자가 아니라 풀이라서다.
 *
 * 유료 쪽도 **접근 토큰이 주소가 되는 것이 아니다.** 토큰은 발급 요청에만 실리고,
 * 나가는 id 는 그것과 무관한 두 번째 난수다(`saju_orders.report_share_id`). 그
 * 주소로 여는 응답에는 생년월일도 추가 질문도 토큰도 없다.
 *
 * ## 발급은 한 번만 — 그 기억을 어디에 두는지가 다르다
 *
 * 두 번째 클릭은 같은 링크를 다시 보낸다. 누를 때마다 새로 발급하면 먼저 보낸
 * 링크가 살아 있는 채로 표에 쓰레기가 쌓이고, 주식 쪽 `enable_share` 가 같은
 * 이유로 id 를 재발급하지 않는다.
 *
 * **무료는 브라우저가 기억한다.** 발급받은 id 를 `StoredReading` 안에 넣어 둔다
 * (`model/storage.ts`). 별도 키가 아니라 그 객체 **안**이어야 한다: 한 기기로
 * 본인·배우자·자녀의 사주를 대신 보는 것이 이 제품의 지배적 사용 행태이고
 * (`docs/analytics/saju-amplitude-taxonomy.md`), 옆에 따로 두면 새 사주를 입력한 뒤
 * 공유를 눌렀을 때 **앞사람의 링크가 나간다** — 남의 사주를 보내는 사고다.
 * `saveReading` 이 객체를 통째로 덮으므로 이 안에 있으면 새 계산이 id 를 함께
 * 무효화한다.
 *
 * **유료는 서버가 기억한다**(`saju_orders.report_share_id`). 이 리포트가 파는 것
 * 중 하나가 "다른 기기에서도 같은 주소로 다시 열린다" 라서, 기기마다 기억하면 열
 * 때마다 새 id 가 나가고 먼저 보낸 링크는 그대로 남는다. 그래서 이쪽은 여기서
 * 아무것도 저장하지 않는다.
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
/** 유료 리포트를 보낼 때. 받는 쪽이 여는 것이 여덟 글자가 아니라 풀이 전문이다. */
const REPORT_TEXT = "제 사주 풀이예요. 그쪽 여덟 글자도 무료로 볼 수 있어요.";

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
const MINT_FAILED = "공유 링크를 만들지 못해 사이트 주소를 보냈어요";

/**
 * 어느 화면의 버튼인가. 티저의 공유와 리포트를 다 읽은 뒤의 공유는 **동기가
 * 다르고**, 둘을 한 칸에 합치면 어느 쪽이 바이럴을 만드는지 알 수 없다.
 */
export type ShareSurface = "teaser" | "report";

export function ShareButton({
  surface,
  birth,
  token,
  className = "",
}: {
  surface: ShareSurface;
  /**
   * 공유할 사주의 원본 입력 — **무료 경로의 발급 재료다.**
   *
   * 서버가 이것을 받아 다시 계산한다. 화면이 만든 요약문을 그대로 받지 않는
   * 이유는 그 문장이 우리 도메인의 공개 페이지와 링크 미리보기 카드에 실리기
   * 때문이다(백엔드 `SajuShareRequest` 주석).
   */
  birth?: BirthInput;
  /**
   * 구매한 리포트의 접근 토큰 — **유료 경로의 발급 재료다.** 유료 화면은
   * `birth` 를 갖고 있지 않다.
   *
   * **이 값이 공유 주소가 되는 것이 아니다.** `/saju/reports/{token}` 은 로그인을
   * 대신하는 자격 증명이라, 그 주소를 받은 사람은 양력 생년월일을 보고
   * `POST /saju/reports/{token}/follow-ups` 로 **구매자의 남은 추가 질문까지 쓸 수
   * 있다.** 화면에서 입력창만 숨긴 페이지를 따로 만드는 것으로는 막히지 않는다 —
   * 받은 사람이 주소를 고치면 그만이다.
   *
   * 그래서 토큰은 발급 요청에만 실리고, 나가는 것은 그것과 무관한 두 번째 난수로
   * 만든 `/saju/r/{shareId}` 다.
   *
   * `birth` 와 함께 넘기는 화면은 없다. 둘 다 있으면 이쪽이 이긴다 — 토큰이 있는
   * 화면은 유료뿐이고, 그 화면의 정답이 이 경로다.
   */
  token?: string;
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
    if (token) return paidReportUrl(origin, token);
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

  /**
   * 구매한 리포트를 읽기 전용으로 여는 링크. **여기서는 아무것도 저장하지 않는다.**
   *
   * 서버가 발급한 id 를 주문에 기억하므로(`saju_orders.report_share_id`) 두 번째
   * 클릭은 같은 값을 받아 온다 — 그리고 그 기억은 **이 기기에 묶여 있지 않다.**
   * 브라우저에 한 번 더 적어 두면 두 기억이 어긋날 수 있고, 어긋나면 이쪽이
   * 틀린 쪽이다(다른 기기에서 이미 보낸 링크를 이 기기는 모른다).
   */
  async function paidReportUrl(origin: string, accessToken: string): Promise<string | null> {
    try {
      const created = await bff.post<WireShareCreated>("/api/saju/shares/from-report", {
        access_token: accessToken,
      });
      if (!created?.share_id) return null;
      return shareReportUrl(origin, created.share_id);
    } catch {
      // 미결제·확인중·생성중·레이트리밋·장애. 전부 "링크를 못 만들었다" 이고,
      // 그때 화면이 하는 일은 사이트 주소를 보내며 그 사실을 말하는 것이다.
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
      const mintFailed = Boolean(birth || token) && url === null;

      const outcome = await shareLink(
        {
          url: url ?? origin,
          title: TITLE,
          text: url ? (token ? REPORT_TEXT : RESULT_TEXT) : SITE_TEXT,
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
      // `share_kind` 는 **무엇이 실제로 나갔는지**다 — 발급 재료를 받았는지가
      // 아니다. 발급이 실패하면 조용히 사이트 주소가 나가므로, 그 둘을 한 값으로
      // 합치면 "공유는 됐는데 결과가 아니었다" 를 영원히 못 본다.
      //
      // 세 값이 각각 **담기는 것이 다른 주소**다: `report` 는 풀이 전문,
      // `result` 는 여덟 글자, `site` 는 아무것도 아니다. 앞의 둘을 합치면
      // 바이럴이 무엇으로 일어나는지 볼 수 없다.
      trackSaju(SAJU_EVENT.siteShared, {
        outcome,
        surface,
        share_kind: url ? (token ? "report" : "result") : "site",
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
        {birth || token ? "결과 공유하기" : "친구에게 알려주기"}
      </button>

      {/* **무엇이 나가는지 누르기 전에 말한다.**
          유료 링크에는 풀이 본문과 **주고받은 이야기**가 함께 담긴다. 추가 질문은
          사용자가 자기 사정을 직접 적은 자유 텍스트라, 그것이 나가는 줄 모르고
          누르면 놀란다 — 되돌릴 방법도 없다. 누른 뒤에 알리는 것은 고지가 아니다.

          무료 링크(`birth`)에는 여덟 글자와 요약만 담기므로 이 줄이 없다. */}
      {token && (
        <p className="max-w-[22rem] text-center text-[11.5px] leading-relaxed text-muted-2">
          풀이와 함께 <strong className="font-semibold">주고받은 이야기</strong>도 담깁니다.
          받으신 분은 읽기만 할 수 있습니다.
        </p>
      )}

      {/* `aria-live` — 라벨이 아니라 이 줄이 바뀌므로, 스크린리더 사용자에게는
          알려 주지 않으면 아무 일도 일어나지 않은 것과 같다. */}
      <p aria-live="polite" className="min-h-[1rem] text-center text-[11.5px] text-muted-2">
        {said}
      </p>
    </div>
  );
}
