"use client";

import { useState } from "react";
import { AXIS_META, type ProfileAxes, type ProfileDraft } from "../model/types";

/**
 * 투자 성향 초안 보정 화면.
 *
 * **이 화면이 제품의 방어 논리를 떠받친다** (통합 기획 3.4). 사주 해석이 틀려도
 * 사용자가 고치므로 제품이 깨지지 않고, 최종 프로파일이 "사용자가 확인·수정한 자기
 * 성향"이 되어 근거가 사용자에게 있다. 그래서:
 *
 * - 초안임을 **명시한다.** "정직함이 방어막이다"(기획 5.7).
 * - 슬라이더를 하나라도 만지면 `source` 가 `saju` 에서 `user_edited` 로 바뀐다.
 *   그 순간부터 이 숫자는 사주의 주장이 아니라 사용자의 진술이다.
 * - 사주 요약 문장(`sajuSummary`)은 **여기에만** 나온다. 판단 화면에도, 판단 LLM
 *   컨텍스트에도 가지 않는다.
 */

export interface ProfileEditorProps {
  draft: ProfileDraft;
  pending: boolean;
  error: string | null;
  saved: boolean;
  onSave: (axes: ProfileAxes, source: "saju" | "user_edited") => void;
}

export function ProfileEditor({ draft, pending, error, saved, onSave }: ProfileEditorProps) {
  const [axes, setAxes] = useState<ProfileAxes>({
    riskAppetite: draft.riskAppetite,
    patience: draft.patience,
    decisiveness: draft.decisiveness,
    lossAversion: draft.lossAversion,
    herdTendency: draft.herdTendency,
  });
  const [edited, setEdited] = useState(false);

  function update(key: keyof ProfileAxes, value: number) {
    setAxes((prev) => ({ ...prev, [key]: value }));
    setEdited(true);
  }

  return (
    <div className="space-y-5">
      <div className="border border-dashed border-line-25 bg-surface px-4 py-3">
        <p className="text-[12px] leading-relaxed text-ink">{draft.sajuSummary}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-60">
          이 분석은 사주 해석을 바탕으로 만든 <strong className="text-ink">초안</strong>이며,
          아래에서 직접 수정하실 수 있습니다. 저장되는 것은 수정을 마친 숫자뿐입니다.
        </p>
      </div>

      <div className="space-y-4">
        {AXIS_META.map((meta) => (
          <div key={meta.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-[0.16em] text-muted-60">
                {meta.label}
              </span>
              <span className="text-[13px] tabular-nums text-ink">{axes[meta.key]}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={axes[meta.key]}
              onChange={(e) => update(meta.key, Number(e.target.value))}
              className="w-full accent-[var(--ink)]"
              aria-label={meta.label}
            />
            <div className="flex justify-between text-[10px] text-muted-45">
              <span>{meta.low}</span>
              <span>{meta.high}</span>
            </div>
          </div>
        ))}
      </div>

      {error !== null && (
        <p role="alert" className="text-[12px] text-up">
          {error}
        </p>
      )}

      {saved && (
        <p className="text-[12px] text-ok">
          저장했습니다. 이제 종목 분석이 이 성향을 함께 봅니다.
        </p>
      )}

      <button
        type="button"
        disabled={pending}
        // 만졌으면 사용자의 진술, 아니면 사주 초안 그대로. 이 구분이 화면의
        // "사주 해석 기반 초안입니다" 배지를 켜고 끄는 근거가 된다.
        onClick={() => onSave(axes, edited ? "user_edited" : "saju")}
        className="w-full bg-ink px-4 py-3 text-[12px] uppercase tracking-[0.18em] text-on-ink disabled:opacity-50"
      >
        {pending ? "저장 중…" : edited ? "수정한 성향 저장" : "이대로 저장"}
      </button>

      <p className="text-[10px] leading-relaxed text-muted-50">
        저장된 성향은 종목 판단을 <strong className="text-muted-70">보수적인 쪽으로만</strong>{" "}
        움직입니다. 성향이 잘 맞는다고 해서 매수 판단이 만들어지지는 않습니다.
      </p>
    </div>
  );
}
