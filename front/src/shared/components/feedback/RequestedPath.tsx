"use client";

import { useSyncExternalStore } from "react";

/**
 * 404 화면에 "무엇을 요청했는지"를 되돌려 보여주는 한 줄.
 *
 * 왜 클라이언트인가 — not-found.tsx 는 매칭되지 않은 URL 전부를 받지만, 정작
 * 그 URL 을 서버에서 알 방법이 없다. `headers()` 로 읽으면 화면 전체가 동적
 * 렌더로 바뀌고(모든 404 가 매 요청 렌더), `usePathname()` 은 프리렌더 시점의
 * `/_not-found` 를 HTML 에 굽고 하이드레이션에서 실제 경로로 바뀌어 불일치가 난다.
 *
 * 그래서 주소창을 외부 스토어로 보고 `useSyncExternalStore` 로 구독한다.
 * 서버 스냅샷은 null 이라 서버 HTML 과 하이드레이션 첫 렌더가 같은 플레이스홀더를
 * 내고, 그 뒤 클라이언트 스냅샷으로 교체된다 — 404 페이지는 정적으로 남고
 * 불일치도 없다. (SSR 원칙: 이 조각 하나만 'use client', 나머지는 서버 컴포넌트다.)
 */

/** 클라이언트 라우팅으로 주소가 바뀌면 다시 읽는다 (뒤로/앞으로 가기) */
function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

/** 문자열은 값 비교라 매번 새로 만들어도 재렌더를 유발하지 않는다 */
function getSnapshot(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/** 서버에는 주소가 없다 — 없다고 말하는 것이 맞다 */
function getServerSnapshot(): null {
  return null;
}

export function RequestedPath() {
  const path = useSyncExternalStore<string | null>(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return (
    <p
      // 마운트 전후로 높이가 같아야 한다 — 값이 늦게 들어오며 아래 내용이 밀리면
      // 그것대로 고장처럼 보인다.
      className="flex min-h-[38px] items-center gap-2.5 border border-line-28 bg-field px-3 py-2"
    >
      <span
        aria-hidden
        className="flex-none font-mono uppercase tracking-label text-muted-45 text-10"
      >
        path
      </span>
      <span className="sr-only">요청한 주소</span>
      {path === null ? (
        <span className="num text-muted-35 text-13">
          확인 중…
        </span>
      ) : (
        // 긴 경로는 잘라내지 않고 접는다 — 어디서 틀렸는지 보려고 있는 줄이다.
        <span
          className="num min-w-0 break-all text-ink text-13"
        >
          {path}
        </span>
      )}
    </p>
  );
}
