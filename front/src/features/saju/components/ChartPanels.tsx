import type { Luck, PillarDetail, SajuChart } from "../model/types";
import { WUXING_KEYS } from "../model/types";
import { WUXING_LABEL, ganWuxingOf, wuxingClass, zhiWuxingOf } from "../model/wuxing";
import { Panel, PanelLabel } from "./Panel";

/**
 * 데이터 패널 — 리포트에서 **계산된** 부분. 쓰인 것이 아니라.
 *
 * 사용자가 보는 것이 그 사람에 대한 산문만이 아니라 실제로 계산된 네 기둥·오행
 * 균형·대운이어야 한다. 여기 있는 모든 값은 서버가 내려준 것이고, 브라우저에서
 * 다시 유도하는 것은 없다.
 */

const PILLAR_ORDER: ReadonlyArray<{ key: "year" | "month" | "day" | "hour"; label: string }> = [
  { key: "year", label: "년주" },
  { key: "month", label: "월주" },
  { key: "day", label: "일주" },
  { key: "hour", label: "시주" },
];

export function PillarsPanel({ chart }: { chart: SajuChart }) {
  const pillars = PILLAR_ORDER.map(({ key, label }) => ({
    label,
    detail: chart[key] as PillarDetail | null,
  })).filter((p): p is { label: string; detail: PillarDetail } => p.detail !== null);

  return (
    <Panel>
      <PanelLabel>자네의 여덟 글자</PanelLabel>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${pillars.length}, minmax(0, 1fr))` }}
      >
        {pillars.map(({ label, detail }) => {
          const isDay = label === "일주";
          const ganWx = ganWuxingOf(detail.hangul.charAt(0));
          const zhiWx = zhiWuxingOf(detail.hangul.charAt(1));
          return (
            <div key={label} className="flex flex-col items-center gap-2">
              {/* 고정 높이: 일주 열만 배지를 더 달고 있어서, 이게 없으면 그 열의
                  카드가 나머지 셋보다 아래로 내려앉는다. */}
              <div className="flex h-5 items-center gap-1">
                <span className="font-mono-kr text-[10px] tracking-[0.12em] text-gold-text">
                  {label}
                </span>
                {isDay && (
                  <span className="rounded-pill bg-gold-gradient px-2 py-0.5 text-[10px] font-bold text-on-primary">
                    일간
                  </span>
                )}
              </div>
              <div
                className={`flex h-16 w-full max-w-14 items-center justify-center rounded-pillar shadow-card-sm ${
                  isDay ? "bg-gold-gradient shadow-daymaster" : "bg-surface-warm"
                }`}
              >
                <span className={`font-display text-2xl ${wuxingClass("text", ganWx ?? "")}`}>
                  {detail.pillar.gan}
                </span>
              </div>
              <div className="flex h-16 w-full max-w-14 items-center justify-center rounded-pillar bg-surface-warm shadow-card-sm">
                <span className={`font-display text-2xl ${wuxingClass("text", zhiWx ?? "")}`}>
                  {detail.pillar.zhi}
                </span>
              </div>
              <span className="font-mono-kr text-[10px] text-muted-2">{detail.hangul}</span>
              {/* 일주도 행을 비워 둔 채 자리를 지킨다(그 십신은 일간 자신이고 이미
                  배지로 나와 있다). 네 열이 같은 바닥선을 유지하기 위해서다. */}
              <span className="h-4 text-[11px] text-muted">{isDay ? "" : detail.shiShenGan}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function WuxingPanel({
  chart,
  strengthVerdict,
}: {
  chart: SajuChart;
  strengthVerdict: string;
}) {
  const counts = WUXING_KEYS.map((key) => ({
    key,
    label: WUXING_LABEL[key],
    count: chart.visibleWuxing[key] ?? 0,
  }));
  const max = Math.max(1, ...counts.map((w) => w.count));
  const missing = counts.filter((w) => w.count === 0);

  return (
    <Panel>
      <PanelLabel>오행의 균형</PanelLabel>
      <div className="flex flex-col gap-2">
        {counts.map((w) => (
          <div key={w.key} className="flex items-center gap-3">
            <span className="w-16 shrink-0 font-mono-kr text-[11px] tracking-[0.08em] text-muted">
              {w.label}
            </span>
            <div className="h-2 flex-1 rounded-pill bg-track">
              <div
                className={`h-2 rounded-pill ${wuxingClass("bg", w.key)}`}
                style={{ width: `${(w.count / max) * 100}%` }}
              />
            </div>
            <span className="w-4 shrink-0 text-right text-xs text-muted">{w.count}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[13px] text-muted-2">
        일간은 <span className="text-gold-text-strong">{chart.dayMasterHangul}</span>(
        {chart.dayMaster}), 힘은 <span className="text-gold-text-strong">{strengthVerdict}</span>
        으로 보네.
        {missing.length > 0 &&
          ` 원국에 드러난 글자로만 보면 ${missing.map((m) => m.label).join("·")}가 비어 있구먼.`}
      </p>
    </Panel>
  );
}

export function LuckPanel({ luck }: { luck: Luck }) {
  if (luck.daYun.length === 0) return null;
  return (
    <Panel>
      <PanelLabel>대운 — 십 년마다 바뀌는 흐름</PanelLabel>
      <p className="mb-4 text-[13px] text-muted-2">
        {luck.forward ? "순행" : "역행"}이고, {luck.startAge}세부터 첫 대운이 드네.
      </p>
      {/* 가로 스크롤을 이 띠 안에 가둔다 — 열 개 남짓한 십 년 구간이 휴대폰 폭에
          들어갈 수 없고, 페이지 자체가 옆으로 밀리면 안 된다. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <ol className="flex gap-2">
          {luck.daYun.map((d) => {
            const isCurrent = luck.currentDaYun?.startYear === d.startYear;
            return (
              <li
                key={d.startYear}
                className={`flex w-20 shrink-0 flex-col items-center gap-1 rounded-card-sm border px-2 py-3 ${
                  isCurrent
                    ? "border-gold-text bg-surface-warm shadow-daymaster"
                    : "border-hairline bg-surface"
                }`}
              >
                <span className="font-mono-kr text-[10px] text-muted-2">{d.startAge}세</span>
                <span className="font-display text-base text-ink">{d.hangul}</span>
                <span className="text-[11px] text-muted">{d.shiShen}</span>
                {isCurrent && (
                  <span className="font-mono-kr text-[9px] tracking-[0.1em] text-gold-text-strong">
                    지금
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      {/* 나이는 세는나이다 — 백엔드가 라이브러리 값을 그대로 물려받고 있고,
          만 나이로 "고치면" 모든 대운 경계가 1~2년 밀린다. */}
      <p className="mt-3 text-[11px] text-muted-3">나이는 세는나이일세({luck.nowYear}년 기준).</p>
    </Panel>
  );
}
