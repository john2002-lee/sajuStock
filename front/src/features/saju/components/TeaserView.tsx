"use client";

import Link from "next/link";
import type { BirthInput, SajuReading } from "../model/types";
import { WUXING_KEYS } from "../model/types";
import { WUXING_LABEL, ganWuxingOf, wuxingClass, zhiWuxingOf } from "../model/wuxing";
import { ConventionNotice } from "./ConventionNotice";
import { PayButton } from "./PayButton";
import type { PaymentConfig } from "../model/types";

/**
 * 티저 화면 본문: 4기둥 그리드(일주 열만 "일간" 배지 + 금빛 강조), 무료 요약,
 * 오행 분포 막대, 인용문, 전체 리포트 카드.
 *
 * ## 원본과 다른 한 가지
 *
 * 원본 SajuService 는 이 자리에 **결제 카드**(9,900원 + 토스 결제 버튼)를 두었다.
 * 이 저장소의 백엔드에는 결제·주문·작업큐가 없으므로 그 단계가 성립하지 않는다.
 * 카드의 **자리와 무게는 그대로 두고** 버튼만 리포트로 잇는다 — 흐름에서 이 지점이
 * "여기서 한 번 더 눌러야 전체를 본다" 라는 것은 결제 유무와 무관하게 같다.
 */

const PILLAR_LABELS = ["년주", "월주", "일주", "시주"] as const;
const DAY_PILLAR_INDEX = 2;

function PillarColumn({
  label,
  hangul,
  isDayPillar,
}: {
  label: string;
  hangul: string;
  isDayPillar: boolean;
}) {
  const gan = hangul[0] ?? "";
  const zhi = hangul[1] ?? "";
  const ganWx = ganWuxingOf(gan);
  const zhiWx = zhiWuxingOf(zhi);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-1">
        <span className="font-mono-kr text-[10px] tracking-[0.12em] text-gold-text">{label}</span>
        {isDayPillar && (
          <span className="rounded-pill bg-gold-gradient px-2 py-0.5 text-[10px] font-bold text-on-primary">
            일간
          </span>
        )}
      </div>
      {/* 폭을 고정하지 않는다(`w-full max-w-14`). `w-14` 로 못박으면 4열이 320px
          기기에서 카드를 뚫고 나가 가로 스크롤이 생긴다 — 56×4 + 간격 3칸이 카드
          안쪽 폭보다 넓다. `ChartPanels` 의 같은 격자가 이미 이 방식이다. */}
      <div
        className={
          "flex h-14 w-full max-w-14 items-center justify-center rounded-pillar shadow-card-sm sm:h-16 " +
          (isDayPillar ? "bg-gold-gradient shadow-daymaster" : "bg-surface")
        }
      >
        <span className={`font-display text-[22px] sm:text-2xl ${wuxingClass("text", ganWx ?? "")}`}>
          {gan}
        </span>
      </div>
      <div className="flex h-14 w-full max-w-14 items-center justify-center rounded-pillar bg-surface shadow-card-sm sm:h-16">
        <span className={`font-display text-[22px] sm:text-2xl ${wuxingClass("text", zhiWx ?? "")}`}>
          {zhi}
        </span>
      </div>
    </div>
  );
}

