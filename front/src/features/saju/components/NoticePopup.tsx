"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Icon } from "@/shared/ui";
import { TEST_PAYMENT_NOTICE } from "@/lib/config/payment-mode";
import { Shaman } from "./Shaman";

/**
 * 첫 화면 오른쪽 아래에 뜨는 안내 팝업.
 *
 * ## 무엇을 알리나 — 지금은 "결제가 테스트다"
 *
 * 전에는 추석·오픈 기념 **무료 행사**를 알렸고, 그 행사는 2026-09-20 에 닫혔다.
 * 지금 알리는 것은 결제가 테스트 키로 돈다는 사실이다 — 결제창은 진짜로 열리지만
 * 실제 카드가 긁히지 않는다.
 *
 * 이 사실은 **손으로 켜지 않는다.** `active` 로 받는 값의 출처는
 * `lib/config/payment-mode` 의 `IS_TEST_PAYMENT` 이고, 그것은 토스 클라이언트 키
 * 접두사에서 나온다. 라이브 키를 넣고 다시 빌드하면 이 팝업은 저절로 사라진다.
 *
 * ## 이것이 유일한 고지는 아니다
 *
 * 같은 문장이 결제 버튼 바로 아래에도 있다(`PayButton`). 그쪽이 **진짜 고지**다 —
 * 돈이 걸리는 순간에 눈앞에 있고, 닫을 수 없다. 이 팝업은 처음 온 사람에게
 * 한 번 크게 알리는 역할이다.
 *
 * 그래서 닫으면 **다시 뜨지 않는다.** 행사 안내였을 때는 기간이 2주라 하루 단위로
 * 다시 띄웠지만, 이 고지는 기약이 없다. 매일 같은 팝업을 다시 던지면 사주를 보러
 * 온 사람이 팝업을 닫으러 오게 된다. 잊어버릴 위험은 결제 버튼 쪽 문장이 받는다.
 *
 * ## 닫았는지는 브라우저만 안다
 *
 * `localStorage` 에 있어 서버가 알 수 없다. 그 한 조각만 `useSyncExternalStore` 로
 * 읽는다 — **서버 스냅샷은 언제나 `false`**(= 닫은 적 없음이 아니라 "아직 모른다")
 * 이고 브라우저에서만 참이 된다. `useEffect` 에서 `setState` 로 켜는 방법도 있지만
 * 렌더를 한 번 더 돌리는 일이라 이 저장소의 lint 가 막는다
 * (`react-hooks/set-state-in-effect`).
 *
 * 저장소는 실패할 수 있다(사파리 프라이빗, 차단된 사이트 데이터). 읽기·쓰기를
 * 각각 감싸고, 실패하면 "닫은 적 없음" 으로 떨어진다 — 팝업이 한 번 더 뜨는
 * 것이 화면이 깨지는 것보다 낫다.
 *
 * ## **모달이 아니다**
 *
 * 이 팝업은 안내일 뿐 사용자가 답해야 하는 질문이 아니다. 모달로 두면 사주를
 * 보러 온 사람이 **입력을 시작하기 전에 팝업부터 처리**해야 하고, 화면 전체를
 * 덮은 백드롭이 첫 클릭을 삼켜 그 클릭이 아래 입력칸에 닿지 않는다.
 *
 * 그래서 셋을 모두 뺐다: `aria-modal`, 열릴 때의 포커스 이동, 그리고 바깥
 * 클릭·Escape 를 듣는 document 리스너. 껍데기는 `pointer-events-none` 이라
 * 아래 화면이 그대로 눌리고, 패널만 `pointer-events-auto` 로 되받는다.
 *
 * 남는 것은 **보이는 닫기 버튼 둘**이다. 포커스를 가두지 않으므로 키보드
 * 사용자는 DOM 순서대로 팝업에 닿고, 그 전에 입력을 시작해도 막히지 않는다.
 * 역할도 `dialog` 가 아니라 `region` 이다 — 포커스를 옮기지 않으면서 dialog 라고
 * 말하면 스크린리더 사용자가 받는 예고와 실제가 어긋난다.
 */

/**
 * 행사 팝업이 쓰던 키(`aiot:event-popup-dismissed`)를 **재사용하지 않는다.**
 * 그 키에는 행사 안내를 닫은 날짜가 들어 있어서, 그대로 쓰면 어제 행사 팝업을
 * 닫은 사람이 오늘 결제 고지를 못 본다. 뜻이 달라졌으면 키도 달라야 한다.
 */
const DISMISS_KEY = "aiot:test-payment-notice-dismissed";

function dismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) !== null;
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // 저장하지 못하면 다음 방문에 한 번 더 뜬다. 그뿐이다.
  }
}

