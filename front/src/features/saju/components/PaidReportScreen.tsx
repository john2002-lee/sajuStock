"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, bff } from "@/lib/http/browser";
import type { WireChart, WireLuck } from "../services/wire";
import { toChart, toLuck } from "../services/wire";
import type { SajuChart, Luck } from "../model/types";
import { SUPPORT_EMAIL } from "@/lib/config/public";
import { SAJU_EVENT } from "@/shared/analytics/events";
import { identifyUser } from "@/shared/analytics/track";
import { trackSaju } from "../model/analytics";
import { elapsedSince, setReportTier } from "../model/analytics-context";
import { extractPreamble, splitSections } from "../model/sections";
import { loadViews, recordView, saveViews } from "../model/report-views";
import { abortableSleep } from "../services/jobs";
import { Shaman } from "./Shaman";
import { FollowUpChat, toFollowUpInitial, type FollowUpInitial } from "./FollowUpChat";
import { WaitingPanel } from "./WaitingPanel";
import { WebtoonReport } from "./WebtoonReport";

/**
 * 구매한 리포트 화면 — 토큰으로 서버에서 받아 그린다.
 *
 * ## sessionStorage 를 쓰지 않는다
 *
 * 무료 경로(`/saju/report`)는 브라우저 저장소에 의존해도 됐다. 다시 계산하면
 * 그만이니까. **돈을 낸 리포트는 다르다** — 새로고침·다른 기기·나중에 다시 열기가
 * 전부 가능해야 하고, 그래서 서버가 저장하고 이 화면은 토큰으로 받아 온다.
 *
 * 토큰이 곧 자격 증명이라 이 주소는 색인되지 않는다(페이지 metadata 의 `noindex`).
 *
 * ## 대화도 서버에서 온다
 *
 * 추가 질문은 이 주문에 묶여 저장되므로(`models/saju_order.SajuFollowUpRow`),
 * 새로고침해도 대화가 남고 질문 3개가 되살아나지 않는다. 그 시작 상태를 리포트와
 * **한 번에** 받아 `FollowUpChat` 에 넘긴다 — 화면이 뜨자마자 별도 조회를 하나 더
 * 하지 않으려고 같은 응답에 실었다.
 *
 * ## 리포트가 아직 없을 수 있다 — 그래서 기다린다
 *
 * 결제 승인은 리포트를 기다리지 않고 돌아온다(그래야 결제 성공 여부를 즉시 알 수
 * 있다). 그러니 이 화면은 **승인 직후 몇십 초 동안 리포트가 아직 없는 상태를 반드시
 * 지난다.** 서버는 그때 409 `saju_report_generating` 을 준다.
 *
 * 그 코드일 때만 다시 묻는다. 결제가 확인되지 않은 경우(`saju_report_not_ready`)와
 * 사람이 확인 중인 경우(`saju_payment_needs_attention`)도 409 인데, 그 둘은 **기다려도
 * 바뀌지 않는다** — 구분하지 않으면 둘 중 하나에서 반드시 틀린 행동을 한다.
 */

/**
 * 리포트를 기다리는 상한. 생성이 실측 36초라 넉넉하되 무한이 아니다 —
 * 상한이 없으면 저장이 끝내 실패했을 때 화면이 영원히 춤춘다.
 */
const WAIT_DEADLINE_MS = 180_000;

/** 다시 묻는 간격. 조회가 값싼 DB 읽기라 자주 물어도 부담이 없다. */
const POLL_INTERVAL_MS = 2_000;

interface PaidReportResponse {
  access_token: string;
  markdown: string;
  chart: {
    chart: WireChart;
    luck: WireLuck;
    strength_verdict: string;
  };
  source: "llm" | "fallback";
  /** 지금까지의 추가 질문. **새로고침해도 남는다.** */
  follow_ups: Array<{
    question: string;
    answer: string | null;
    status: "pending" | "answered" | "refused";
    source: "llm" | "fallback";
  }>;
  follow_ups_spent: number;
  max_follow_ups: number;
}

interface Loaded {
  markdown: string;
  chart: SajuChart;
  luck: Luck;
  strengthVerdict: string;
  source: "llm" | "fallback";
  /** 서버가 센 대화 상태. 채팅의 시작점이 된다. */
  followUp: FollowUpInitial;
}

