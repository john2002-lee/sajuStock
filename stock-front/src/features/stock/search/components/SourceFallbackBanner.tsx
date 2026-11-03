import type { ListedCompaniesStatus, SourceState } from "../model/types";

const STATE_COLOR: Record<SourceState, string> = {
  사용: "text-up",
  실패: "text-down",
  대기: "text-muted-45",
};

/**
 * 목록 수집 폴백 경고 (와이어프레임 1d).
 * KRX 조회가 실패해 KIND 나 내부 목록으로 내려갔을 때만 나온다 —
 * 결과가 불완전할 수 있다는 사실을 감추지 않는다.
 */
export function SourceFallbackBanner({
  status,
}: {
  status: ListedCompaniesStatus;
}) {
  if (status.source === "KRX") return null;

  const message =
    status.source === "KIND"
      ? "KRX 조회 실패 → KIND 목록 사용 중. 일부 종목이 빠질 수 있습니다."
      : "KRX·KIND 조회 실패 → 내부 기본 목록 사용 중. 검색 범위가 좁습니다.";

  return (
    // bg-surface 를 그대로 쓰면 터미널(4a)에서 --pal-bg 와 같은 색이라
    // 경고 배너가 배경에 묻힌다. 팔레트 전용 배너 배경 토큰을 쓴다.
    <div
      role="alert"
      className="flex flex-col gap-2.5 border-t border-line-14 py-3"
      style={{
        background: "var(--pal-banner-bg)",
        paddingInline: "var(--pal-row-px)",
      }}
    >
      <p className="text-muted-70 text-12">
        {message}
      </p>

      <div className="flex flex-col gap-1.5">
        {status.steps.map((step) => (
          <div
            key={step.source}
            className={`flex items-baseline justify-between gap-3 ${
              step.state === "대기" ? "text-muted-45" : ""
            } text-12`}
          >
            <span>{step.label}</span>
            <span
              className={`num font-medium ${STATE_COLOR[step.state]} text-11`}
            >
              {step.state}
            </span>
          </div>
        ))}
      </div>

      <p
        className="font-mono text-muted-45 text-10 leading-[1.4]"
      >
        fetch_krx_listed_companies → fetch_kind_listed_companies →
        fallback_listed_companies
      </p>
    </div>
  );
}
