import { AGENT_META } from "../model/types";

const LINES = [
  { width: "70%", tone: "bg-skeleton-1", delay: "0ms" },
  { width: "92%", tone: "bg-skeleton-2", delay: "200ms" },
  { width: "54%", tone: "bg-skeleton-3", delay: "400ms" },
];

/**
 * 아직 도착하지 않은 에이전트 자리.
 *
 * **익명이 아니다.** 예전에는 남은 자리 전체를 대신하는 회색 상자 한 장이었는데,
 * 그러면 기다리는 동안 몇 명이 무슨 관점으로 보고 있는지 알 수 없다. 이제 각
 * 슬롯이 자기 이름과 무엇을 읽는지를 들고 서 있고, 본문 자리만 3줄로 깜빡인다.
 *
 * `pending` 이 거짓이면 — 사용자가 멈췄거나 분석이 끝났는데 이 자리가 비었을 때 —
 * **깜빡임을 멈춘다.** 아무것도 오지 않을 자리가 계속 뛰고 있으면 화면이 아직
 * 일하는 중이라고 거짓말을 한다.
 */
export function AgentSkeleton({
  name,
  lens,
  index,
  pending = true,
}: {
  name?: string;
  lens?: string;
  index?: number;
  pending?: boolean;
}) {
  const meta = name ? AGENT_META[name] : undefined;

  return (
    <div className="flex flex-col gap-2 rounded-14 border border-dashed border-line-30 bg-paper/60 p-3.5">
      {name ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex min-w-0 items-baseline gap-2">
            {index === undefined ? null : (
              <span className="num font-medium text-muted-30 text-11">
                {String(index + 1).padStart(2, "0")}
              </span>
            )}
            <span className="truncate font-display font-bold text-muted-45 text-16">
              {name}
            </span>
            {meta ? (
              <span className="font-mono text-muted-30 text-11">{meta.nameEn}</span>
            ) : null}
          </span>
          {lens ? (
            <span className="flex-none font-mono text-muted-35 text-10">{lens}</span>
          ) : null}
        </div>
      ) : null}

      <div aria-hidden className="flex flex-col gap-2">
        {LINES.map((line) => (
          <span
            key={line.width}
            className={`block h-[9px] ${line.tone} ${pending ? "animate-pulse-wf" : ""}`}
            style={{ width: line.width, animationDelay: line.delay }}
          />
        ))}
      </div>
    </div>
  );
}
