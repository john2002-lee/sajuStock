"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * 드로어 열림 상태를 URL(?ai=1)과 동기화한다.
 *
 * useSearchParams 를 쓰지 않는 이유: 그러면 트리거·드로어가 클라이언트 전용으로
 * 떨어져 나가 SSR HTML 에서 AI 버튼이 사라졌다가 하이드레이션 후 나타난다.
 * 대신 서버가 초기값을 내려주고, 이후 변경은 history API 로 처리한다.
 * Next 는 pushState 를 라우터와 연결하므로 뒤로가기도 그대로 동작한다.
 */

interface AdviceContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
  /** ?fallback=1 — LLM 실패 경로 확인용 개발 스위치 */
  fallback: boolean;
  /**
   * AI 판단을 쓸 수 있는가 (= 로그인했는가). 서버가 `canUseAdvice()` 로 판단해
   * 내려준다 — 클라이언트가 `useSession()` 으로 다시 묻지 않는다. 그래야 SSR HTML
   * 에 이미 맞는 진입점이 그려지고, 버튼이 한 프레임 깜빡이지 않는다.
   */
  canUse: boolean;
  /**
   * `canUse` 가 false 일 때 진입점이 걸 링크. **서버가 만들어 내려준다.**
   *
   * 이 컴포넌트가 URL 을 클라이언트에서 읽지 않는 것과 같은 이유다 — `usePathname`
   * 을 쓰면 트리거가 라우팅 훅에 묶이고, 이 파일이 지금까지 피해 온 것이 정확히
   * 그것이다(위 주석). 돌아올 자리를 아는 것은 어차피 페이지 쪽이다.
   */
  loginHref: string;
}

const AdviceContext = createContext<AdviceContextValue | null>(null);

export function AdviceProvider({
  initialOpen,
  fallback,
  canUse,
  loginHref,
  children,
}: {
  initialOpen: boolean;
  fallback: boolean;
  /** `canUseAdvice()` 의 결과. false 면 이 프로바이더는 드로어를 열지 않는다 */
  canUse: boolean;
  /** 로그인 화면 링크 (돌아올 자리 포함). `canUse` 가 true 면 쓰이지 않는다 */
  loginHref: string;
  children: React.ReactNode;
}) {
  // **`?ai=1` 로 들어와도 못 쓰면 열지 않는다.** 이 링크는 검색 팔레트의 ⌥⏎ 와
  // 공유 주소로 들어오므로 로그인 여부와 무관하게 도착한다. 열어 두면 드로어가
  // 뜨는 순간 스트림이 나가고 라우트가 401 로 돌려보내는데, 사용자에게는 원인
  // 없는 실패로 보인다 — 문을 열지 않는 편이 정직하다.
  const [open, setOpenState] = useState(initialOpen && canUse);

  const setOpen = useCallback((next: boolean) => {
    // 여는 것만 막는다. 닫기는 언제나 통해야 한다 — 못 쓰는 상태로 열려 있는
    // 경로가 생기면(설정이 요청 중간에 바뀌는 등) 닫을 수 없게 된다.
    if (next && !canUse) return;
    setOpenState(next);
    const search = new URLSearchParams(window.location.search);
    if (next) search.set("ai", "1");
    else search.delete("ai");
    const query = search.toString();
    window.history.pushState(
      null,
      "",
      query ? `${window.location.pathname}?${query}` : window.location.pathname,
    );
  }, [canUse]);

  // 뒤로가기/앞으로가기로 ?ai=1 이 바뀌면 드로어도 따라간다.
  useEffect(() => {
    const sync = () => {
      const search = new URLSearchParams(window.location.search);
      // 히스토리에도 게이트를 건다 — 로그인 전에 남긴 `?ai=1` 항목으로 되돌아가는
      // 경로가 `setOpen` 을 거치지 않기 때문이다.
      setOpenState(search.get("ai") === "1" && canUse);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [canUse]);

  return (
    <AdviceContext.Provider value={{ open, setOpen, fallback, canUse, loginHref }}>
      {children}
    </AdviceContext.Provider>
  );
}

export function useAdvice(): AdviceContextValue {
  const context = useContext(AdviceContext);
  if (!context) {
    throw new Error("useAdvice must be used inside <AdviceProvider>");
  }
  return context;
}
