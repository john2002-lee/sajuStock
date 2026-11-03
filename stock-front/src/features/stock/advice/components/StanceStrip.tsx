import { AGENT_ORDER, type AgentOpinion, type Stance } from "../model/types";

/**
 * 입장 → 색. **등락색을 쓰지 않는다.**
 *
 * 긍정에 `--up`(상승 빨강)을 주면 "이 종목이 오른다" 로 읽힌다. 에이전트의 입장은
 * 시세 예측이 아니라 **읽은 자료에 대한 평가**라, 그 둘이 같은 색을 쓰면 안 된다.
 * 판단 영역과 시세 영역을 시각적으로 섞지 않는다는 규칙(통합 기획 5.7)이 여기서도
 * 같은 방향으로 걸린다.
 */
const TONE: Record<Stance, string> = {
  긍정: "bg-ma60",
  중립: "bg-muted-45",
  부정: "bg-ma20",
};

/**
 * 에이전트 셋의 입장을 **한 줄로 나란히** 보여준다.
 *
 * ## 이 줄이 이 제품의 주장 그 자체다
 *
 * README 는 AI 의 역할을 *"분산된 정보를 정리하고 판단 근거를 이해하기 쉽게
 * 보여주는 것"* 이라고 적었다. 그런데 화면은 그 약속을 지키지 않고 있었다 —
 * 셋이 갈렸는지 알려면 **카드 세 장을 다 읽어야** 했다.
 *
 * 점 세 개를 헤더 아래 고정하면 도착하는 순간마다 합의와 불일치가 보인다.
 *
 *     ● 긍정   ● 중립   ● 부정      ← 셋이 갈렸다
 *     ● 긍정   ● 긍정   ● 긍정      ← 만장일치
 *
 * ## 색만으로 말하지 않는다
 *
 * 점 옆에 입장을 글자로 적는다. 색각이상 사용자에게 초록/회색/황토의 구분은
 * 신뢰할 수 없고, 무엇보다 **셋이 갈렸다는 사실이 이 줄의 요점**이라 그것이
 * 색에만 실리면 안 된다.
 *
 * `stance` 는 LLM 경로에서만 온다 — 규칙 기반 폴백 의견에는 없다. 아직 도착하지
 * 않은 자리와 입장을 못 낸 자리를 **다르게** 그린다: 전자는 점선 테두리(자리가
 * 비었다), 후자는 대시(왔지만 말하지 못했다).
 */
export function StanceStrip({ agents }: { agents: AgentOpinion[] }) {
  const byName = new Map(agents.map((opinion) => [opinion.agent, opinion]));

  return (
    <ul className="flex items-stretch gap-1.5" aria-label="에이전트별 입장">
      {AGENT_ORDER.map(({ name, lens }) => {
        const opinion = byName.get(name);
        const stance = opinion?.stance;

        return (
          <li
            key={name}
            className="flex min-w-0 flex-1 flex-col gap-1 rounded-6 border border-line-18 px-2 py-1.5"
          >
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={`dot block h-[7px] w-[7px] flex-none ${
                  stance
                    ? TONE[stance]
                    : opinion
                      ? "bg-muted-30"
                      : "border border-dashed border-line-30"
                }`}
              />
              <span className="truncate font-medium text-11">
                {stance ?? (opinion ? "—" : "대기")}
              </span>
            </span>
            <span className="truncate font-mono text-muted-45 text-10">{lens}</span>
          </li>
        );
      })}
    </ul>
  );
}
