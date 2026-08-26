"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * 최근 검색 종목 코드. localStorage 에만 있고 서버로 가지 않는다.
 *
 * features/search 안이 아니라 store/ 에 둔 이유: 관심종목처럼 여러 화면이 참조할
 * 여지가 있고, 무엇보다 zustand persist 를 쓰는 저장소를 한 곳에 모아 두면
 * 저장 키와 마이그레이션을 한눈에 볼 수 있다.
 */

const STORAGE_KEY = "ledger.recentSearches";
const MAX = 5;

interface RecentSearchState {
  codes: string[];
  /**
   * 코드 → 종목명. **`codes` 와 따로 두는 것이 의도다.**
   *
   * 검색 팔레트는 코드만 있으면 된다 — 자동완성 BFF 에 `recent` 로 넘겨 이름·시세를
   * 받아 오기 때문이다(`useSuggestions`). 하지만 홈의 '최근 본 종목' 은 요청 없이
   * 바로 그려야 해서 이름이 손에 있어야 한다. 담을 때 이미 알고 있는 값이라 같이
   * 적어 둔다.
   *
   * 필드를 더하는 방식이라 **기존 저장 값이 깨지지 않는다.** zustand persist 는
   * 저장된 것을 초기 상태에 얕게 덮으므로, `names` 가 없던 값은 `{}` 가 된다 —
   * 그때는 화면이 코드를 그대로 보여준다.
   */
  names: Record<string, string>;
  /** 맨 앞으로 올리고 중복은 제거한다. 최대 MAX 개. */
  push: (code: string, name?: string) => void;
  /**
   * 나중에 알아낸 이름을 채워 넣는다.
   *
   * `names` 를 도입하기 **전에** 담긴 코드는 이름이 없다. 화면이 코드로 대신 그리면
   * "005930 005930" 처럼 같은 값이 두 번 나오는데, 그건 폴백이 아니라 고장으로 보인다.
   * 그래서 홈이 자동완성 BFF 로 한 번 물어보고 그 결과를 여기 적어 둔다 — 다음부터는
   * 요청이 없다.
   */
  learnNames: (found: Record<string, string>) => void;
  clear: () => void;
}

/**
 * 목록에 남아 있는 코드의 이름만 남긴다.
 *
 * 밀려난 코드까지 들고 있으면 이 맵만 무한정 자란다 — 5개 목록인데 이름은 수백 개인
 * 상태가 된다. `names` 가 없던 저장 값을 만나도 안전하도록 `?? {}` 를 둔다.
 */
function prune(
  names: Record<string, string> | undefined,
  codes: string[],
): Record<string, string> {
  const kept = new Set(codes);
  const next: Record<string, string> = {};
  for (const [code, name] of Object.entries(names ?? {})) {
    if (kept.has(code)) next[code] = name;
  }
  return next;
}

export const useRecentSearchStore = create<RecentSearchState>()(
  persist(
    (set, get) => ({
      codes: [],
      names: {},
      push: (code, name) => {
        const codes = [code, ...get().codes.filter((c) => c !== code)].slice(0, MAX);
        set({
          codes,
          names: prune({ ...get().names, ...(name ? { [code]: name } : {}) }, codes),
        });
      },
      learnNames: (found) => {
        const { codes } = get();
        set({ names: prune({ ...get().names, ...found }, codes) });
      },
      clear: () => set({ codes: [], names: {} }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ codes: state.codes, names: state.names }),
    },
  ),
);
