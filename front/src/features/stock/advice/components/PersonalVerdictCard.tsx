import { Icon, SectionLabel } from "@/shared/ui";
import type { PersonalVerdict } from "../model/types";

/**
 * 2축 판단 — "시장은 이렇게 말하지만 당신에게는" (사주 통합 계획 5.6).
 *
 * 이 화면의 핵심은 **불일치를 숨기지 않는 것**이다. 시장 판단과 개인 판단이 갈렸을
 * 때 결과만 보여 주면 사용자는 왜 그런지 알 수 없고, 그 순간 제품은 근거 없는
 * 추천기가 된다. 그래서 세 블록을 함께 그린다: 두 축의 값, 왜 갈렸는지, 그리고
 * **그래도 하겠다면 어떻게 하면 되는지.**
 *
 * 마지막 블록이 특히 중요하다. 막지 않고 방법을 준다 — "AI 가 종목을 추천"과
 * 결정적으로 다른 지점이다.
 *
 * ## 심각도에 색을 쓰지 않는다
 *
 * 이 앱에서 빨강은 **상승**이다(국내 등락 관례 · `--up`). 심각도가 높다고 빨강을
 * 칠하면 "위험" 이 아니라 "오른다" 로 읽힌다. 파랑도 마찬가지로 하락이라 못 쓴다.
 * 그래서 심각도는 색이 아니라 라벨과 **순서**로 나타낸다 — 백엔드가 이미 심각한
 * 축부터 정렬해 보낸다.
 */

const CELLS = 5;

const SEVERITY_LABEL: Record<PersonalVerdict["concerns"][number]["severity"], string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

const FIT_LABEL: Record<PersonalVerdict["fitLevel"], string> = {
  high: "잘 맞음",
  medium: "보통",
  low: "안 맞음",
};

/** 적합도 38 → 5칸 중 1칸. 신뢰도 미터와 같은 규칙이다. */
function filledCells(score: number): number {
  return Math.min(CELLS, Math.max(0, Math.floor(score / 20)));
}

export function PersonalVerdictCard({ personal }: { personal: PersonalVerdict }) {
  const filled = filledCells(personal.fitScore);

  return (
    <section
      // 판단이 실제로 움직였을 때만 테두리를 굵게 한다 — 화면에서 가장 먼저
      // 읽혀야 하는 경우가 그때다. 안 움직였으면 조용한 확인 카드로 남는다.
      className={`flex animate-fade-up-slow flex-col gap-3 bg-surface p-[18px] ${
        personal.adjusted ? "border-2 border-ink" : "border border-line-20"
      }`}
    >
      <SectionLabel
        variant="bare"
        size={11}
        right={personal.adjusted ? "성향 보정됨" : "성향 일치"}
      >
        your fit
      </SectionLabel>

      {/* 두 축을 나란히 — 불일치 자체가 이 카드의 메시지다 */}
      <div className="flex flex-col gap-2 border-b border-line-20 pb-3">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-muted-60 text-13">
            시장 판단
          </span>
          <span className="num font-medium text-ink text-13">
            {personal.marketVerdict}
            <span className="text-muted-45"> · 신뢰도 {personal.marketConfidence}%</span>
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-4">
          <span className="text-muted-60 text-13">
            당신 적합도
          </span>
          <span className="num font-medium text-ink text-13">
            {personal.fitScore} / 100
            <span className="text-muted-45"> · {FIT_LABEL[personal.fitLevel]}</span>
          </span>
        </div>

        <div
          className="flex gap-[3px]"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={personal.fitScore}
          aria-label="투자 성향 적합도"
        >
          {Array.from({ length: CELLS }, (_, i) => (
            <span
              key={i}
              className={`block h-1 flex-1 ${i < filled ? "bg-ink" : "bg-line-20"}`}
            />
          ))}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-4">
        <span
          className="font-mono uppercase tracking-label text-muted-50 text-11"
        >
          최종
        </span>
        <span
          className="font-display font-bold leading-none text-26"
        >
          {personal.label}
        </span>
      </div>

      {personal.concerns.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-line-20 pt-[11px]">
          <span
            className="font-mono uppercase tracking-label text-muted-50 text-10"
          >
            {personal.adjusted ? "왜 갈렸나" : "확인할 점"}
          </span>
          {personal.concerns.map((concern) => (
            <span
              key={concern.axis}
              className="flex items-start gap-1.5 text-ink text-12 leading-[1.65]"
            >
              <Icon name="minus" size={13} className="mt-[3px] flex-none text-muted-50" />
              <span>
                {concern.message}
                <span className="font-mono text-muted-45"> ({SEVERITY_LABEL[concern.severity]})</span>
              </span>
            </span>
          ))}
        </div>
      ) : null}

      {personal.guardrails.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-line-20 pt-[11px]">
          <span
            className="font-mono uppercase tracking-label text-muted-50 text-10"
          >
            그래도 사겠다면
          </span>
          {personal.guardrails.map((line) => (
            <span
              key={line}
              className="flex items-start gap-1.5 text-ink text-12 leading-[1.65]"
            >
              <Icon name="check" size={13} className="mt-[3px] flex-none text-muted-50" />
              {line}
            </span>
          ))}
        </div>
      ) : null}

      <p
        className="border-t border-line-14 pt-[9px] font-mono text-muted-45 text-10 leading-[1.6]"
      >
        저장된 투자 성향으로 조정한 결과입니다. 성향은 판단을 보수적인 쪽으로만
        움직이며, 매수를 만들어내지 않습니다.
      </p>
    </section>
  );
}
