"use client";

import { useTheme } from "@/shared/theme";
import type { ListedCompaniesStatus } from "../model/types";

const KRW = new Intl.NumberFormat("ko-KR");

/**
 * 첫 호출 지연 배너. 명세의 ensure_listed_companies 지연을 사용자에게 설명하는 자리다.
 * 지연 상태는 원인을 밝힌다 — README "문구 원칙".
 */
export function DelayBanner({ status }: { status: ListedCompaniesStatus }) {
  const { isTerminal } = useTheme();
  const loaded = KRW.format(status.loaded);
  const total = KRW.format(status.total);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2.5 border-t border-line-14"
      style={{
        background: "var(--pal-banner-bg)",
        padding: "11px var(--pal-row-px)",
      }}
    >
      <span
        aria-hidden
        className="dot block h-[11px] w-[11px] flex-none animate-dot-spin border-[1.6px] border-line-25"
        style={{ borderTopColor: "var(--pal-caret)" }}
      />
      {isTerminal ? (
        <span className="num text-muted-60 text-11">
          ensure_listed_companies … {loaded} / {total} sync
          {status.source === "KIND" ? " · KIND FALLBACK" : ""}
        </span>
      ) : (
        <>
          <span className="text-muted-65 text-12">
            상장사 목록을 처음 준비하는 중입니다 · {loaded} / {total} 종목
            {status.source === "KIND" ? " · KIND 폴백" : ""}
          </span>
          <span
            className="ml-auto font-mono text-muted-45 text-10"
          >
            ensure_listed_companies → fetch_krx_listed_companies
          </span>
        </>
      )}
    </div>
  );
}
