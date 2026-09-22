import Link from "next/link";
import { daysUntilExpiry } from "../model/share";
import type { SharedReading } from "../model/types";
import { WUXING_KEYS } from "../model/types";
import { WUXING_LABEL, ganWuxingOf, wuxingClass, zhiWuxingOf } from "../model/wuxing";

/**
 * 공유된 사주 — 링크를 받은 사람이 보는 화면.
 *
 * ## 티저를 재사용하지 않는다
 *
 * 생김새는 `TeaserView` 의 앞부분과 거의 같다. 그런데 그 컴포넌트는 `SajuReading`
 * 전체와 `BirthInput`·`PaymentConfig` 를 받고 결제 버튼까지 들고 있다 — 공유
 * 화면에 필요 없는 것이 전부이고, 억지로 나누면 두 화면의 요구가 한 파일에서
 * 싸운다. 격자 두 개를 복제하는 편이 싸다.
 *
 * ## 보낸 사람의 것이라고 말한다
 *
 * 이 화면에 온 사람은 대개 **제품을 처음 본다.** 여덟 글자만 덜렁 있으면 자기
 * 것으로 착각하고, 그 오해는 "내 사주 보기" 를 누를 이유를 없앤다.
 *
 * ## 만료를 미리 말한다
 *
 * 링크는 N일이면 죽는다. 죽은 뒤에 404 를 만난 사람은 이유를 알 방법이 없으므로,
 * **살아 있는 동안** 기한을 적어 둔다. 보낸 사람이 아니라 받는 사람에게 필요한
 * 정보다 — 다시 받아야 할지 판단하는 쪽이 이쪽이다.
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
          기기에서 카드를 뚫고 나가 가로 스크롤이 생긴다 — `TeaserView` 의 같은
          격자가 이미 겪은 것이다. */}
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
            <span className="w-12 font-mono-kr text-[11px] text-muted-2">{WUXING_LABEL[k]}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-pill bg-line-20">
              <div
                className={`h-full rounded-pill ${wuxingClass("bg", k)}`}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="w-4 text-right font-mono-kr text-[11px] text-muted-2">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

export function SharedReadingView({ reading }: { reading: SharedReading }) {
  // 계산은 `model/share.ts` 에 있다 — 리포트 공유 화면과 같은 날짜를 말해야 한다.
  const left = daysUntilExpiry(reading.createdAt, reading.retentionDays);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <p className="mb-1 font-mono-kr text-xs tracking-[0.2em] text-gold-text">SHARED READING</p>
        <h1 className="font-display text-2xl text-ink">친구가 보내 준 사주</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-2">
          이 여덟 글자는 링크를 보낸 분의 것입니다.
        </p>
      </div>

      <div className="rounded-card bg-surface p-5 shadow-card sm:p-8">
        {/* Tailwind 는 소스에서 **온전한** 클래스 문자열을 찾는다. 템플릿으로 만든
            `grid-cols-${n}` 은 생성되지 않으므로 두 경우를 다 적어 둔다
            (여섯 글자 사주는 3열, 여덟 글자는 4열). */}
        <div
          className={`grid gap-2 sm:gap-4 ${
            reading.pillarsHangul.length === 4 ? "grid-cols-4" : "grid-cols-3"
          }`}
        >
          {reading.pillarsHangul.map((hangul, i) => (
            <PillarColumn
              key={i}
              label={PILLAR_LABELS[i]}
              hangul={hangul}
              isDayPillar={i === DAY_PILLAR_INDEX}
            />
          ))}
        </div>
        <p className="mt-5 text-center text-[13px] text-muted-2">
          일간 <span className="text-gold-text-strong">{reading.dayMasterHangul}</span> · 힘은{" "}
          <span className="text-gold-text-strong">{reading.strengthVerdict}</span>
        </p>
      </div>

      <div className="rounded-card bg-surface p-5 shadow-card sm:p-8">
        <p className="text-[17px] leading-relaxed text-ink-body">{reading.summary}</p>
      </div>

      <div className="rounded-card bg-surface p-5 shadow-card sm:p-8">
        <h2 className="mb-4 font-display text-lg text-ink">오행 분포</h2>
        <WuxingBars visibleWuxing={reading.visibleWuxing} />
      </div>

      {/* 이 화면의 목적이다. 남의 사주를 구경하고 끝나면 아무 일도 일어나지 않는다. */}
      <div className="bg-surface-raise rounded-card p-6 text-center shadow-mockup sm:p-8">
        <h2 className="mb-3 font-display text-xl text-ink">내 사주도 볼까요?</h2>
        <p className="mb-6 text-[13.5px] leading-relaxed text-ink-body">
          태어난 시각을 진태양시로 바로잡아 계산합니다. 회원가입 없이 여덟 글자까지 무료입니다.
        </p>
        <Link
          href="/"
          className="inline-block rounded-pill bg-button-gradient px-8 py-3.5 text-[15px] font-bold text-on-primary shadow-cta"
        >
          내 사주 보기
        </Link>
      </div>

      <p className="text-center text-[11.5px] leading-relaxed text-muted-2">
        {left === null
          ? "이 링크는 일정 기간이 지나면 만료됩니다."
          : left === 0
            ? "이 링크는 오늘 만료됩니다."
            : `이 링크는 ${left}일 후 만료됩니다.`}
        <br />
        공유된 것은 여덟 글자와 요약뿐이며, 생년월일시는 저장되지 않습니다.
      </p>
    </div>
  );
}
