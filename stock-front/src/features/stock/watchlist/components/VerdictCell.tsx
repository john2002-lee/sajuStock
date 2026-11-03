import { deltaColorClass } from "@/lib/format";
import type { RowAiStatus, WatchItem } from "../model/types";

/**
 * AI 판단 칸.
 *
 * 색은 판단 용어가 아니라 그 행의 등락 색을 따른다 — 시안이 등락률 칸과 같은
 * 색 변수를 재사용한다 (Apple 은 -0.32% 라 '유지'가 파랑으로 나온다).
 * 그래서 changePercent 를 받아 deltaColorClass 에 위임한다.
 *
 * 일괄 분석이 도는 동안에는 그 종목의 진행 단계를 이 자리에 보여준다 —
 * 전체 진행률 하나로는 어느 종목이 끝났는지 알 수 없기 때문이다.
 */
export function VerdictCell({
  verdict,
  changePercent,
  status,
  align = "right",
}: {
  verdict?: WatchItem["verdict"];
  changePercent: number;
  status?: RowAiStatus;
  align?: "right" | "left";
}) {
  const alignment = align === "right" ? "text-right" : "text-left";

  if (status?.error) {
    return (
      <span
        className={`num ${alignment} text-muted-55 text-12`}
      >
        분석 실패
      </span>
    );
  }

  if (status?.running) {
    return (
      <span
        className={`num flex items-center gap-1.5 ${
          align === "right" ? "justify-end" : ""
        } text-muted-55 text-12`}
        aria-live="polite"
      >
        <span
          aria-hidden
          className="dot block h-[9px] w-[9px] flex-none animate-dot-spin border-[1.4px] border-line-25 border-t-up"
        />
        {status.stage}/4
      </span>
    );
  }

  const label = status?.verdict ?? verdict;
  // 아직 분석 전이면 자리표시('－')를 남기지 않는다 — 빈 칸이 더 정직하다.
  if (!label) return null;

  return (
    <span
      className={`num ${alignment} font-medium ${deltaColorClass(changePercent)} text-12`}
    >
      {label}
      {/* 드로어에는 '규칙 기반 판단' 배지가 있는데 이 표에는 아무 표식이 없었다.
          한 글자짜리 표식이라도 없으면 지표 판단이 AI 판단과 같은 무게로 읽힌다.
          `title` 로 뜻을 붙여 기호만 보고 추측하지 않게 한다. */}
      {status?.ruleBased ? (
        <span
          className="ml-1 font-mono text-muted-50 text-10"
          title="지표 규칙으로 내린 판단입니다. 이유는 AI 판단 패널에서 볼 수 있습니다"
        >
          규칙
        </span>
      ) : null}
    </span>
  );
}
