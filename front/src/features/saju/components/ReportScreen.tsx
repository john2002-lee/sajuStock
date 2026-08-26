"use client";

import { useEffect, useRef, useState } from "react";
import { useStoredReading } from "../model/storage";
import { fromBirthInput } from "../services/wire";
import { jobErrorMessage, runJob } from "../services/jobs";
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

    runJob<ReportResult>({
      startPath: "/api/saju/report/jobs",
      statusPath: (id) => `/api/saju/report/jobs/${encodeURIComponent(id)}`,
      body: { birth: fromBirthInput(stored.birth) },
      resultOf: (envelope) => (envelope as { report?: ReportResult }).report,
      signal: controller.signal,
    })
      .then(setReport)
      .catch((err) => {
        // 화면을 떠나서 끊은 것은 실패가 아니다. 여기서 상태를 건드리면 사라진
        // 컴포넌트에 `setState` 를 하게 된다.
        if (controller.signal.aborted) return;
        setError(
          jobErrorMessage(err, "리포트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요."),
        );
      });

    return () => {
      controller.abort();
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