function WuxingBars({ visibleWuxing }: { visibleWuxing: Record<string, number> }) {
  const max = Math.max(1, ...WUXING_KEYS.map((k) => visibleWuxing[k] ?? 0));
  return (
    <div className="flex flex-col gap-2">
      {WUXING_KEYS.map((k) => {
        const count = visibleWuxing[k] ?? 0;
        return (
          <div key={k} className="flex items-center gap-3">
            <span className="w-16 shrink-0 font-mono-kr text-[11px] tracking-[0.08em] text-muted">
              {WUXING_LABEL[k]}
            </span>
            <div className="h-2 flex-1 rounded-pill bg-track">
              <div
                className={`h-2 rounded-pill ${wuxingClass("bg", k)}`}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="w-4 shrink-0 text-right text-xs text-muted">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

export function StartOverPrompt() {
  return (
    <div className="mx-auto max-w-md rounded-card bg-surface p-6 text-center shadow-card sm:p-8">
      <p className="text-sm text-ink-body">
        저장된 결과를 찾을 수 없어요. 처음부터 다시 입력해 주세요.
      </p>
      <Link
        href="/saju"
        className="mt-4 inline-block rounded-pill bg-button-gradient px-6 py-2 text-sm font-bold text-on-primary shadow-cta"
      >
        다시 입력하기
      </Link>
    </div>
  );
}

export interface TeaserViewProps {
  reading: SajuReading;
  /** 결제 요청에 다시 실어야 하는 원본 입력. */
  birth: BirthInput;
  /** 서버가 준 결제 설정. `null` 이면 아직 못 받았다 — 그때는 무료 버튼을 그린다. */
  payment: PaymentConfig | null;
  /** 결제가 꺼져 있을 때의 무료 경로. */
  onOpenReport: () => void;
}

export function TeaserView({ reading, birth, payment, onOpenReport }: TeaserViewProps) {
  const { teaser } = reading;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <p className="mb-1 font-mono-kr text-xs tracking-[0.2em] text-gold-text">COSMIC ALIGNMENT</p>
        <h1 className="font-display text-2xl text-ink">귀하의 명반</h1>
      </div>

      <div className="rounded-card bg-surface p-5 shadow-card sm:p-8">
        {/* Tailwind 는 소스에서 **온전한** 클래스 문자열을 찾는다. 템플릿으로 만든
            `grid-cols-${n}` 은 생성되지 않으므로 두 경우를 다 적어 둔다
            (여섯 글자 사주는 3열, 여덟 글자는 4열). */}
        <div
          className={`grid gap-2 sm:gap-4 ${
            teaser.pillarsHangul.length === 4 ? "grid-cols-4" : "grid-cols-3"
          }`}
        >
          {teaser.pillarsHangul.map((hangul, i) => (
            <PillarColumn
              key={i}
              label={PILLAR_LABELS[i]}
              hangul={hangul}
              isDayPillar={i === DAY_PILLAR_INDEX}
            />
          ))}
        </div>
      </div>

      <div className="rounded-card bg-surface p-5 shadow-card sm:p-8">
        <span className="mb-3 inline-block rounded-pill bg-gold-gradient px-3 py-1 text-xs font-bold text-on-primary">
          무료 요약
        </span>
        <p className="text-[17px] leading-relaxed text-ink-body">{teaser.summary}</p>
      </div>

      <div className="rounded-card bg-surface p-5 shadow-card sm:p-8">
        <h2 className="mb-4 font-display text-lg text-ink">오행 분포</h2>
        <WuxingBars visibleWuxing={teaser.visibleWuxing} />
      </div>

      {/* 인용문. 외부에서 가져온 문장이 아니라 직접 쓴 것이며(저작권 있는 텍스트를
          옮기지 않는다), 사주가 무엇인지에 대해 정직한 쪽을 골랐다 — 예측 정확도의
          주장이 아니라 자기를 이해하는 방법이라는 것. */}
      <p className="text-center font-display text-base italic text-muted">
        “명리는 정답을 정해주지 않습니다. 다만, 나를 이해하는 하나의 언어일 뿐입니다.”
      </p>

      <div className="bg-surface-raise rounded-card p-6 text-center shadow-mockup sm:p-8">
        <p className="mb-2 font-mono-kr text-[11px] tracking-[0.2em] text-gold-text-strong">
          {payment?.enabled ? "PREMIUM ANALYSIS" : "FULL READING"}
        </p>
        <h2 className="mb-3 font-display text-xl text-ink">전체 리포트 보기</h2>
        <p className="mb-6 text-[13.5px] leading-relaxed text-ink-body">
          여덟 글자가 왜 그렇게 읽히는지, 십신과 대운의 흐름까지 무당이 직접 풀어 줍니다.
        </p>

        {/* 결제 설정이 없으면(키 미설정) **결제 UI 를 그리지 않는다.** 팔 수 없는
            상태에서 버튼을 보여 주면 눌러 본 사람이 결제창에서 실패한다.
            서버가 `enabled: false` 로 답하는 그 경우, 리포트는 무료로 바로 연다. */}
        {payment?.enabled ? (
          <>
            <p className="mb-5 font-mono-kr text-2xl font-semibold text-gold-text-strong">
              {payment.price.toLocaleString("ko-KR")}원
            </p>
            <PayButton birth={birth} amount={payment.price} />
            <p className="mt-4 text-[12px] leading-relaxed text-muted-2">
              결제하시면 생년월일시와 리포트를 {payment.retention_days}일간 보관합니다 —
              그 동안 링크로 다시 보실 수 있습니다.
            </p>
          </>
        ) : (
          <button
            type="button"
            onClick={onOpenReport}
            className="rounded-pill bg-button-gradient px-8 py-3.5 text-[15px] font-bold text-on-primary shadow-cta"
          >
            리포트 받아보기
          </button>
        )}
      </div>

      <ConventionNotice />
    </div>
  );
}
