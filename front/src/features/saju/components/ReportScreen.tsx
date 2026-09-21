"use client";

import { useEffect, useRef, useState } from "react";
import { SAJU_EVENT } from "@/shared/analytics/events";
import { identifyUser } from "@/shared/analytics/track";
import { useStoredReading } from "../model/storage";
import { trackSaju } from "../model/analytics";
import { elapsedSince } from "../model/analytics-context";
import { extractPreamble, splitSections } from "../model/sections";
import { fromBirthInput } from "../services/wire";
import { JobTimeoutError, jobErrorMessage, runJob } from "../services/jobs";
import { Shaman } from "./Shaman";
import { StartOverPrompt } from "./TeaserView";
import { FollowUpChat } from "./FollowUpChat";
import { WaitingPanel } from "./WaitingPanel";
import { WebtoonReport } from "./WebtoonReport";

/**
 * 리포트 화면 — 저장된 사주로 리포트를 **한 번** 생성해 웹툰으로 그린다.
 *
 * ## 이 화면은 실제로 고장나 있었다
 *
 * 예전에는 `POST /api/saju/report` 하나를 기다렸다. 그 호출은 실측 **36초**이고
 * 브라우저 → BFF 구간의 기본 타임아웃은 **20초**다(`lib/http/browser.ts`). 그래서
 * 매번 20초 뒤에 "지금은 풀이를 들려드리기 어렵네" 가 떴다 — 백엔드는 200 으로
 * 성공하고 있었는데 사용자는 실패만 봤다. BFF 라우트에 120초를 준 것이 서버 구간만
 * 덮어 문제를 가렸다.
 *
 * ## 그래서 폴링이 돌아왔다
 *
 * 원본 SajuService 는 결제 뒤 배경 워커가 리포트를 만들고 이 화면이 상태를
 * 폴링했다. 합칠 때 그것을 동기 호출로 바꿨는데, **원본이 맞았다.** 이제
 * `POST /api/saju/report/jobs` 로 접수하고 `.../jobs/{id}` 를 짧게 반복 조회한다
 * (`services/jobs.ts`). 긴 요청이 없으므로 타임아웃도, 끊긴 연결도, 화면을 끄는
 * 것도 결과를 잃게 하지 않는다.
 *
 * 기다림 자체는 여전히 30초 남짓이다. 그 시간을 고장으로 읽히지 않게 하는 일은
 * `WaitingPanel` 이 맡는다(경과 초·단계 문장).
 */

interface ReportResult {
  markdown: string;
  source: "llm" | "fallback";
}

