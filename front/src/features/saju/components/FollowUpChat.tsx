"use client";

import { useEffect, useState } from "react";
import { bff } from "@/lib/http/browser";
import type { BirthInput } from "../model/types";
import { fromBirthInput } from "../services/wire";
import { jobErrorMessage, runJob } from "../services/jobs";
import { Panel, PanelLabel, SpeechBubble } from "./Panel";
import { Shaman } from "./Shaman";
import { ShamanDance } from "./ShamanDance";

/**
 * 리포트 아래에 붙는 추가 질문 채팅.
 *
 * 리포트 본문을 대체하지 않고 그 밑에 놓인다 — 긴 글을 다 읽은 다음 대화가
 * 시작되는 순서다. 말하는 사람은 위 웹툰과 같은 무당이라, 답은 새 UI 가 아니라
 * 그녀의 말풍선(`SpeechBubble`)으로 이어진다.
 *
 * ## 슬롯은 경로에 따라 다르게 센다
 *
 * **유료 경로 — 서버가 센다.** 돈을 낸 사람의 질문 3개는 권리이고, 권리는 서버가
 * 지켜야 한다. 원본 SajuService 가 주문에 묶인 슬롯을 DB 로 관리한 이유가 그것이고,
 * 이제 이쪽도 같다(`models/saju_order.SajuFollowUpRow`). 그래서:
 *
 *   · 새로고침해도 대화가 남는다 — `initial` 로 들어온다.
 *   · 새로고침으로 질문 3개가 되살아나지 않는다 — 남은 개수의 근거가 서버다.
 *   · 답이 **우리 쪽 문제로** 실패하면 서버가 슬롯을 돌려주므로, 답이 끝난 뒤
 *     서버에 다시 물어 맞춘다(`/api/saju/reports/{token}/follow-ups`).
 *
 * 합칠 때는 이것을 클라이언트 카운터로 두었고, 근거는 "이 저장소에는 주문도 결제도
 * 없다" 였다. 결제가 붙으면서 그 근거가 사라졌다.
 *
 * **무료 경로 — 화면이 센다.** 저장할 주문이 없으므로 지킬 권리도 없다. 남은 개수는
 * **비용 안내**이지 권리가 아니고, 새로고침하면 초기화된다. 그것을 서버로 옮기려면
 * 이 제품이 무료 경로에서 저장하지 않기로 한 것을 저장해야 한다.
 *
 * **서버 쪽 진짜 상한은 따로 있다**: 요청 한 건이 LLM 을 최대 2회 쓰고, 그 이상은
 * 폴백으로 떨어진다. 무료 경로의 카운터를 우회해도 한 번에 그만큼만 나간다.
 *
 * ## 답도 작업으로 받는다
 *
 * 답 하나에 LLM 한 번이라 브라우저 쪽 기본 타임아웃(20초)을 넘긴다 — 리포트 화면이
 * 20초에 끊겨 실패를 띄우던 것과 **같은 원인**이고, 여기도 같은 방식으로 고친다:
 * `POST /api/saju/followup/jobs` 로 접수하고 짧게 반복 조회한다
 * (`services/jobs.ts`).
 *
 * 색 규칙: `SpeechBubble` **안쪽**은 두 테마 모두 흰 바탕이라 글자색이 리터럴이어야
 * 한다(`Panel.tsx` 참고). 반대로 말풍선 바깥, 즉 패널 위에 놓이는 내 질문 버블과
 * 안내문은 테마를 따라야 하므로 토큰을 쓴다.
 */

export interface ChatTurn {
  question: string;
  answer: string;
  /** 답을 만들지 못해 규칙 기반 안내로 떨어진 턴. 화면이 그 사실을 밝힌다. */
  fallback: boolean;
}

