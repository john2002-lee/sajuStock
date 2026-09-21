"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Icon } from "@/shared/ui";
import { FREE_EVENT_PERIOD } from "../model/event";
import { Shaman } from "./Shaman";

/**
 * 추석 · 오픈 기념 이벤트 안내 팝업.
 *
 * ## 기간 판정은 서버가, 닫았는지는 브라우저가
 *
 * `active` 는 **서버 컴포넌트가 서버 시각으로 판정한 값** 이다. 여기서
 * `isFreeEvent(new Date())` 를 부르지 않는 이유는, 그러면 기기 시계를 옮기는 것만으로
 * 기간 밖에서도 무료 안내가 뜨기 때문이다 — 결제 버튼과 같은 근거를 써야 화면이
 * 서로 다른 말을 하지 않는다.
 *
 * 오늘 이미 닫았는지는 `localStorage` 에 있어 서버가 알 수 없다. 그 한 조각만
 * `useSyncExternalStore` 로 읽는다 — **서버 스냅샷은 언제나 `false`**(= 닫은 적 없음이
 * 아니라 "아직 모른다")이고 브라우저에서만 참이 된다. `useEffect` 에서 `setState` 로
 * 켜는 방법도 있지만 렌더를 한 번 더 돌리는 일이라 이 저장소의 lint 가 막는다
 * (`react-hooks/set-state-in-effect`).
 *
 * ## 닫으면 그날은 다시 뜨지 않는다
 *
 * 이벤트 기간이 2주 남짓인데 방문할 때마다 같은 팝업을 다시 던지면, 그 사람이
 * 사주를 보러 온 것인지 팝업을 닫으러 온 것인지 모르게 된다. 날짜 한 줄만
 * 저장한다 — 사주 입력값은 여전히 아무 데도 저장하지 않는다.
 *
 * 저장소는 실패할 수 있다(사파리 프라이빗, 차단된 사이트 데이터). 읽기·쓰기를
 * 각각 감싸고, 실패하면 "오늘 닫은 적 없음" 으로 떨어진다 — 팝업이 한 번 더 뜨는
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

const DISMISS_KEY = "aiot:event-popup-dismissed";

/** `YYYY-MM-DD` (KST). 날짜만 비교하므로 시간대는 한 번만 맞추면 된다. */
function kstToday(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function dismissedToday(today: string): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === today;
  } catch {
    return false;
  }
}

function rememberDismissal(today: string): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, today);
  } catch {
    // 저장하지 못하면 다음 방문에 한 번 더 뜬다. 그뿐이다.
  }
}

/** 구독할 바깥 변화가 없다 — 한 번 정해지면 사용자가 닫기 전까지 그대로다. */
const NO_SUBSCRIBE = () => () => {};

/** 오늘 닫은 적이 없는가. 브라우저에서만 참이 될 수 있다(서버는 저장소를 못 읽는다). */
function notDismissedYet(): boolean {
  return !dismissedToday(kstToday(new Date()));
}

export interface EventPopupProps {
  /** 서버 시각으로 판정한 이벤트 활성 여부. 브라우저 시계를 믿지 않는다. */
  readonly active: boolean;
}

export function EventPopup({ active }: EventPopupProps) {
  const fresh = useSyncExternalStore(NO_SUBSCRIBE, notDismissedYet, () => false);
  const [closed, setClosed] = useState(false);
  const open = active && fresh && !closed;

  const titleId = useId();

  /**
   * **닫으면 그날은 다시 뜨지 않는다.**
   *
   * 예전에는 이 함수가 `remember = false` 로 시작했다. 그래서 X · Escape ·
   * 바깥클릭 · "사주 보러 가기" 넷이 아무것도 저장하지 않았고, 저장하는 길은
   * "오늘 하루 보지 않기" 버튼 하나뿐이었다 — 사주를 한 번 보고 돌아올 때마다
   * 같은 팝업이 다시 떴다(실측: 저장값 `null`, 매 방문 재등장).
   *
   * 닫는 방법마다 뜻이 다를 이유가 없다. 넷 다 "봤고 지금은 됐다" 이다.
   */
  function close() {
    rememberDismissal(kstToday(new Date()));
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
          <p className="font-mono-kr text-[10px] tracking-[0.22em] text-gold-text">EVENT</p>
          <button
            type="button"
            onClick={close}
            aria-label="이벤트 안내 닫기"
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
              추석 및 오픈 기념
              <span className="block text-gold-text">이벤트</span>
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              사주풀이와 행운의 번호를
              <span className="font-bold text-gold-text-strong"> 무료</span>로 이용하실 수
              있습니다.
            </p>
          </div>
        </div>

        {/* 한글에 등폭 글꼴 + 자간을 주면 "행사기간" 이 "행 사기간" 으로 갈라져
            읽힌다. 날짜만 등폭으로 두고 라벨은 본문 글꼴 그대로 간다. */}
        <p className="px-5 pt-3 text-[12.5px] leading-relaxed text-muted-2">
          행사기간 <span className="font-mono-kr">{FREE_EVENT_PERIOD}</span>
        </p>

        {/* "오늘 하루 보지 않기" 버튼은 걷어냈다. 이제 **어떤 방법으로 닫아도**
            그날은 다시 뜨지 않으므로, 같은 일을 하는 버튼이 둘이 된다. 하나가
            특별한 약속을 하는 것처럼 보이는 편이 오히려 거짓말이다. */}
        <div className="mt-4 flex items-center justify-end border-t border-hairline px-5 py-3">
          <button
            type="button"
            onClick={close}
            className="min-h-[var(--tap)] rounded-pill bg-button-gradient px-5 text-[13.5px] font-bold text-on-primary shadow-cta"
          >
            사주 보러 가기
          </button>
        </div>
      </div>
    </div>
  );
}