export function ReportScreen() {
  const stored = useStoredReading();
  const [report, setReport] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * 생성을 **한 번만** 시작한다. 개발 모드의 Strict Mode 는 이펙트를 두 번
   * 실행하는데, 그대로 두면 LLM 호출이 두 번 나간다 — 돈이 드는 유일한 경로에서
   * 개발 중에만 조용히 두 배가 된다.
   */
  const started = useRef(false);

  useEffect(() => {
    // `undefined` 는 아직 저장소를 읽기 전이다. 그때 시작하면 없는 입력으로 요청한다.
    if (!stored || started.current) return;
    started.current = true;

    const controller = new AbortController();
    const startedAt = Date.now();

    runJob<ReportResult>({
      startPath: "/api/saju/report/jobs",
      statusPath: (id) => `/api/saju/report/jobs/${encodeURIComponent(id)}`,
      body: { birth: fromBirthInput(stored.birth) },
      resultOf: (envelope) => (envelope as { report?: ReportResult }).report,
      signal: controller.signal,
    })
      .then((result) => {
        setReport(result);

        // 무료 경로에서는 **잡이 끝나는 순간이 곧 읽기 시작하는 순간**이다.
        // 생성 완료를 따로 세지 않는 이유가 이것이다.
        trackSaju(SAJU_EVENT.reportViewed, {
          report_source: result.source,
          generation_ms: Date.now() - startedAt,
          section_count: splitSections(result.markdown).length,
          has_preamble: extractPreamble(result.markdown).length > 0,
          // 입력 제출부터 여기까지 — 사람이 체감하는 이 제품의 속도다.
          time_to_report_ms: elapsedSince("birth_submitted") ?? null,
        });
        identifyUser({ preInsert: { report_tier_seen: "free" } });
      })
      .catch((err) => {
        // 화면을 떠나서 끊은 것은 실패가 아니다. 여기서 상태를 건드리면 사라진
        // 컴포넌트에 `setState` 를 하게 된다.
        if (controller.signal.aborted) return;
        trackSaju(SAJU_EVENT.reportFailed, {
          failure_stage: "job",
          // 기다리다 상한에 걸린 것과 서버가 실패를 돌려준 것은 원인이 다르다 —
          // 앞은 용량, 뒤는 모델이나 정책이다.
          error_code: err instanceof JobTimeoutError ? "timeout" : "job_failed",
          elapsed_ms: Date.now() - startedAt,
        });
        setError(
          jobErrorMessage(err, "리포트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요."),
        );
      });

    return () => {
      controller.abort();
      /**
       * **취소한 요청은 시작한 적 없는 것으로 친다.**
       *
       * 이 한 줄이 없으면 개발 모드에서 리포트가 영영 안 나온다. StrictMode 는
       * mount → cleanup → mount 를 도는데, `started` 는 ref 라 리마운트를 살아남고
       * `controller` 는 버려진다. 그래서 1차 요청은 여기서 끊기고, 2차 mount 는
       * 위 가드에 막혀 아무것도 보내지 않는다 — 실측: `POST /api/saju/report/jobs`
       * 가 `net::ERR_ABORTED` 하나만 남고 백엔드 로그에는 요청 자체가 없으며,
       * 화면은 "풀고 있네" 에서 영원히 멈춘다. 아래 `.catch` 가 취소를 조용히
       * 삼키므로 오류조차 뜨지 않는다.
       *
       * 가드와 취소의 **수명이 달랐던 것**이 결함이다. 되돌려 맞춘다.
       *
       * 이렇게 해도 LLM 이 두 번 불릴 위험은 거의 없다 — 끊기는 시점이 StrictMode
       * 의 동기 리마운트라 요청이 네트워크에 닿기 전이다(실측이 그것을 보여준다).
       * 남는 위험은 "서버가 이미 접수한 뒤 끊긴" 경우뿐이고, 그것은 가드를 두지
       * 않았을 때의 확실한 이중 호출보다 훨씬 작다.
       */
      started.current = false;
    };
  }, [stored]);

  if (stored === undefined) return null;
  if (stored === null) return <StartOverPrompt />;

  if (error !== null) {
    return (
      <div className="mx-auto max-w-md">
        <div role="alert" className="rounded-card bg-surface p-6 shadow-card sm:p-8">
          <Shaman
            expression="sad"
            className="mx-auto mb-4 w-[150px] rounded-[16px] shadow-card-sm"
          />
          <p className="font-mono-kr text-xs tracking-[0.12em] text-wuxing-fire">풀이 실패</p>
          <h2 className="mt-2 mb-3 font-display text-xl text-ink">
            지금은 풀이를 들려드리기 어렵네
          </h2>
          <p className="text-sm leading-relaxed text-ink-body">{error}</p>
          {/* 다시 시도할 길을 준다. 예전에는 이 화면이 막다른 길이어서, 실패하면
              주소를 직접 고치지 않는 한 나갈 데가 없었다. */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 w-full rounded-pill bg-button-gradient px-6 py-3 text-[14px] font-bold text-on-primary shadow-cta"
          >
            다시 풀어 보기
          </button>
        </div>
      </div>
    );
  }

  if (report === null) {
    return <WaitingPanel kicker="READING" title="자네 사주를 풀고 있네" />;
  }

  return (
    <WebtoonReport
      markdown={report.markdown}
      chart={stored.reading.chart}
      luck={stored.reading.luck}
      strengthVerdict={stored.reading.strength.verdict}
      source={report.source}
      followUp={<FollowUpChat target={{ birth: stored.birth }} />}
    />
  );
}