/**
 * 유료 경로가 서버에서 받아 오는 시작 상태.
 *
 * `spent` 와 `turns.length` 가 **다를 수 있다**: 우리 쪽 실패로 돌려준 슬롯은
 * 대화에서 빠지지만 회계에서도 빠진다. 남은 개수의 근거는 항상 `spent` 다.
 */
export interface FollowUpInitial {
  turns: ChatTurn[];
  spent: number;
  maxFollowUps: number;
}

/** 서버가 내려주는 대화 상태(`schemas/saju.SajuFollowUpState`). */
interface WireFollowUpState {
  follow_ups: Array<{
    question: string;
    answer: string | null;
    status: "pending" | "answered" | "refused";
    source: "llm" | "fallback";
  }>;
  follow_ups_spent: number;
  max_follow_ups: number;
}

/**
 * 서버 표현 → 화면 표현.
 *
 * `pending` 은 뺀다 — 답이 오는 중인 질문을 답 없이 그리면 실패한 것처럼 보인다.
 * 그 질문을 보낸 화면은 이미 자기 대기 표시를 띄우고 있다.
 */
export function toFollowUpInitial(wire: WireFollowUpState): FollowUpInitial {
  return {
    turns: wire.follow_ups
      .filter((t) => t.status !== "pending" && t.answer !== null)
      .map((t) => ({
        question: t.question,
        answer: t.answer ?? "",
        fallback: t.source === "fallback",
      })),
    spent: wire.follow_ups_spent,
    maxFollowUps: wire.max_follow_ups,
  };
}

interface Preset {
  key: string;
  label: string;
}

/** 작업이 끝나면 나오는 답 한 벌(`schemas/saju.FollowUpResponse`). */
interface FollowUpAnswer {
  question: string;
  answer: string;
  source: "llm" | "fallback";
}

interface PresetsResponse {
  presets: Preset[];
  max_follow_ups: number;
  max_free_text: number;
}

const NETWORK_NOTICE = "연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";
const UNKNOWN_NOTICE = "질문을 전하지 못했습니다. 잠시 후 다시 시도해 주세요.";

const CHIP_CLASS =
  "rounded-pill border border-hairline bg-surface-warm px-3.5 py-1.5 text-[13px] text-ink-body " +
  "transition-colors hover:border-gold-accent hover:text-gold-text-strong " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/** 프리셋을 못 받았을 때의 최소 동작 — 자유 입력만으로도 물어볼 수 있어야 한다. */
const FALLBACK_LIMITS = { maxFollowUps: 3, maxFreeText: 200 };

/**
 * 질문을 보내는 두 가지 방법.
 *
 * 무료 경로는 생년월일시를 클라이언트가 들고 있고(서버가 저장하지 않으므로),
 * 유료 경로는 그것이 주문에 저장돼 있어 **토큰만** 있으면 된다. 후자에서 생년월일시를
 * 다시 브라우저로 내려보내지 않는 것이 요점이다 — 서버에 있는 것을 굳이 꺼내 오면
 * 저장한 보람이 없다.
 */
export type FollowUpTarget = { birth: BirthInput } | { token: string };

