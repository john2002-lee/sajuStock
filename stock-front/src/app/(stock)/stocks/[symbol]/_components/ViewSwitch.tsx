"use client";

import { Icon } from "@/shared/ui";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type DetailView = "editorial" | "console";

interface ViewContextValue {
  view: DetailView;
  setView: (next: DetailView) => void;
}

const ViewContext = createContext<ViewContextValue | null>(null);

/**
 * 2a(에디토리얼) ↔ 2b(터미널 콘솔) 전환. **A안 — 같은 라우트 + `?view=console`.**
 *
 * 다만 쿼리를 서버 `searchParams` 로 읽어 분기하면 전환할 때마다 RSC 요청이
 * 다시 나가 데이터를 또 가져온다. 그래서 두 레이아웃을 서버에서 한 번씩 렌더해
 * 받아두고 여기서는 표시만 바꾼다 — 뷰 전환에 네트워크 왕복이 전혀 없고,
 * AI 드로어 상태(진행 중인 SSE 포함)도 그대로 유지된다.
 * URL 은 history.pushState 로만 갱신하므로 공유·뒤로가기가 모두 동작한다.
 *
 * 테마는 여기서 건드리지 않는다 — 콘솔 뷰가 자기 서브트리에
 * `data-theme="terminal"` 을 직접 들고 있다 (ConsoleView). 그래야 `?view=console`
 * 딥링크도 서버 첫 HTML 부터 다크로 나오고, 콘솔을 들렀다는 이유로 사용자의
 * 전역 테마가 바뀌지도 않는다.
 */
export function ViewSwitch({
  initialView,
  editorial,
  console: consoleView,
}: {
  initialView: DetailView;
  editorial: React.ReactNode;
  console: React.ReactNode;
}) {
  const [view, setViewState] = useState<DetailView>(initialView);

  /**
   * **한 번이라도 보인 뷰만 마운트한다.**
   *
   * 예전에는 둘 다 무조건 마운트하고 `hidden` 으로 하나를 가렸다. 그런데 두 뷰가
   * 각자 `StockChart` 를 품고 있어서(에디토리얼은 `ChartSection`, 콘솔은
   * `ConsoleChart`) 상세 페이지를 열 때마다 **차트 엔진이 두 개** 만들어졌다 —
   * 최대 504봉에 시리즈 5종, `ResizeObserver` 까지 두 벌인데 그중 하나는 사용자가
   * 끝내 보지 않는다. `StockChart` 주석의 "숨겨진 채로도 마운트된다" 가 그 상태다.
   *
   * 한 번 마운트한 뷰는 **계속 들고 있는다.** 이 컴포넌트가 존재하는 이유가 전환에
   * 네트워크도 상태 손실도 없게 하는 것이라(위 주석), 나갈 때 버리면 되돌아올 때
   * 차트 확대 위치·크로스헤어 같은 것이 초기화된다. 즉 비용을 없애는 게 아니라
   * **쓰지도 않을 것을 미리 치르지 않는** 쪽으로만 바꾼다.
   */
  const [mounted, setMounted] = useState<readonly DetailView[]>([initialView]);

  const show = useCallback((next: DetailView) => {
    setViewState(next);
    setMounted((prev) => (prev.includes(next) ? prev : [...prev, next]));
  }, []);

  const setView = useCallback(
    (next: DetailView) => {
      show(next);
      // 전역 테마는 건드리지 않는다.
      //
      // 전에는 콘솔로 들어갈 때 setTheme("terminal") 을 불렀다. 그러면 (a) 첫
      // 페인트에는 이미 늦어 라이트로 한 프레임 깜빡이고, (b) 콘솔을 한 번
      // 들렀다는 이유로 사용자의 전역 테마 선택이 영구히 다크로 바뀌었다.
      // 지금은 ConsoleView 서브트리가 data-theme="terminal" 을 직접 들고 있어
      // 서버 첫 HTML 부터 올바른 색이고, 나오면 원래 테마가 그대로 남는다.

      const search = new URLSearchParams(window.location.search);
      if (next === "console") search.set("view", "console");
      else search.delete("view");
      const query = search.toString();
      window.history.pushState(
        null,
        "",
        query ? `${window.location.pathname}?${query}` : window.location.pathname,
      );
    },
    [show],
  );

  // 뒤로가기/앞으로가기로 ?view 가 바뀌면 화면도 따라간다.
  // `show` 를 쓰는 것이 중요하다 — 콘솔에 딥링크로 들어왔다가 뒤로 가면 그때
  // 처음 에디토리얼이 필요해지는데, `setViewState` 만 부르면 마운트되지 않아
  // 빈 화면이 남는다.
  useEffect(() => {
    const sync = () => {
      const search = new URLSearchParams(window.location.search);
      show(search.get("view") === "console" ? "console" : "editorial");
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [show]);

  return (
    <ViewContext.Provider value={{ view, setView }}>
      {mounted.includes("editorial") ? (
        <div hidden={view !== "editorial"}>{editorial}</div>
      ) : null}
      {mounted.includes("console") ? (
        <div hidden={view !== "console"}>{consoleView}</div>
      ) : null}
    </ViewContext.Provider>
  );
}

export function useDetailView(): ViewContextValue {
  const context = useContext(ViewContext);
  if (!context) {
    throw new Error("useDetailView must be used inside <ViewSwitch>");
  }
  return context;
}

/**
 * 뷰 토글. 두 뷰의 액션 줄이 각각 렌더한다.
 *
 * 라벨은 테마 토글과 마찬가지로 '무엇으로 바뀌는지'다. 다만 그 둘이 한때 같은
 * 단어를 썼다 — 이쪽은 `CONSOLE`/`EDITORIAL`, 테마는 `TERMINAL`/`EDITORIAL` 이라
 * 나란히 둘 다 `EDITORIAL` 이 되는 순간이 있었다. 테마 쪽 라벨을 밝기 언어
 * (DARK/LIGHT)로 옮겨 어휘를 갈랐고, 글리프도 은유를 나눈다 — 여기는 터미널·기사,
 * 저기는 해·달 (`shared/theme/ThemeToggle` 주석).
 */
export function ViewToggle() {
  const { view, setView } = useDetailView();
  const next: DetailView = view === "console" ? "editorial" : "console";

  return (
    <button
      type="button"
      onClick={() => setView(next)}
      aria-pressed={view === "console"}
      aria-label={next === "console" ? "터미널 콘솔 화면으로" : "에디토리얼 화면으로"}
      title={next === "console" ? "터미널 콘솔로 전환" : "에디토리얼로 전환"}
      // flex-none whitespace-nowrap: 테마 토글과 같은 이유다 (Masthead 주석).
      className="hidden flex-none items-center gap-1.5 whitespace-nowrap border border-line-control px-2.5 py-2 font-mono uppercase tracking-label-tight text-muted-60 hover:border-ink hover:text-ink md:flex text-10"
    >
      <Icon name={next === "console" ? "terminal" : "article"} size={13} />
      {next}
    </button>
  );
}