export function PaidReportScreen({ token }: { token: string }) {
  const [report, setReport] = useState<Loaded | null>(null);
  const [error, setError] = useState<{
    message: string;
    retryable: boolean;
    /** 사람이 확인 중인 상태. 연락처를 보여 줄 유일한 경우다. */
    needsAttention: boolean;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const url = `/api/saju/reports/${encodeURIComponent(token)}`;
    const deadline = Date.now() + WAIT_DEADLINE_MS;
    const startedAt = Date.now();

    async function load() {
      for (;;) {
        try {
          const data = await bff.get<PaidReportResponse>(url, {
            signal: controller.signal,
          });
          if (!data) throw new Error("빈 응답");
          setReport({
            markdown: data.markdown,
            chart: toChart(data.chart.chart),
            luck: toLuck(data.chart.luck),
            strengthVerdict: data.chart.strength_verdict,
            source: data.source,
            followUp: toFollowUpInitial(data),
          });

          // 결제 리다이렉트로 돌아온 브라우저는 새 페이지 수명을 갖는다 — 티저에서
          // 넣어 둔 등급이 남아 있더라도 여기서 다시 확정해 두어야, 북마크로 곧장
          // 들어온 재열람에도 `paid` 가 실린다.
          setReportTier("paid");

          // 첫 열람은 매출 퍼널의 최종 전환이고, 두 번째부터는 리텐션이다.
          // 한 이벤트로 두면 재방문마다 전환이 부풀어 전환율이 100% 를 넘는다.
          const seen = recordView(loadViews(), token);
          saveViews(seen.map);

          const shared = {
            report_source: data.source,
            section_count: splitSections(data.markdown).length,
            has_preamble: extractPreamble(data.markdown).length > 0,
          };

          if (seen.viewIndex === 1) {
            trackSaju(SAJU_EVENT.reportViewed, {
              ...shared,
              // 결제 직후 이 화면이 기다린 시간. 서버에서 이미 끝나 있었으면 짧다.
              generation_ms: Date.now() - startedAt,
              // 같은 브라우저에서 입력부터 이어졌을 때만 잴 수 있다. 결제
              // 리다이렉트가 sessionStorage 를 지우지는 않으므로 대개 남아 있다.
              time_to_report_ms: elapsedSince("birth_submitted") ?? null,
            });
            identifyUser({ preInsert: { report_tier_seen: "paid" } });
          } else {
            trackSaju(SAJU_EVENT.reportReopened, {
              ...shared,
              view_index: seen.viewIndex,
              days_since_purchase: seen.daysSinceFirst,
              followups_used: data.follow_ups_spent,
            });
          }
          return;
        } catch (err) {
          // 화면을 떠나서 끊은 것은 실패가 아니다.
          if (controller.signal.aborted) return;

          const isApi = err instanceof ApiError;
          // **이 코드만 기다린다.** 다른 409(미결제·확인 중)는 기다려도 안 바뀐다.
          const generating = isApi && err.code === "saju_report_generating";

          if (generating && Date.now() < deadline) {
            await abortableSleep(POLL_INTERVAL_MS, controller.signal);
            continue;
          }

          trackSaju(SAJU_EVENT.reportFailed, {
            // 생성은 서버에서 끝났고 **가져오는 데** 실패한 것이다. 무료 경로의
            // `job` 실패와 고치는 자리가 다르다.
            failure_stage: "fetch",
            error_code: isApi ? err.code : "network",
            http_status: isApi ? err.status : 0,
            // 기다리다 상한에 걸린 것인지, 처음부터 거절된 것인지.
            elapsed_ms: Date.now() - startedAt,
          });
          setError({
            message: isApi ? err.message : "리포트를 불러오지 못했습니다.",
            // 409 는 "아직 준비 중" 이거나 "확인 중" 이다 — 둘 다 다시 열어 볼 가치가 있다.
            retryable: isApi && err.status === 409,
            needsAttention: isApi && err.code === "saju_payment_needs_attention",
          });
          return;
        }
      }
    }

    // 취소로 끊긴 대기가 예외로 올라오는데, 그것은 실패가 아니라 정리다.
    load().catch(() => {});

    return () => {
      controller.abort();
    };
  }, [token]);

  if (error) {
    return (
      <div className="mx-auto max-w-md">
        <div role="alert" className="rounded-card bg-surface p-6 shadow-card sm:p-8">
          <Shaman
            expression="concern"
            className="mx-auto mb-4 w-[150px] rounded-[16px] shadow-card-sm"
          />
          <h1 className="mb-3 font-display text-xl text-ink">리포트를 열지 못했네</h1>
          <p className="text-[14px] leading-relaxed text-ink-body">{error.message}</p>
          {error.needsAttention && SUPPORT_EMAIL && (
            <p className="mt-3 text-[13.5px] leading-relaxed text-ink-body">
              문의사항이 있으시면{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-gold-text underline underline-offset-2 hover:text-gold-text-strong"
              >
                {SUPPORT_EMAIL}
              </a>
              로 언제든 연락해 주세요.
            </p>
          )}
          {error.retryable && !error.needsAttention && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 w-full rounded-pill bg-button-gradient px-6 py-3 text-[14px] font-bold text-on-primary shadow-cta"
            >
              새로고침
            </button>
          )}
          <Link
            href="/saju"
            className="mt-3 block text-center text-[13px] text-muted-2 underline underline-offset-2 hover:text-gold-text-strong"
          >
            사주 입력으로
          </Link>
        </div>
      </div>
    );
  }

  if (!report) {
    return <WaitingPanel kicker="PREPARING" title="풀이를 꺼내 오고 있네" />;
  }

  return (
    <>
      {/* 구매한 리포트라는 표시. 이 주소를 저장해 두면 다시 볼 수 있다는 것을
          **화면에서** 말해 준다 — 그러지 않으면 창을 닫고 나서 찾지 못한다. */}
      <div className="mx-auto mb-5 max-w-2xl rounded-card-sm border border-hairline bg-surface-warm px-4 py-3">
        <p className="text-[12.5px] leading-relaxed text-ink-body">
          구매하신 리포트입니다. <strong className="font-semibold">이 주소를 저장해 두시면</strong>{" "}
          나중에 다시 보실 수 있습니다.
        </p>
      </div>

      <WebtoonReport
        markdown={report.markdown}
        chart={report.chart}
        luck={report.luck}
        strengthVerdict={report.strengthVerdict}
        source={report.source}
        followUp={<FollowUpChat target={{ token }} initial={report.followUp} />}
      />
    </>
  );
}
