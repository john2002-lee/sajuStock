"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Icon } from "@/shared/ui";
import { IS_TEST_PAYMENT, TEST_PAYMENT_NOTICE } from "@/lib/config/payment-mode";
import { Shaman } from "./Shaman";

/**
 * 첫 화면 오른쪽 아래에 뜨는 안내 팝업.
 *
 * ## 무엇을 알리나 — 지금은 "추석 및 오픈기념 이벤트"
 *
 * 인사다. **혜택을 약속하지 않는다.**
 *
 * 전에는 같은 자리에서 추석·오픈 기념 **무료 행사**를 알렸다. 그 행사는 결제가
 * 복구되면서 닫혔고(`d124de3` 이 `model/event.ts` 를 지웠다), 지금 리포트는 실제
 * 결제 1,000원이다. 그래서 이 팝업은 "무료" 도 "할인" 도 말하지 않는다 — 없는
 * 혜택을 적으면 누른 사람이 결제창에서 그 사실을 알게 된다.
 *
 * 대신 **사실 하나**를 곁들인다: 여덟 글자는 회원가입 없이 볼 수 있다. 그건 이벤트가
 * 아니라 이 제품의 상시 동작이고, 지금 시작할 이유로는 충분하다.
 *
 * ## 이 팝업은 **조건 없이 뜬다** — 내릴 때는 손으로 내린다
 *
 * 앞의 고지는 `IS_TEST_PAYMENT` 에서 파생돼 라이브 키를 넣는 순간 저절로 사라졌다.
 * 이 인사에는 그렇게 쓸 값이 없다 — 이벤트는 키에도 가격에도 묶여 있지 않다.
 * 그래서 `active` 로 `true` 가 그대로 넘어온다(`app/(saju)/page.tsx`).
 *
 * **기한이 없다는 뜻은 스스로 사라지지 않는다는 뜻이다.** 추석이 지나도 계속 뜨므로,
 * 내릴 때가 되면 호출부의 한 줄을 지워야 한다. 날짜로 자동 종료하려면 서버 시각으로
 * 판정해 내려보내야 한다 — 화면이 `new Date()` 를 보면 기기 시계를 옮기는 것만으로
 * 기간이 바뀌므로, 지워진 `isFreeEvent` 가 그렇게 돼 있었다.
 *
 * ## 테스트 결제 고지는 여기서 사라지지 않는다
 *
 * 앞의 고지가 이 자리를 쓰고 있었으므로, 문구를 인사로 바꾸면 그 사실을 말할 곳이
 * 준다. 그래서 테스트 키로 도는 빌드에서는 **인사 아래에 한 줄로 남긴다.**
 *
 * **지금 운영이 그 빌드다** (`NEXT_PUBLIC_TOSS_CLIENT_KEY` 가 `test_ck_`). 결제창은
 * 진짜로 열리지만 카드가 긁히지 않으므로, 이 줄은 스테이징 전용이 아니라 실제
 * 방문자가 보는 문장이다. 라이브 키로 바꿔 다시 빌드하면 저절로 사라진다.
 *
 * 그것이 유일한 고지는 아니다 — 같은 문장이 결제 버튼 바로 아래에도 있고
 * (`PayButton`) **그쪽이 진짜 고지**다: 돈이 걸리는 순간에 눈앞에 있고 닫을 수 없다.
 *
 * ## 닫으면 다시 뜨지 않는다
 *
 * 행사 안내였을 때는 기간이 2주라 하루 단위로 다시 띄웠지만, 이 인사는 기약이 없다.
 * 매일 같은 팝업을 다시 던지면 사주를 보러 온 사람이 팝업을 닫으러 오게 된다.
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
 * 닫았다는 기억이 사는 곳. **고지 내용을 바꿀 때는 이 키도 바꾼다.**
 *
 * 이 자리를 쓴 팝업이 벌써 셋이다 — 행사 안내(`aiot:event-popup-dismissed`),
 * 테스트 결제 고지(`aiot:test-payment-notice-dismissed`), 그리고 지금의 이벤트
 * 인사. 앞의 키를 물려받으면 **그 팝업을 닫았던 사람은 새 팝업을 한 번도 못 본다** —
 * 닫은 것은 앞의 문구이지 이 문구가 아니다.
 *
 * 그래서 키에 고지의 이름을 박아 둔다. 다음 고지를 만드는 사람이 이 주석을 보고
 * 같이 바꾸게 하려는 것이고, 바꾸지 않으면 조용히 아무에게도 안 뜬다.
 */
