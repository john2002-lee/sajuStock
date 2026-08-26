"use client";

import type { ComponentProps, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import type { Luck, SajuChart } from "../model/types";
import { toBeats } from "../model/beats";
import { extractPreamble, splitSections } from "../model/sections";
import { ConventionNotice } from "./ConventionNotice";
import { LuckPanel, PillarsPanel, WuxingPanel } from "./ChartPanels";

import { Panel, PanelLabel, ShamanBeat } from "./Panel";
import { Shaman } from "./Shaman";

/**
 * 리포트를 세로 스크롤 웹툰으로 들려준다.
 *
 * 읽기의 모양: 무당이 인사하고, 사주를 펼쳐 놓고, 그다음 각 섹션이 그녀의 대사가
 * 된다 — 계산된 패널(오행·대운)은 글이 그 이야기를 꺼내기 **직전**에 끼워 넣는다.
 * 그래야 사용자가 산문만이 아니라 **계산된 데이터**를 함께 본다.
 *
 * 두 가지 제약이 그대로 유지된다:
 *  - 마크다운은 LLM 출력이라 **신뢰할 수 없다.** 모든 섹션 본문은 `react-markdown`
 *    + `rehype-sanitize` 를 거치고, `dangerouslySetInnerHTML` 은 절대 쓰지 않는다.
 *  - 관례 고지(정자시설·강약 셈법·진태양시 보정)는 리포트와 함께 붙어 있는다.
 *
 * 추가 질문(`FollowUpChat`)이 스크롤을 닫는다 — 그녀의 마지막 대사 뒤, 잔글씨 앞.
 * 같은 인물이 계속 말하는 것이므로 별도 화면이나 탭이 아니라 이 스택의 일부다.
 */

/**
 * 말풍선 안의 마크다운.
 *
 * 여기 색은 토큰이 아니라 **리터럴**이다. 말풍선은 만화 관례상 흰 바탕이라
 * (`SpeechBubble` 참고) `text-ink-body` 를 쓰면 테마에 따라 흰 말풍선 위에 옅은
 * 글자가 나온다. 말풍선 안에 그려지는 것은 페이지가 아니라 말풍선에 맞춰야 한다.
 *
 * 섹션 제목은 이미 패널 라벨이 보여 주므로 h1~h3 는 작게 둔다.
 */
const BUBBLE_MARKDOWN: ComponentProps<typeof ReactMarkdown>["components"] = {
  h1: (props) => <p className="mb-2 font-display text-lg text-[#1C1C21]" {...props} />,
  h2: (props) => <p className="mb-2 font-display text-lg text-[#1C1C21]" {...props} />,
  h3: (props) => <p className="mb-2 font-display text-base text-[#1C1C21]" {...props} />,
  p: (props) => <p className="text-[16.5px] leading-[1.75] text-[#26262C]" {...props} />,
  ul: (props) => <ul className="list-disc space-y-1 pl-5 text-[#26262C]" {...props} />,
  ol: (props) => <ol className="list-decimal space-y-1 pl-5 text-[#26262C]" {...props} />,
  li: (props) => <li {...props} />,
  strong: (props) => <strong className="font-bold text-[#8A5A12]" {...props} />,
  em: (props) => <em className="text-[#5A5A64]" {...props} />,
  blockquote: (props) => <blockquote className="pl-4 italic text-[#5A5A64]" {...props} />,
  hr: () => null,
};

/**
 * 어떤 계산 패널을 어느 섹션 **앞에** 둘지 — 글이 그 데이터를 꺼내기 직전 자리다.
 */
const PANEL_BEFORE: Record<string, "wuxing" | "luck"> = {
  "강약과 균형": "wuxing",
  "대운의 흐름": "luck",
};

export interface WebtoonReportProps {
  markdown: string;
  chart: SajuChart;
  luck: Luck;
  /** 강약 판정. 오행 패널이 한 줄로 인용한다. */
  strengthVerdict: string;
  /** `fallback` 이면 LLM 없이 만든 간이 리포트다. */
  source: "llm" | "fallback";
  /**
   * 추가 질문 채팅. **호출부가 넘긴다.**
   *
   * 무료 경로는 생년월일시를 들고 있고 유료 경로는 토큰을 들고 있어, 질문을 보내는
   * 방법이 서로 다르다. 이 컴포넌트가 그 차이를 알 이유가 없으므로 슬롯으로 받는다.
   */
  followUp?: ReactNode;
}

export function WebtoonReport({
  markdown,
  chart,
  luck,
  strengthVerdict,
  source,
  followUp,
}: WebtoonReportProps) {
  const sections = splitSections(markdown);
  const preamble = extractPreamble(markdown);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      {/* 여는 비트. 고정 문구이지 모델 출력이 아니다 — 사주를 보여 주기도 전에
          이 사람에 대해 무엇도 주장해서는 안 된다. */}
      <Panel className="text-center">
        <Shaman
          expression="welcome"
          eager
          className="mx-auto w-[190px] rounded-[16px] shadow-card"
        />
        <p className="mt-4 font-mono-kr text-[10px] tracking-[0.2em] text-gold-text">사주 리포트</p>
        <h1 className="mt-1 font-display text-2xl text-ink">
          어서 오시게. 자네 사주를 펼쳐 보겠네.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          겁줄 생각은 없네. 타고난 기운이 어떤 모양인지, 그것만 찬찬히 일러 주겠네.
        </p>
      </Panel>

      {/* 폴백은 조용하지 않다 — 간이본이라는 사실을 먼저 말한다. */}
      {source === "fallback" && (
        <Panel>
          <PanelLabel>안내</PanelLabel>
          <p className="text-[14px] leading-relaxed text-ink-body">
            AI 풀이를 완성하지 못해 계산 결과만 정리한 간이 리포트입니다. 잠시 뒤 다시
            시도하시면 전체 풀이를 받아보실 수 있습니다.
          </p>
        </Panel>
      )}

      {/* 그녀가 첫 제목 위에 인사를 써 뒀다면 그것도 보여 준다. 서버의
          `validate_markdown` 이 머리말까지 정책 검사를 마친 뒤다. */}
      {preamble && (
        <ShamanBeat expression="welcome">
          <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={BUBBLE_MARKDOWN}>
            {preamble}
          </ReactMarkdown>
        </ShamanBeat>
      )}

      <PillarsPanel chart={chart} />

      {sections.map((section, i) => {
        const panel = PANEL_BEFORE[section.heading];
        // 섹션당 패널 하나가 아니라 **생각당 패널 하나**다: `toBeats` 가 문단을
        // 기준으로 나누고 아주 짧은 것은 합쳐서, 다섯 문단짜리 섹션이 그림 옆의
        // 텍스트 벽이 아니라 프레임의 연속으로 읽히게 한다. 섹션 제목과 접근성
        // 이름은 첫 비트만 갖는다 — 이어지는 것은 같은 인물이 계속 말하는 중이다.
        const beats = toBeats(section.body);
        return (
          <div key={`${section.heading}-${i}`} className="contents">
            {panel === "wuxing" && (
              <WuxingPanel chart={chart} strengthVerdict={strengthVerdict} />
            )}
            {panel === "luck" && <LuckPanel luck={luck} />}
            {beats.map((beat, b) => (
              <ShamanBeat
                key={b}
                expression={
                  section.heading === "조언" && b === beats.length - 1
                    ? "welcome"
                    : beat.expression
                }
                label={b === 0 ? section.heading : undefined}
                decorative={b > 0}
              >
                <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={BUBBLE_MARKDOWN}>
                  {beat.text}
                </ReactMarkdown>
              </ShamanBeat>
            ))}
          </div>
        );
      })}

      {/* 폴백: 마크다운에 `## 제목` 이 하나도 없었으면 빈 화면 대신 그대로라도
          보여 준다. `!preamble` 로 함께 막는 이유는, 제목이 없으면
          `extractPreamble` 이 이미 문서 전체를 돌려주므로 두 번 그려지기 때문이다. */}
      {sections.length === 0 && !preamble && (
        <ShamanBeat expression="speak">
          <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={BUBBLE_MARKDOWN}>
            {markdown}
          </ReactMarkdown>
        </ShamanBeat>
      )}

      {/* 대화는 풀이가 끝나는 자리에서 시작한다 — 그녀의 마지막 대사 뒤, 잔글씨 앞.
          리포트 위에 두거나 탭 뒤에 두면 아직 읽지도 않은 리포트에 대해 말을 걸라고
          요구하는 화면이 된다. */}
      {followUp}

      <Panel>
        <PanelLabel>일러두기</PanelLabel>
        <ConventionNotice />
      </Panel>
    </div>
  );
}
