"use client";

import { bff } from "@/lib/http/browser";
import { Icon } from "@/shared/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export interface WatchToggleProps {
  /** yfinance 심볼 (005930.KS). 담을 때 백엔드가 받는 값이다 */
  symbol: string;
  /** 6자리 코드 (005930). 뺄 때 경로에 들어간다 */
  code: string;
  /** 서버가 렌더 시점에 안 값. 이 화면은 목록을 이미 받아 오므로 추측하지 않는다 */
  watched: boolean;
  /** 콘솔(2b) 스킨은 테두리·여백이 다르다 */
  variant?: "default" | "console";
}

/**
 * 관심 종목에 담기 / 빼기.
 *
 * ## 이 버튼이 없어서 목록에 아무것도 담기지 않았다
 *
 * `useWatchlistMutations` 는 처음부터 `add` 를 들고 있었지만 **부르는 곳이 하나도
 * 없었다.** 관심종목 화면은 이미 담긴 것을 정렬·삭제·그룹핑할 뿐이라, 목록은 구조적으로
 * 영원히 비어 있었다 — 오류가 나지 않아 화면상으로는 "아직 안 담았네" 로만 보인다.
 * 담는 자리는 목록이 아니라 **종목을 보고 있는 화면**이다.
 *
 * ## 왜 클라이언트 컴포넌트인가
 *
 * 이 화면에서 브라우저로 내려가는 것을 최소로 두는 것이 이 프로젝트의 규칙인데
 * (CONVENTIONS), 담기는 **누른 자리에서 즉시 상태가 바뀌어야** 하는 동작이다.
 * form action + 서버 리다이렉트로 만들면 스크롤이 튀고, 별 하나 누르는 데 전체
 * 왕복이 보인다.
 *
 * ## 낙관적 갱신은 하되 **되돌린다**
 *
 * 눌렀을 때 별이 즉시 차야 한다. 다만 요청이 실패하면 원래대로 돌린다 — 담기지도
 * 않은 것을 담긴 것처럼 두면, 사용자는 관심종목 화면에 가서야 없다는 것을 안다.
 * 그때는 이미 어느 종목이 실패했는지 알 수 없다.
 *
 * 성공하면 `router.refresh()` 로 서버 데이터를 다시 받는다. 이 페이지의 관심종목은
 * 서버에서 오므로(레일·개수), 로컬 상태만 바꾸면 같은 화면 안에서 두 숫자가 어긋난다.
 */
export function WatchToggle({
  symbol,
  code,
  watched,
  variant = "default",
}: WatchToggleProps) {
  const router = useRouter();
  const [on, setOn] = useState(watched);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  async function toggle() {
    const next = !on;
    setOn(next);
    setFailed(false);

    try {
      // 브라우저에서 BFF 를 부르는 다른 곳과 같은 클라이언트를 쓴다 — 예전에는
      // 여기만 맨 fetch 에 `String(response.status)` 를 던져서, 같은 실패에도
      // 화면마다 다른 문장이 나왔다 (`lib/http/browser.ts`).
      if (next) await bff.post("/api/watchlist", { symbol });
      else await bff.delete(`/api/watchlist/${code}`);

      // 서버가 들고 있는 목록·개수와 맞춘다. 낙관적 상태만 두면 같은 화면의
      // 다른 숫자(콘솔 레일의 종목 수 등)와 어긋난 채로 남는다.
      startTransition(() => router.refresh());
    } catch {
      setOn(!next);
      setFailed(true);
    }
  }

  const label = on ? "관심 종목에서 빼기" : "관심 종목에 담기";
  const base =
    variant === "console"
      ? "border-line-28 px-2.5 py-1.5"
      : "border-line-28 px-3 py-2 hover:border-ink";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={on}
      // 색만으로 상태를 말하지 않는다 — 채워진 별과 빈 별은 형태가 다르고,
      // 여기에 글자 라벨(데스크탑)과 aria-pressed 가 더해진다.
      aria-label={label}
      title={failed ? `${label}에 실패했습니다. 다시 눌러 보세요.` : label}
      // 실패는 `border-down` 이다 — 이 팔레트에서 빨강(`--up`)은 상승 전용이라
      // 실패 표시에 쓰면 잘된 일처럼 읽힌다 (OpsPanel · BatchRow 주석과 같은 규칙).
      className={`flex flex-none items-center gap-1.5 whitespace-nowrap border font-medium disabled:opacity-50 ${base} ${
        on ? "border-ink bg-ink text-on-ink" : ""
      } ${failed ? "border-down" : ""} text-13`}
    >
      <Icon name={on ? "star-filled" : "star"} size={14} />
      {/* 좁은 화면에서는 글리프만 남긴다. 제호 우측에 컨트롤이 넷까지 서므로
          글자를 다 두면 375px 에서 제호를 밀어낸다. */}
      <span className="hidden md:inline">{on ? "담김" : "담기"}</span>
    </button>
  );
}
