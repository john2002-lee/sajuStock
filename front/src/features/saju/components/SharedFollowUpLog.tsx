import type { SharedFollowUpTurn } from "../model/types";
import { Panel, PanelLabel, SpeechBubble } from "./Panel";
import { Shaman } from "./Shaman";

/**
 * 공유된 추가 질문 대화 — **읽기 전용.**
 *
 * ## `FollowUpChat` 을 재사용하지 않는다
 *
 * 그쪽은 입력창·프리셋 칩·남은 질문 수·전송 상태를 한 벌로 들고 있고, 그 전부가
 * **질문을 보낼 수 있는 사람**을 위한 것이다. props 로 껍을 씌우는 방법도 있지만
 * 그러면 "입력창을 그리지 않는 분기" 가 생기고, 그 분기가 실수로 뒤집히는 날
 * 링크를 받은 사람에게 입력창이 나타난다.
 *
 * **그런데 그것이 이 파일이 존재하는 진짜 이유는 아니다.** 입력창이 보이든 말든
 * 받은 사람은 새 질문을 할 수 없다 — 질문을 받는 경로가 접근 토큰을 요구하고, 공유
 * 응답에는 토큰이 담길 칸이 없다(`SajuSharedReport`). 화면은 그 사실을 **정직하게
 * 그리는** 쪽이고, 차단은 타입이 한다.
 *
 * ## 말풍선 조판은 그대로 베낀다
 *
 * 같은 대화가 구매자 화면과 공유 화면에서 다르게 보이면 보낸 사람이 "내가 본 것과
 * 다른 게 갔다" 고 생각한다. 그래서 `FollowUpChat` 의 배치를 문자 그대로 따른다 —
 * 내 질문은 오른쪽 정렬 버블, 그녀의 답은 `SpeechBubble`.
 *
 * 색 규칙도 같다: `SpeechBubble` **안쪽**은 두 테마 모두 흰 바탕이라 글자색이
 * 리터럴이어야 하고(`Panel.tsx`), 패널 위에 놓이는 질문 버블은 테마 토큰을 쓴다.
 */
export function SharedFollowUpLog({ turns }: { turns: SharedFollowUpTurn[] }) {
  // 대화 없이 리포트만 산 사람이 대다수다. 빈 패널을 그리면 "여기 뭔가 있어야
  // 하는데 없다" 로 읽힌다.
  if (turns.length === 0) return null;

  return (
    <Panel>
      <div>
        <PanelLabel>주고받은 이야기</PanelLabel>
        <h2 className="-mt-1 font-display text-xl text-ink">이렇게 더 여쭤보셨네</h2>
        {/* 받은 사람이 이 대화의 주인이 아니라는 것을 말한다. 리포트 본문은 누구
            것인지 헷갈릴 여지가 적지만, 질문은 **사람이 직접 쓴 말**이라
            자기 것으로 읽히면 오해가 크다. */}
        <p className="mt-2 text-[13px] leading-relaxed text-muted-2">
          링크를 보낸 분이 무당에게 물어본 내용입니다.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-7">
        {turns.map((turn, i) => (
          <div key={i}>
            {/* 내 말풍선 — 말풍선 "안"이 아니라 패널 위에 놓이므로 테마 토큰이
                맞다. 오른쪽 정렬로 그녀의 말과 구분된다. */}
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-[20px] rounded-br-[6px] border border-hairline bg-surface-warm px-4 py-2.5 text-[15px] leading-relaxed text-ink">
                {turn.question}
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
              {/* 위 리포트에서 이미 여러 번 등장한 같은 인물이라 `decorative`. */}
              <Shaman
                expression="speak"
                decorative
                className="mx-auto w-[120px] shrink-0 rounded-[16px] shadow-card-sm sm:mx-0 sm:w-[136px]"
              />
              <div className="min-w-0 flex-1 sm:pt-5">
                <SpeechBubble>
                  {/* 답은 모델이 쓴 평문이다. 마크다운으로 렌더하지 않는 이유는
                      프롬프트가 평문을 요구하고, 렌더러를 하나 더 태우면 살균
                      대상만 늘기 때문이다 — `FollowUpChat` 과 같은 판단이다. */}
                  {turn.answer
                    .split(/\n{2,}/)
                    .map((para) => para.trim())
                    .filter(Boolean)
                    .map((para, p) => (
                      <p key={p}>{para}</p>
                    ))}
                </SpeechBubble>
                {/* 거절된 턴은 답이 아니라 안내문이다. 표시하지 않으면 그 문장이
                    정상 답변처럼 읽힌다 — 구매자 화면이 같은 구분을 한다. */}
                {turn.status === "refused" && (
                  <p className="mt-2 text-[11.5px] text-muted-2">
                    이 질문에는 답하지 않았습니다.
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
