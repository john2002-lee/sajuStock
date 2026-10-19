"use client";

import { useState } from "react";
import { downloadPath, filenameFromDisposition } from "../model/checkout";

/**
 * 원본을 **한 번** 받는 버튼.
 *
 * `<a download>` 로 두지 않는 이유: 두 번째 요청은 410 JSON 이 오는데, 링크로 받으면
 * 브라우저가 그 JSON 을 파일로 저장해 버린다. 여기서는 응답을 직접 받아 성공이면
 * 파일로 저장하고, 실패면 서버의 문장을 그대로 보여 준다.
 */

type State =
  | { kind: "ready" }
  | { kind: "loading" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function TalismanDownloadButton({
  token,
  fallbackName,
}: {
  token: string;
  fallbackName: string;
}) {
  const [state, setState] = useState<State>({ kind: "ready" });

  async function handleClick() {
    setState({ kind: "loading" });
    try {
      const res = await fetch(downloadPath(token), { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setState({
          kind: "error",
          message: body?.error?.message ?? "내려받지 못했습니다. 고객센터로 알려 주세요.",
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameFromDisposition(res.headers.get("content-disposition"), fallbackName);
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setState({ kind: "done" });
    } catch {
      // 1회분은 서버가 이미 썼을 수 있다. 다시 누르라고 하지 않고 사람에게 보낸다.
      setState({
        kind: "error",
        message: "받는 도중 연결이 끊겼습니다. 파일이 저장되지 않았다면 고객센터로 알려 주세요.",
      });
    }
  }

  if (state.kind === "done") {
    return (
      <p role="status" className="mt-6 rounded-card-sm border border-hairline bg-surface-warm px-4 py-3 text-center text-[14px] leading-relaxed text-ink-body">
        내려받았습니다. 기기의 다운로드 폴더를 확인해 주세요.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={state.kind === "loading"}
        className="mt-6 block w-full rounded-pill bg-button-gradient px-6 py-3.5 text-center text-[15px] font-bold text-on-primary shadow-cta disabled:opacity-60"
      >
        {state.kind === "loading" ? "받는 중…" : "원본 내려받기 (1회)"}
      </button>
      {state.kind === "error" && (
        <p role="alert" className="mt-3 rounded-card-sm border border-hairline bg-surface-warm px-4 py-3 text-[13.5px] leading-relaxed text-wuxing-fire">
          {state.message}
        </p>
      )}
    </>
  );
}
