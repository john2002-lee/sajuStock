"use client";

import { useSearchParams } from "next/navigation";

/**
 * 토스가 실패 리다이렉트에 실어 주는 사유를 그대로 보여 준다.
 *
 * 사유가 없으면 아무것도 그리지 않는다 — "알 수 없는 오류" 같은 빈 문장을 채우면
 * 화면만 길어지고 알려 주는 것이 없다.
 */
export function PayFailNotice() {
  const params = useSearchParams();
  const message = params.get("message");
  const code = params.get("code");

  if (!message && !code) return null;

  return (
    <p className="rounded-card-sm border border-hairline bg-surface-warm px-4 py-3 text-[13.5px] leading-relaxed text-ink-body">
      {message ?? "결제가 취소되었습니다."}
      {code && <span className="ml-1.5 font-mono-kr text-[11px] text-muted-2">({code})</span>}
    </p>
  );
}
