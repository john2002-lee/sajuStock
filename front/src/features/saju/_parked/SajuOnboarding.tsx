"use client";

import { useState } from "react";
import { bff, ApiError } from "@/lib/http/browser";
import { SectionLabel } from "@/shared/ui";
import type { BirthInput, BirthPlace, ProfileAxes, SajuReading } from "../model/types";
import { fromBirthInput, toReading, type WireReading } from "../services/wire";
import { BirthForm } from "./BirthForm";
import { PillarGrid } from "./PillarGrid";
import { WuxingBars } from "./WuxingBars";
import { ProfileEditor } from "./ProfileEditor";
import { LuckTimeline } from "./LuckTimeline";

/**
 * 온보딩 흐름 전체 — 입력 → 사주·초안 → 보정 → 저장.
 *
 * 한 컴포넌트가 흐름을 들고 있는 이유: 세 단계가 **같은 한 번의 계산 결과**를 공유하기
 * 때문이다. 단계마다 서버를 다시 부르면 같은 사주를 두 번 계산하거나, 서버가 온보딩
 * 진행 상태를 들고 있어야 한다. 사주 계산은 순수 함수라 결과를 클라이언트가 들고
 * 있는 것이 가장 단순하다.
 *
 * 브라우저에서 서버를 부르는 통로는 `lib/http/browser` 하나다(CONVENTIONS) —
 * 맨 `fetch` 를 쓰지 않는다.
 */

export interface SajuOnboardingProps {
  places: BirthPlace[];
}

export function SajuOnboarding({ places }: SajuOnboardingProps) {
  const [reading, setReading] = useState<SajuReading | null>(null);
  const [chartPending, setChartPending] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function computeChart(input: BirthInput) {
    setChartPending(true);
    setChartError(null);
    // 다시 계산하면 이전 저장 결과 표시는 의미가 없다 — 다른 사주의 저장이었다.
    setSaved(false);
    setSaveError(null);

    try {
      const wire = await bff.post<WireReading>("/api/saju/chart", fromBirthInput(input));
      // BFF 는 204 를 낼 수 있는 계약이라 null 이 타입에 들어 있다. 이 경로에서는
      // 일어나지 않지만, 조용히 통과시키면 아래에서 빈 화면이 된다.
      if (wire === null) throw new Error("빈 응답");
      setReading(toReading(wire));
    } catch (error) {
      setChartError(
        error instanceof ApiError
          ? error.message
          : "사주를 계산하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setChartPending(false);
    }
  }

  async function saveProfile(axes: ProfileAxes, source: "saju" | "user_edited") {
    if (reading === null) return;

    setSavePending(true);
    setSaveError(null);
    try {
      await bff.put("/api/profile", {
        risk_appetite: axes.riskAppetite,
        patience: axes.patience,
        decisiveness: axes.decisiveness,
        loss_aversion: axes.lossAversion,
        herd_tendency: axes.herdTendency,
        source,
        // 표시 전용 문장. 저장은 하되 판단 계산에는 들어가지 않는다(기획 5.7) —
        // 그 경계는 백엔드 `domain/fit.py`·`domain/verdict.py` 가 이 필드를 읽지
        // 않는 것으로 지켜진다.
        saju_summary: reading.profile.sajuSummary,
      });
      setSaved(true);
    } catch (error) {
      setSaveError(
        error instanceof ApiError ? error.message : "성향을 저장하지 못했습니다.",
      );
    } finally {
      setSavePending(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <section className="space-y-4">
        <SectionLabel>생년월일시</SectionLabel>
        <BirthForm
          places={places}
          pending={chartPending}
          error={chartError}
          onSubmit={computeChart}
        />
      </section>

      {reading === null ? (
        <section className="flex items-center justify-center border border-dashed border-line-20 px-6 py-16">
          <p className="max-w-sm text-center text-[12px] leading-relaxed text-muted-55">
            생년월일시를 넣으면 사주를 계산하고, 거기서 뽑은 투자 성향 초안을
            보여 드립니다. 설문 20문항 대신 입력 네 개로 끝납니다.
          </p>
        </section>
      ) : (
        <section className="space-y-10">
          <div className="space-y-4">
            <SectionLabel>사주 원국</SectionLabel>
            <PillarGrid chart={reading.chart} />
            <p className="text-[12px] leading-relaxed text-ink">{reading.teaser.summary}</p>
          </div>

          {/* 빈도와 강약을 나란히 두되 **다른 카드**에 둔다. 한 블록에 섞으면
              "수가 4개라 신강" 같은 틀린 추론을 부른다 (WuxingBars 주석). */}
          <div className="grid gap-8 sm:grid-cols-2">
            <div className="space-y-3">
              <SectionLabel>오행 분포</SectionLabel>
              <WuxingBars counts={reading.chart.visibleWuxing} />
            </div>
            <div className="space-y-3">
              <SectionLabel>일간의 강약</SectionLabel>
              <div className="space-y-2">
                <p className="text-[15px] text-ink">
                  {reading.strength.verdict}
                  <span className="ml-2 text-[12px] tabular-nums text-muted-55">
                    점수 {reading.strength.score}
                  </span>
                </p>
                <ul className="space-y-1">
                  {reading.strength.basis.detail.map((line) => (
                    <li key={line} className="text-[11px] leading-relaxed text-muted-60">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <SectionLabel>대운</SectionLabel>
            <LuckTimeline luck={reading.luck} />
          </div>

          <div className="space-y-4 border-t border-line-18 pt-8">
            <SectionLabel>투자 성향 초안</SectionLabel>
            <ProfileEditor
              draft={reading.profile}
              pending={savePending}
              error={saveError}
              saved={saved}
              onSave={saveProfile}
            />
          </div>
        </section>
      )}
    </div>
  );
}