/** 구독할 바깥 변화가 없다 — 한 번 정해지면 사용자가 닫기 전까지 그대로다. */
const NO_SUBSCRIBE = () => () => {};

/** 아직 닫은 적이 없는가. 브라우저에서만 참이 될 수 있다(서버는 저장소를 못 읽는다). */
function notDismissedYet(): boolean {
  return !dismissed();
}

export interface NoticePopupProps {
  /**
   * 고지를 띄울 상황인가. 지금 넘어오는 값은 `IS_TEST_PAYMENT` 다.
   *
   * 값이 빌드 시점에 정해지더라도 prop 으로 받는 모양은 남겨 둔다 — 이 컴포넌트가
   * "무엇을 근거로 뜨는지" 를 부르는 쪽이 정하게 하는 편이, 다음 고지가 생겼을 때
   * 컴포넌트를 다시 열지 않아도 되게 한다.
   */
  readonly active: boolean;
}

export function NoticePopup({ active }: NoticePopupProps) {
  const fresh = useSyncExternalStore(NO_SUBSCRIBE, notDismissedYet, () => false);
  const [closed, setClosed] = useState(false);
  const open = active && fresh && !closed;

  const titleId = useId();

  /**
   * **닫는 방법마다 뜻이 다를 이유가 없다.** X 와 확인 버튼 둘 다 "봤고 지금은 됐다"
   * 이므로 똑같이 기억한다. 예전에 이 함수가 `remember = false` 로 시작해서 닫는
   * 길 넷 중 셋이 아무것도 저장하지 않았고, 그래서 매 방문 같은 팝업이 다시 떴다.
   */
  function close() {
    rememberDismissal();
    setClosed(true);
  }

  if (!open) return null;

  return (
    <div
      // 화면을 **덮지 않는다.** 딤도 블러도 없고, 껍데기는 포인터를 통과시켜
      // 아래 입력칸이 첫 클릭부터 눌린다. 패널만 `pointer-events-auto` 로 되받는다.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 sm:justify-end sm:p-6"
    >
      <div
        role="region"
        aria-labelledby={titleId}
        // **팔레트를 뒤집는다** — 라이트 화면에서는 어두운 카드, 다크 화면에서는
        // 밝은 카드. 딤도 백드롭도 없는 모데리스 안내라 지면과 같은 색이면
        // 눈에 걸리지 않는다. 색을 새로 고르는 대신 이미 대비를 맞춰 둔 반대편
        // 팔레트를 통째로 끌어온다 (`globals.css` 의 `[data-palette="flip"]`).
        data-palette="flip"
        // `text-ink` 는 장식이 아니라 **안전장치**다. 팔레트를 뒤집으면 배경은
        // 따라오지만 상속 글자색은 바깥(원래 테마) 값 그대로라, 토큰 클래스 없이
        // 글자를 하나 넣는 순간 어두운 바탕에 어두운 글자가 된다.
        className="pointer-events-auto w-full max-w-[26rem] overflow-hidden rounded-card border border-hairline bg-surface text-ink shadow-mockup"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <p className="font-mono-kr text-[10px] tracking-[0.22em] text-gold-text">NOTICE</p>
          <button
            type="button"
            onClick={close}
            aria-label="안내 닫기"
            className="-mr-2 -mt-2 flex min-h-[var(--tap)] min-w-[var(--tap)] items-center justify-center rounded-pill text-muted-2 transition-colors hover:bg-surface-warm hover:text-gold-text-strong"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex items-center gap-4 px-5 pb-1 pt-1">
          {/* 무당이 인사하는 컷. 팝업은 첫 화면에 바로 뜨므로 `eager` 다. */}
          <Shaman expression="welcome" eager className="w-[92px] flex-none rounded-card-sm" />

          <div className="min-w-0">
            <h2
              id={titleId}
              className="font-display text-[19px] font-light leading-[1.35] text-ink"
            >
              지금은
              <span className="block text-gold-text">테스트 운영 중</span>
            </h2>
            {/* 문구는 `payment-mode` 한 곳에서 온다 — 결제 버튼 아래의 고지와
                한 글자도 달라지면 안 된다. */}
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              {TEST_PAYMENT_NOTICE}
            </p>
          </div>
        </div>

        <p className="px-5 pt-3 text-[12.5px] leading-relaxed text-muted-2">
          사주팔자와 풀이는 정상적으로 보실 수 있습니다.
        </p>

        <div className="mt-4 flex items-center justify-end border-t border-hairline px-5 py-3">
          <button
            type="button"
            onClick={close}
            className="min-h-[var(--tap)] rounded-pill bg-button-gradient px-5 text-[13.5px] font-bold text-on-primary shadow-cta"
          >
            확인했습니다
          </button>
        </div>
      </div>
    </div>
  );
}