const DISMISS_KEY = "aiot:notice-chuseok-open-dismissed";

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
   * 고지를 띄울 상황인가. 지금 넘어오는 값은 `true` 다 — 이벤트 인사는 키에도
   * 가격에도 묶여 있지 않다(모듈 주석).
   *
   * 조건이 없는데도 prop 을 남겨 두는 이유: 이 컴포넌트가 "무엇을 근거로 뜨는지" 를
   * 부르는 쪽이 정하게 하는 편이, 다음 고지가 생겼을 때 컴포넌트를 다시 열지 않아도
   * 되게 한다. 앞의 고지는 `IS_TEST_PAYMENT` 를 여기로 넘겼다.
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
        //
        // "통째로" 가 되기까지 시간이 걸렸다. 뒤집기는 두 팔레트가 **이름을 공유하는**
        // 값(`--surface`·`--ink`)만 덮고 사주 전용 `--saju-*` 는 `:root` 에 한 번만
        // 선언돼 있어서, 다크 화면에서 카드만 흰색이 되고 글자는 다크값으로 남았다 —
        // 이 팝업의 본문이 2.02:1, 금색 강조가 1.89:1 이었다. `globals.css` 의 두
        // 선언 블록이 지금은 같은 flip 조건을 함께 들고 있고, 그쪽 주석에 근거가 있다.
        data-palette="flip"
        // `text-ink` 는 장식이 아니라 **안전장치**다. 팔레트를 뒤집으면 배경은
        // 따라오지만 상속 글자색은 바깥(원래 테마) 값 그대로라, 토큰 클래스 없이
        // 글자를 하나 넣는 순간 어두운 바탕에 어두운 글자가 된다.
        className="pointer-events-auto w-full max-w-[26rem] overflow-hidden rounded-card border border-hairline bg-surface text-ink shadow-mockup"
      >
        {/* 좌우 여백이 좁은 화면에서 한 단계 줄어든다. 320px 기기에서 `px-5` 는
            본문 칸을 40px 먹는데, 아래 무당 컷과 합치면 글자가 들어갈 폭이
            140px 대로 내려간다. */}
        <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
          <p className="font-mono-kr text-[10px] tracking-[0.22em] text-gold-text">EVENT</p>
          <button
            type="button"
            onClick={close}
            aria-label="안내 닫기"
            className="-mr-2 -mt-2 flex min-h-[var(--tap)] min-w-[var(--tap)] items-center justify-center rounded-pill text-muted-2 transition-colors hover:bg-surface-warm hover:text-gold-text-strong"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex items-center gap-3 px-4 pb-1 pt-1 sm:gap-4 sm:px-5">
          {/* 무당이 인사하는 컷. 팝업은 첫 화면에 바로 뜨므로 `eager` 다.
              좁은 화면에서 폭을 줄인다 — 이 컷은 장식이고, 양보할 것이 생기면
              글자보다 이쪽이 먼저다. */}
          <Shaman
            expression="welcome"
            eager
            className="w-[72px] flex-none rounded-card-sm sm:w-[92px]"
          />

          <div className="min-w-0">
            {/* 제목도 한 단계 작게 시작한다. "추석 및 오픈기념" 은 여덟 글자라
                19px 에서 152px 를 먹어 좁은 화면의 글자 칸을 꽉 채운다. */}
            <h2
              id={titleId}
              className="font-display text-[17px] font-light leading-[1.35] text-ink sm:text-[19px]"
            >
              추석 및 오픈기념
              <span className="block text-gold-text">이벤트</span>
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted sm:text-[13.5px]">
              추석 연휴와 서비스 오픈을 기념해 찾아주신 분들께 인사드립니다.
            </p>
          </div>
        </div>

        {/* 혜택 대신 **사실**을 둔다 — 이벤트가 아니라 상시 동작이고, 지금 시작할
            이유로는 그것으로 충분하다(모듈 주석). */}
        <p className="px-4 pt-3 text-[12.5px] leading-relaxed text-muted-2 sm:px-5">
          사주팔자 여덟 글자는 회원가입 없이 보실 수 있습니다.
        </p>

        {/* 테스트 키로 도는 빌드에서만 — 그리고 **지금 운영이 그 빌드다.**
            문구는 `payment-mode` 한 곳에서 온다 — 결제 버튼 아래의 고지와 한 글자도
            달라지면 안 된다. */}
        {IS_TEST_PAYMENT && (
          <p className="px-4 pt-2 text-[12.5px] leading-relaxed text-gold-text-strong sm:px-5">
            {TEST_PAYMENT_NOTICE}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end border-t border-hairline px-4 py-3 sm:px-5">
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
