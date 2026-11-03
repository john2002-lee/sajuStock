import { isSafeHttpUrl } from "@/lib/utils/safe-url";
import { AGENT_META, type AgentOpinion } from "../model/types";

/**
 * 이 의견이 무엇을 읽고 나온 것인지 한 줄로 밝힌다.
 *
 * 제목을 그대로 쓰는 이유: "뉴스 3건"처럼 세어 주면 사용자가 검증할 수 없다.
 * 제목이 보이면 판단이 어느 사건에 걸려 있는지 바로 읽히고, 링크가 있으면 원문까지
 * 갈 수 있다. 목 데이터가 쓰는 한 줄 문자열(`source`)도 그대로 받아준다.
 *
 * 규칙 기반 폴백 의견은 근거 문서가 없어 아무것도 그리지 않는다 — 지표로 만든
 * 문장에 출처를 붙이면 LLM이 문서를 읽고 쓴 것처럼 보인다.
 */
function AgentSources({ opinion }: { opinion: AgentOpinion }) {
  const documents = opinion.sources ?? [];

  if (documents.length === 0) {
    return opinion.source ? (
      <span className="font-mono text-muted-45 text-10">
        근거: {opinion.source}
      </span>
    ) : null;
  }

  return (
    <ul
      className="flex flex-col gap-1 border-t border-line-14 pt-2 font-mono text-muted-45 text-10 leading-[1.5]"
    >
      {documents.map((doc, index) => (
        <li key={`${doc.url || doc.title}-${index}`} className="flex gap-1.5">
          <span aria-hidden className="flex-none text-muted-35">
            근거
          </span>
          {isSafeHttpUrl(doc.url) ? (
            <a
              href={doc.url}
              target="_blank"
              rel="noreferrer noopener"
              className="min-w-0 truncate underline decoration-line-30 underline-offset-2 hover:text-ink"
            >
              {doc.title}
            </a>
          ) : (
            <span className="min-w-0 truncate">{doc.title}</span>
          )}
          {doc.publisher ? (
            <span className="flex-none text-muted-35">· {doc.publisher}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function AgentCard({
  opinion,
  index,
}: {
  opinion: AgentOpinion;
  index: number;
}) {
  const meta = AGENT_META[opinion.agent];
  const failed = opinion.status === "fallback";

  return (
    <article className="flex animate-fade-up flex-col gap-2 border border-line-18 bg-paper p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-2">
          <span
            className="num font-medium text-muted-40 text-11"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="font-display font-bold text-16">
            {opinion.agent}
          </span>
          {meta ? (
            <span
              className="font-mono text-muted-45 text-11"
            >
              {meta.nameEn}
            </span>
          ) : null}
        </span>
        {opinion.stance || failed ? (
          <span
            className="whitespace-nowrap border border-line-25 px-1.5 py-0.5 font-mono font-medium tracking-label-tight text-10"
          >
            {failed ? "실패" : opinion.stance}
          </span>
        ) : null}
      </div>

      <p
        className="font-display text-pretty text-ink-2 text-14 leading-[1.7]"
      >
        {opinion.summary}
      </p>

      <AgentSources opinion={opinion} />
    </article>
  );
}
