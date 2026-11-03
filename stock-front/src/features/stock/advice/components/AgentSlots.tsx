import { AGENT_ORDER, type AgentOpinion } from "../model/types";
import { AgentCard } from "./AgentCard";
import { AgentSkeleton } from "./AgentSkeleton";

/**
 * 에이전트 셋의 자리. **도착한 것은 카드, 아직인 것은 그 사람 이름이 적힌 골격.**
 *
 * ## 무엇이 바뀌었나
 *
 * 예전에는 `agents.map()` 으로 도착한 것만 그리고 남은 자리에 익명 스켈레톤을
 * **한 장** 뒀다. 그래서 기다리는 동안 화면이 말해 주는 것이 "뭔가 오고 있다"
 * 뿐이었다 — 몇 명인지도, 무엇을 보고 있는지도 알 수 없었다.
 *
 * 이제 셋을 처음부터 세운다. 기다림이 **"누가 아직 말 안 했나"** 가 되고, 그
 * 동안에도 이 제품이 무엇을 하는지가 화면에 남아 있다.
 *
 * ## 순서가 도착 순서가 아니라 `AGENT_ORDER` 다
 *
 * 병렬로 도는 셋이라 도착 순서는 매번 다르다. 화면이 그 순서를 따라가면 같은
 * 종목을 두 번 열었을 때 카드 순서가 바뀌고, 사용자는 그것을 **내용이 바뀐 것**
 * 으로 읽는다. 자리를 고정하면 두 번째 방문에서 눈이 같은 곳을 본다.
 *
 * ## 이름이 어긋나면 조용히 빈다
 *
 * 백엔드 프로필 이름이 바뀌면 슬롯이 매칭되지 않아 영영 골격으로 남는다. 화면은
 * 깨지지 않으므로 눈치채기 어렵다 — 그래서 목록에 없는 이름으로 도착한 의견은
 * **버리지 않고 뒤에 덧붙인다.** 최소한 내용은 보인다.
 */
export function AgentSlots({
  agents,
  running,
}: {
  agents: AgentOpinion[];
  /** 아직 도는 중인가. 멈췄거나 끝났으면 빈 자리에 골격을 그리지 않는다 */
  running: boolean;
}) {
  const byName = new Map(agents.map((opinion) => [opinion.agent, opinion]));
  const known = new Set(AGENT_ORDER.map((slot) => slot.name));
  const strays = agents.filter((opinion) => !known.has(opinion.agent));

  return (
    <>
      {AGENT_ORDER.map(({ name, lens }, index) => {
        const opinion = byName.get(name);
        if (opinion) return <AgentCard key={name} opinion={opinion} index={index} />;

        return (
          <AgentSkeleton
            key={name}
            name={name}
            lens={lens}
            index={index}
            pending={running}
          />
        );
      })}

      {strays.map((opinion, index) => (
        <AgentCard
          key={opinion.agent}
          opinion={opinion}
          index={AGENT_ORDER.length + index}
        />
      ))}
    </>
  );
}
