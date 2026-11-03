import { relative, stamp } from "@/lib/format";
import { CountUp, Icon, Meter } from "@/shared/ui";
import type { Decision, DecisionSource } from "../model/types";

/**
 * 규칙 기반으로 내린 판단의 **왜**. `null` 이면 AI 판단이다.
 *
 * 불리언(`source === "fallback"`)이 아니라 조회 테이블인 이유가 있다. 리터럴
 * 비교는 유니온에 값이 하나 늘어도 **tsc 가 아무 말 없이 false 로 만든다** —
 * 그러면 신뢰도 41%짜리 지표 판단이 아무 표식 없이 AI 판단 자리에 앉는다.
 * `Record<DecisionSource, …>` 는 네 번째 값이 생기는 순간 컴파일 에러가 난다.
 *
 * 배지 문구(`규칙 기반 판단`)는 **두 경우 모두 같다.** 배지는 "무엇으로
 * 판단했는가" 에 답하고 그 답은 둘이 같다. 다른 것은 "왜 그랬는가" 뿐이다.
 */
const RULE_BASED: Record<DecisionSource, string | null> = {
  llm: null,
  fallback: "AI 의견을 받지 못해 지표 규칙으로 판단했습니다.",
  // "AI 가 실패했다" 가 아니다 — 시간 안에 다 모으지 못했을 뿐이고, 그때까지
  // 받은 에이전트 의견은 위 카드에 그대로 남아 있다. 그래서 "다시 시도" 도
  // 같은 버튼이면 된다(전체 분석을 처음부터 다시 돈다).
  timeout: "정해 둔 분석 시간을 넘겨, 그때까지 모은 지표로 판단했습니다.",
};

export function FinalDecision({
  decision,
  onRetry,
}: {
  decision: Decision;
  onRetry: () => void;
}) {
  const ruleBased = RULE_BASED[decision.source];
  // 이 카드는 스트림이 끝난 뒤에만 그려지므로 서버 렌더를 타지 않는다 —
  // 렌더 시각을 여기서 읽어도 하이드레이션이 어긋날 자리가 없다.
  const now = new Date().toISOString();

  return (
    <section
      className={`flex animate-fade-up-slow flex-col gap-3 bg-ink p-[18px] text-on-ink ${
        ruleBased ? "border border-dashed border-on-ink-45" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className="font-mono uppercase tracking-label text-on-ink-55 text-11"
        >
          final decision
        </span>
        {ruleBased ? (
          <span
            className="border border-on-ink-45 px-1.5 py-0.5 font-mono uppercase tracking-label-tight text-on-ink-75 text-10"
          >
            규칙 기반 판단
          </span>
        ) : null}
      </div>

      {/* **이 화면에서 가장 큰 글자.** 34 → 48 로 올렸다. 이 제품의 유일한
          차별점이 그만큼의 자리를 가져야 한다.

          48 은 타입 스케일의 최상단이고 종목 상세의 헤드라인(`StockHeadline`)이
          넓은 폭에서 쓰는 것과 같은 단이다 — 각 화면의 '가장 큰 것' 이 같은
          크기라야 화면을 옮겨도 위계가 흔들리지 않는다. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display font-bold leading-none text-48">
          {decision.decisionLabel}
        </span>
        {/* 신뢰도는 스트림이 **끝나는 순간** 나타난다. 세어 올라가는 동안 시선이
            여기 머문다 — 판정과 함께 이 화면의 두 값 중 하나다. */}
        <span className="num text-up-on-ink text-13">
          신뢰도 <CountUp value={decision.confidence} suffix="%" />
        </span>
      </div>

      <Meter value={decision.confidence} inverted label="판단 신뢰도" />

      <p
        className="font-display text-pretty text-on-ink-90 text-14 leading-[1.75]"
      >
        {decision.answer}
      </p>

      <div className="flex flex-col gap-1.5 border-t border-on-ink-20 pt-[11px]">
        {/* ＋/－ 는 근거의 방향(매수 조건 / 리스크)을 나타내는 기호다.
            README "근거 3줄(＋/－ 기호, －는 파랑)" — 색은 토큰이 맡는다. */}
        {decision.buyConditions.map((line) => (
          <span
            key={line}
            className="flex items-start gap-1.5 font-mono text-on-ink-75 text-12"
          >
            <Icon name="plus" size={13} className="mt-px flex-none" />
            {line}
          </span>
        ))}
        {decision.riskNotes.map((line) => (
          <span
            key={line}
            className="flex items-start gap-1.5 font-mono text-down-on-ink text-12"
          >
            <Icon name="minus" size={13} className="mt-px flex-none" />
            {line}
          </span>
        ))}
      </div>

      {ruleBased ? (
        <>
          <p className="text-on-ink-78 text-13">
            {ruleBased}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex flex-none items-center justify-center rounded-10 border border-on-ink-45 px-4 py-2 font-medium text-on-ink transition-colors duration-150 hover:bg-on-ink hover:text-ink text-13"
          >
            AI 분석 다시 시도
          </button>
          <p
            className="font-mono text-on-ink-45 text-10"
          >
            decision_source={decision.source}
          </p>
        </>
      ) : null}

      {/*
        **"예시 데이터." 를 지웠다.** 이 줄은 조건 분기 밖이라 실제 LLM 판단에도 항상
        붙었다 — 진짜 결과를 사용자에게 예시라고 알려 주는 셈이었고, 홈의 목 블록이
        `SampleFrame` 으로 정직하게 밝히는 것과 정반대 방향의 거짓이다.

        여기에 다시 붙이지 말 것: 이 컴포넌트는 데이터가 목인지 알 수 없다(받는 것은
        `Decision` 하나다). 예시임을 밝히는 일은 목을 **넘기는 쪽**이 `SampleFrame`
        으로 한다. 규칙 기반 폴백은 이미 위쪽 배지가 말한다.
      */}
      {/**
       * **이 판단이 언제 것인지 밝힌다.**
       *
       * 결과는 캐시된다(`model/cache.ts` 의 2층 구조). 그래서 드로어를 다시 열면
       * 진행 바 없이 즉시 완성된 판단이 뜨는데, 그 화면만 봐서는 **방금 만든 것과
       * 두 시간 전 것이 완전히 같아 보인다.** 금융에서 판단의 나이는 판단만큼
       * 중요한 정보라, 서버가 준 생성 시각(`updatedAt`)을 그대로 쓴다.
       */}
      <p
        className="font-mono border-t border-on-ink-15 pt-[9px] text-on-ink-45 text-10 leading-[1.6]"
      >
        {decision.updatedAt ? (
          <>
            {relative(decision.updatedAt, now)} 분석 · {stamp(decision.updatedAt)}
            <br />
          </>
        ) : null}
        투자 판단의 참고 자료이며 투자 권유가 아닙니다.
      </p>
    </section>
  );
}