export function FollowUpChat({
  target,
  initial,
}: {
  target: FollowUpTarget;
  /** 유료 경로에서 서버가 준 시작 상태. 무료 경로는 주지 않는다. */
  initial?: FollowUpInitial;
}) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [limits, setLimits] = useState(FALLBACK_LIMITS);
  const [turns, setTurns] = useState<ChatTurn[]>(initial?.turns ?? []);
  /**
   * 소모된 슬롯 수. 유료 경로는 서버 값에서 시작하고 답마다 서버에 다시 물어
   * 맞춘다. 무료 경로는 `turns.length` 와 같게 움직인다.
   */
  const [spent, setSpent] = useState(initial?.spent ?? 0);
  const [pending, setPending] = useState(false);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * 프리셋과 상한을 서버에서 받는다. **복사본을 두지 않는 이유**: 화면이 자기
   * 목록을 들고 있으면 서버와 갈라지고, 그러면 버튼이 서버가 거절할 요청을
   * 활성화한다 — 사용자에게는 "보내 놓고 실패하는" 경험이 된다.
   */
  useEffect(() => {
    let cancelled = false;
    bff
      .get<PresetsResponse>("/api/saju/followup/presets")
      .then((data) => {
        if (cancelled || !data) return;
        setPresets(data.presets);
        setLimits({
          maxFollowUps: data.max_follow_ups,
          maxFreeText: data.max_free_text,
        });
      })
      .catch(() => {
        // 프리셋을 못 받아도 자유 입력은 살아 있어야 한다. 칩만 빠진다.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 상한은 서버가 준 값을 쓴다. 유료 경로는 주문에 묶인 값(`initial`), 무료 경로는
  // 프리셋 응답이 준 값이다. 화면이 자기 상수를 들면 서버가 거절할 요청을 활성화한다.
  const maxFollowUps = initial?.maxFollowUps ?? limits.maxFollowUps;
  const remaining = Math.max(0, maxFollowUps - spent);
  const trimmed = text.trim();
  const overLimit = trimmed.length > limits.maxFreeText;
  const canSendText = !pending && trimmed.length >= 2 && !overLimit;

  async function send(
    body: { preset_key: string } | { text: string },
    /** 화면에 남길 질문. 프리셋이면 서버가 준 답에서 실제 문장을 받아 덮는다. */
    shownQuestion: string,
  ) {
    if (pending || remaining <= 0) return;
    setPending(true);
    setNotice(null);

    try {
      const data = await runJob<{
        question: string;
        answer: string;
        source: "llm" | "fallback";
      }>({
        startPath: "/api/saju/followup/jobs",
        statusPath: (id) => `/api/saju/followup/jobs/${encodeURIComponent(id)}`,
        body: {
          ...("token" in target
            ? { access_token: target.token }
            : { birth: fromBirthInput(target.birth) }),
          ...body,
        },
        resultOf: (envelope) => (envelope as { answer?: FollowUpAnswer }).answer,
      });

      setTurns((prev) => [
        ...prev,
        {
          // 프리셋은 서버가 실제 문장을 갖고 있으므로 그것을 쓴다. 자유 입력은
          // **사용자가 보낸 그대로** 남긴다 — 서버가 정제한 사본을 자기 말풍선에
          // 박으면 무엇에 대한 답인지 흐려진다.
          question: "preset_key" in body ? data.question : shownQuestion,
          answer: data.answer,
          fallback: data.source === "fallback",
        },
      ]);
      setText("");

      if ("token" in target) {
        // 유료 경로: **서버에 다시 묻는다.** 낙관적으로 하나 올리면, 우리 쪽 실패로
        // 서버가 슬롯을 돌려준 경우에 남은 개수가 어긋나고 고객은 산 질문 하나를
        // 잃은 것으로 본다. 이 조회가 실패하면 낙관적 값으로 물러난다 — 숫자가
        // 조금 틀리는 것이 화면이 멈추는 것보다 낫다.
        try {
          const state = await bff.get<WireFollowUpState>(
            `/api/saju/reports/${encodeURIComponent(target.token)}/follow-ups`,
          );
          if (state) {
            setSpent(state.follow_ups_spent);
          } else {
            setSpent((n) => n + 1);
          }
        } catch {
          setSpent((n) => n + 1);
        }
      } else {
        setSpent((n) => n + 1);
      }
    } catch (error) {
      // 422 는 입력이 규칙에 안 맞는 경우다(길이 등). `jobErrorMessage` 가 서버
      // 문장을 우선하므로 그것이 그대로 뜬다 — 그쪽이 사용자 텍스트를 빼고 사유만
      // 담아 준다.
      setNotice(
        jobErrorMessage(error, error instanceof Error ? NETWORK_NOTICE : UNKNOWN_NOTICE),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <PanelLabel>더 물어보기</PanelLabel>
          <h2 className="-mt-1 font-display text-xl text-ink">궁금한 것을 더 여쭤보시게</h2>
        </div>
        <p className="font-mono-kr text-[11px] tracking-[0.12em] text-gold-text">
          남은 질문 {remaining}개
        </p>
      </div>

      {turns.length > 0 && (
        <div className="mt-6 flex flex-col gap-7">
          {turns.map((turn, i) => (
            <div key={i}>
              {/* 내 말풍선 — 말풍선 "안"이 아니라 패널 위에 놓이므로 여기는 테마
                  토큰이 맞다. 오른쪽 정렬로 그녀의 말과 구분된다. */}
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
                        대상만 늘기 때문이다. 문단만 나눈다. */}
                    {turn.answer
                      .split(/\n{2,}/)
                      .map((para) => para.trim())
                      .filter(Boolean)
                      .map((para, p) => (
                        <p key={p}>{para}</p>
                      ))}
                  </SpeechBubble>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pending && (
        <div className="mt-6 flex items-center gap-4" role="status" aria-live="polite">
          <ShamanDance width={92} className="shrink-0" />
          {/* `prefers-reduced-motion` 이면 춤이 멈추므로(globals.css), 상태를 말로도
              알려 주는 이 문구가 실제 대체 수단이다. */}
          <p className="font-mono-kr text-[13px] tracking-[0.1em] text-gold-text">점 치는 중…</p>
        </div>
      )}

      {notice && (
        <p
          role="status"
          aria-live="polite"
          className="mt-6 rounded-card-sm border border-hairline bg-surface-warm px-4 py-3 text-[14px] leading-relaxed text-ink-body"
        >
          {notice}
        </p>
      )}

      {remaining > 0 && (
        <div className="mt-6 border-t border-hairline pt-6">
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  disabled={pending}
                  onClick={() => send({ preset_key: preset.key }, preset.label)}
                  className={CHIP_CLASS}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4">
            <label htmlFor="followup-text" className="sr-only">
              무당에게 물어볼 질문
            </label>
            <textarea
              id="followup-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={pending}
              rows={3}
              placeholder="직접 물어보셔도 좋네. 예) 올해 이사해도 괜찮겠나?"
              className="w-full resize-none rounded-card-sm border border-hairline bg-surface-warm px-4 py-3 text-[15px] leading-relaxed text-ink outline-none placeholder:text-muted-3 focus:border-gold-accent disabled:opacity-60"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              {/* 상한은 서버가 준 값 하나만 본다 — 숫자를 두 벌 두면 서버가
                  거절하는 길이를 화면이 허락하게 된다. */}
              <span
                className={`font-mono-kr text-[11px] ${
                  overLimit ? "text-wuxing-fire" : "text-muted-2"
                }`}
              >
                {trimmed.length}/{limits.maxFreeText}
              </span>
              <button
                type="button"
                disabled={!canSendText}
                onClick={() => send({ text: trimmed }, trimmed)}
                className="rounded-pill bg-button-gradient px-6 py-2.5 text-[14px] font-bold text-on-primary shadow-cta disabled:cursor-not-allowed disabled:opacity-50"
              >
                물어보기
              </button>
            </div>
          </div>

          <p className="mt-4 text-[12px] leading-relaxed text-muted-2">
            민감한 개인정보(이름, 연락처, 주민등록번호, 건강 상태 등)는 적지 마세요.
          </p>
        </div>
      )}

      {remaining === 0 && (
        <p
          role="status"
          aria-live="polite"
          className="mt-6 border-t border-hairline pt-6 text-[13px] leading-relaxed text-muted-2"
        >
          이번 리포트의 추가 질문을 모두 사용하셨습니다. 새로 보시려면 처음부터 다시
          입력해 주세요.
        </p>
      )}
    </Panel>
  );
}
