import type { PillarDetail, SajuChart } from "../model/types";
import { wuxingClass } from "../model/wuxing";
import { GAN_WUXING, ZHI_WUXING } from "../model/ganzhi";

/**
 * 사주 원국 4기둥(시각 미상이면 3기둥) 격자.
 *
 * 글자색은 그 글자의 오행 색이다. 한자를 크게, 한글 독음을 그 아래 작게 두는 것은
 * 두 가지를 동시에 만족시키기 위해서다 — 사주를 아는 사람은 한자를 먼저 보고,
 * 모르는 사람은 한자를 읽을 수 없다.
 */

const ORDER: ReadonlyArray<{ key: keyof SajuChart; label: string }> = [
  { key: "year", label: "년주" },
  { key: "month", label: "월주" },
  { key: "day", label: "일주" },
  { key: "hour", label: "시주" },
];

function Cell({ detail, label, isDayMaster }: {
  detail: PillarDetail;
  label: string;
  isDayMaster: boolean;
}) {
  const ganWuxing = GAN_WUXING[detail.pillar.gan] ?? "";
  const zhiWuxing = ZHI_WUXING[detail.pillar.zhi] ?? "";

  return (
    <div className="border border-line-18 bg-surface px-3 py-4 text-center">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-50">
        {label}
        {/* 일간이 풀이 전체의 기준이라는 것을 화면에서도 표시한다 — 십신·강약·대운이
            전부 여기서 파생된다. */}
        {isDayMaster && <span className="ml-1 text-accent">일간</span>}
      </div>

      <div className="mt-3 space-y-1">
        <div className={`text-2xl leading-none ${wuxingClass("text", ganWuxing)}`}>
          {detail.pillar.gan}
        </div>
        <div className={`text-2xl leading-none ${wuxingClass("text", zhiWuxing)}`}>
          {detail.pillar.zhi}
        </div>
      </div>

      <div className="mt-2 text-[13px] text-ink">{detail.hangul}</div>
      <div className="mt-2 space-y-0.5 text-[10px] leading-relaxed text-muted-55">
        <div>{detail.shiShenGan}</div>
        <div>{detail.diShi}</div>
      </div>
    </div>
  );
}

export function PillarGrid({ chart }: { chart: SajuChart }) {
  const cells = ORDER.map(({ key, label }) => ({
    label,
    detail: chart[key] as PillarDetail | null,
  })).filter((cell): cell is { label: string; detail: PillarDetail } => cell.detail !== null);

  return (
    <div>
      <div className={`grid gap-2 ${cells.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
        {cells.map((cell) => (
          <Cell
            key={cell.label}
            label={cell.label}
            detail={cell.detail}
            isDayMaster={cell.label === "일주"}
          />
        ))}
      </div>

      {chart.hour === null && (
        <p className="mt-2 text-[11px] text-muted-55">
          태어난 시각을 모르므로 시주를 제외한 여섯 글자입니다.
        </p>
      )}
    </div>
  );
}
