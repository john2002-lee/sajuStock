"use client";

import { useState } from "react";
import { button, Icon } from "@/shared/ui";
import type { SaveState } from "../hooks/useSaveVerdict";

/**
 * 판단 아래 한 줄 — **기록됐는지**와 **공유**.
 *
 * ## 왜 "저장됨" 을 굳이 말하나
 *
 * 이 판단은 홈의 "내 판단 기록" 에 나타난다. 그런데 저장은 조용히 일어나므로,
 * 나중에 홈에서 안 보일 때 사용자는 **이유를 알 수 없다** — 로그인을 안 했는지,
 * 서버가 아팠는지, 원래 그런 기능이 없는지. 한 줄이 그걸 닫는다.
 *
 * 실패해도 사과하지 않는다. 판단 자체는 이미 위에 있고 기록은 부가 기능이다.
 *
 * ## 공유 링크는 클립보드로만 준다
 *
 * 새 탭으로 열면 방금 읽던 판단에서 사용자를 떼어 놓는다. 복사는 그 자리를
 * 지키면서 링크를 손에 쥐어 준다.
 */
export function VerdictSaveBar({
  state,
  shareId,
  sharing,
  onShare,
}: {
  state: SaveState;
  shareId: string | null;
  sharing: boolean;
  onShare: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (state === "idle" || state === "saving") return null;

  const shareUrl = shareId
    ? `${typeof window === "undefined" ? "" : window.location.origin}/verdict/${shareId}`
    : null;

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      // 클립보드 권한이 없는 브라우저가 있다. 그때는 아무 일도 일어나지 않는
      // 편이 낫다 — 실패를 알리는 상자가 판단 화면을 밀어낸다.
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 font-mono text-muted-50 text-10">
        <Icon
          name={state === "saved" ? "check" : "close"}
          size={12}
          className="flex-none"
        />
        {state === "saved" ? "기록에 저장됨" : "기록에 저장하지 못했습니다"}
      </span>

      {state === "saved" ? (
        shareUrl ? (
          <button
            type="button"
            onClick={copy}
            className={button({ tone: "quiet", size: 11, tap: false, className: "px-2.5 py-1" })}
          >
            {copied ? "링크 복사됨" : "공유 링크 복사"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onShare}
            disabled={sharing}
            className={button({ tone: "quiet", size: 11, tap: false, className: "px-2.5 py-1" })}
          >
            {sharing ? "여는 중…" : "공유 링크 만들기"}
          </button>
        )
      ) : null}
    </div>
  );
}
