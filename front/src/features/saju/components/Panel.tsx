import type { ReactNode } from "react";
import { Shaman, type ShamanExpression } from "./Shaman";

/**
 * 웹툰 패널 기본 요소.
 *
 * 읽기 모형은 한국식 세로 스크롤 웹툰이다: 한 비트에 전폭 패널 하나, 위에서
 * 아래로. 나란히 놓지 않는다. 그래서 여기에 그리드도, 가로 스크롤도 없고 스택뿐이다.
 *
 * 말풍선은 사이트 팔레트가 아니라 **만화 관례**를 따른다: 흰 바탕, 거의 검은 글자,
 * 그려진 외곽선, 화자를 향한 꼬리. 일부러 `bg-surface`/`text-ink` 를 쓰지 않는다 —
 * 테마에 따라 물드는 말풍선은 말풍선이 아니라 카드로 읽히기 시작한다.
 */

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`relative overflow-hidden rounded-card bg-surface p-5 shadow-card sm:p-7 ${className}`}
    >
      {children}
    </section>
  );
}

/** 패널 위의 작은 모노 캡션. 예: "총평". */
export function PanelLabel({ children }: { children: ReactNode }) {
  return <p className="mb-3 font-mono-kr text-[10px] tracking-[0.2em] text-gold-text">{children}</p>;
}

const BUBBLE_WHITE = "#FBFAF7";
const BUBBLE_LINE = "#2A2A30";

/**
 * 화자를 가리키는 꼬리가 달린 만화 말풍선.
 *
 * 꼬리를 두 개 그려 두고 브레이크포인트마다 하나만 보인다: 레이아웃이 휴대폰에서는
 * 그녀를 말풍선 **위**에 두고(세로 스택) `sm` 이상에서는 **옆**에 두므로, 꼬리가
 * 하나면 둘 중 한쪽에서 아무것도 가리키지 않는다.
 */
export function SpeechBubble({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      {/* 꼬리 — 모바일에서 위쪽의 그녀를 가리킨다 */}
      <svg
        aria-hidden
        viewBox="0 0 40 22"
        className="absolute -top-[19px] left-8 h-[20px] w-[38px] sm:hidden"
      >
        <path
          d="M6 22 C10 10 18 3 30 0 C22 8 18 14 17 22 Z"
          fill={BUBBLE_WHITE}
          stroke={BUBBLE_LINE}
          strokeWidth="1.6"
        />
        <rect x="4" y="19" width="18" height="6" fill={BUBBLE_WHITE} />
      </svg>

      {/* 꼬리 — `sm` 이상에서 왼쪽의 그녀를 가리킨다 */}
      <svg
        aria-hidden
        viewBox="0 0 24 40"
        className="absolute -left-[21px] top-9 hidden h-[38px] w-[22px] sm:block"
      >
        <path
          d="M24 8 C12 12 5 18 0 30 C9 24 16 22 24 22 Z"
          fill={BUBBLE_WHITE}
          stroke={BUBBLE_LINE}
          strokeWidth="1.6"
        />
        <rect x="19" y="6" width="6" height="18" fill={BUBBLE_WHITE} />
      </svg>

      <div
        className="rounded-[26px] px-6 py-5"
        style={{ background: BUBBLE_WHITE, border: `1.6px solid ${BUBBLE_LINE}` }}
      >
        <div className="space-y-3 text-[16.5px] leading-[1.75] text-[#1C1C21]">{children}</div>
      </div>
    </div>
  );
}

/**
 * 비트 하나: 화자의 그림과 그녀의 말. 모바일에서는 세로로 쌓아 말풍선이 360px
 * 아래로 눌리지 않게 하고, 꼬리도 함께 뒤집힌다.
 */
export function ShamanBeat({
  expression = "speak",
  label,
  decorative = false,
  children,
}: {
  expression?: ShamanExpression;
  label?: ReactNode;
  /** 한 섹션 안에서 이어지는 비트에 설정한다. 그녀를 섹션당 한 번만 알리도록. */
  decorative?: boolean;
  children: ReactNode;
}) {
  return (
    <Panel>
      {label && <PanelLabel>{label}</PanelLabel>}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-7">
        <Shaman
          expression={expression}
          decorative={decorative}
          className="mx-auto w-[150px] shrink-0 rounded-[16px] shadow-card-sm sm:mx-0 sm:w-[168px]"
        />
        <div className="min-w-0 flex-1 sm:pt-6">
          <SpeechBubble>{children}</SpeechBubble>
        </div>
      </div>
    </Panel>
  );
}
