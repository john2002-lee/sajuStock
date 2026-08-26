"use client";

import { useCallback, useState, useTransition } from "react";
import { bff } from "@/lib/http/browser";
import { toWatchlist, type WireWatchlist } from "../services/wire";
import type { AlertRule, Holding, Watchlist } from "../model/types";

/**
 * 관심종목 변경을 서버에 반영한다.
 *
 * ## 왜 낙관적 업데이트가 아닌가
 *
 * 변경 API 는 전부 **목록 전체**를 돌려준다(백엔드 엔드포인트 주석). 그래서 응답을
 * 그대로 상태에 넣으면 화면과 서버가 항상 같다 — 그룹 집계·알림 수·평가손익 같은
 * 파생값을 클라이언트가 다시 계산할 필요가 없고, 계산이 어긋날 여지도 없다.
 *
 * 순서 변경만 예외다. 드래그는 손가락을 떼는 순간 결과가 보여야 하므로 화면을 먼저
 * 바꾸고 요청을 보낸다. 실패하면 서버가 준 마지막 목록으로 되돌린다.
 *
 * ## 왜 React Query 가 아닌가
 *
 * advice 와 달리 여기는 **캐시할 이유가 없다.** 관심종목은 사용자가 방금 바꾼 것을
 * 즉시 봐야 하는 화면이고, 서버 컴포넌트가 이미 첫 목록을 실어 보낸다. 캐시를 끼우면
 * "방금 담았는데 목록에 없다"는 창을 만들 뿐이다.
 */
export interface WatchlistMutations {
  /** 서버가 마지막으로 확인해 준 목록 */
  watchlist: Watchlist;
  pending: boolean;
  error: string | null;
  add: (symbol: string, group?: string) => void;
  remove: (code: string) => void;
  /** 선택 삭제. 한 건씩 부르는 것과 결과가 다르다 — 아래 구현 주석 참고 */
  removeMany: (codes: string[]) => void;
  reorder: (codes: string[], optimistic: Watchlist) => void;
  patch: (
    code: string,
    patch: { group?: string; alert?: AlertRule; holding?: Holding | null },
  ) => void;
}

interface Request {
  path: string;
  method: "POST" | "DELETE" | "PUT" | "PATCH";
  body?: unknown;
}

/**
 * 변경 API 는 넷 다 **목록 전체**를 돌려준다(위 주석). 메서드만 다르고 나머지가
 * 같으므로 여기서 한 번에 고른다.
 */
const SEND: Record<
  Request["method"],
  (path: string, body?: unknown) => Promise<WireWatchlist | null>
> = {
  POST: (path, body) => bff.post<WireWatchlist>(path, body),
  PUT: (path, body) => bff.put<WireWatchlist>(path, body),
  PATCH: (path, body) => bff.patch<WireWatchlist>(path, body),
  DELETE: (path) => bff.delete<WireWatchlist>(path),
};

export function useWatchlistMutations(initial: Watchlist): WatchlistMutations {
  const [watchlist, setWatchlist] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // 낙관적 갱신을 되돌릴 기준점. 서버가 확인해 준 마지막 목록이다.
  const [confirmed, setConfirmed] = useState(initial);

  const send = useCallback(
    ({ path, method, body }: Request, rollbackTo?: Watchlist) => {
      setError(null);
      startTransition(async () => {
        try {
          // 실패 몸통(`{ error: "..." }`)을 풀어 ApiError 로 던지는 일은 클라이언트가
          // 한다 — 브라우저에서 BFF 를 부르는 모든 곳이 같은 실패 계약을 쓴다
          // (`lib/http/browser.ts`).
          const wire = await SEND[method](path, body);
          if (!wire) throw new Error("변경을 저장하지 못했습니다.");

          const next = toWatchlist(wire);
          setWatchlist(next);
          setConfirmed(next);
        } catch (cause) {
          // 되돌린다. 화면이 저장된 것처럼 남아 있으면 새로고침 한 번에 사라져
          // 사용자는 자기가 무엇을 잃었는지도 모른다.
          if (rollbackTo) setWatchlist(rollbackTo);
          setError(cause instanceof Error ? cause.message : "변경을 저장하지 못했습니다.");
        }
      });
    },
    [],
  );

  const add = useCallback(
    (symbol: string, group?: string) =>
      send({ path: "/api/watchlist", method: "POST", body: { symbol, group } }),
    [send],
  );

  const remove = useCallback(
    (code: string) => send({ path: `/api/watchlist/${code}`, method: "DELETE" }),
    [send],
  );

  /**
   * 여러 건을 **순서대로** 지운다.
   *
   * 호출부가 `remove()` 를 루프로 돌리면 요청 N 개가 동시에 나가는데, 각 응답이
   * 자기 시점의 **목록 전체**를 싣고 온다. 그러면 화면에 남는 것은 "마지막으로
   * 도착한 응답" 이지 "전부 지운 뒤의 목록" 이 아니다 — 세 개를 지웠는데 두 개가
   * 남아 보이는 창이 실제로 생긴다. 순차로 돌면 마지막 응답이 곧 최종 상태다.
   *
   * 백엔드에 일괄 삭제 엔드포인트가 생기면 이 함수만 그쪽으로 바꾼다.
   */
  const removeMany = useCallback((codes: string[]) => {
    if (codes.length === 0) return;
    setError(null);
    startTransition(async () => {
      let latest: Watchlist | null = null;
      try {
        for (const code of codes) {
          const wire = await bff.delete<WireWatchlist>(`/api/watchlist/${code}`);
          if (wire) latest = toWatchlist(wire);
        }
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "삭제하지 못했습니다.",
        );
      } finally {
        // 중간에 실패해도 **거기까지 지워진 것은 반영한다.** 실패했다고 옛 목록을
        // 그대로 두면, 이미 서버에서 사라진 종목이 화면에 남아 다시 지우려다
        // 404 를 만난다.
        if (latest) {
          setWatchlist(latest);
          setConfirmed(latest);
        }
      }
    });
  }, []);

  const reorder = useCallback(
    (codes: string[], optimistic: Watchlist) => {
      setWatchlist(optimistic);
      send({ path: "/api/watchlist/order", method: "PUT", body: { codes } }, confirmed);
    },
    [send, confirmed],
  );

  const patch = useCallback(
    (
      code: string,
      body: { group?: string; alert?: AlertRule; holding?: Holding | null },
    ) => {
      // 보내지 않은 키는 본문에 넣지 않는다 — 백엔드가 `model_fields_set` 으로
      // "미전송"과 "명시적 null"을 구분하므로, 여기서 undefined 를 채워 보내면
      // 그룹만 바꾸려는 요청이 보유 정보를 지운다.
      const payload: Record<string, unknown> = {};
      if (body.group !== undefined) payload.group = body.group;
      if (body.alert !== undefined) {
        payload.alert = { enabled: body.alert.enabled, condition: body.alert.condition };
      }
      if (body.holding !== undefined) {
        payload.holding = body.holding
          ? { quantity: body.holding.quantity, avg_price: body.holding.avgPrice }
          : null;
      }

      send({ path: `/api/watchlist/${code}`, method: "PATCH", body: payload });
    },
    [send],
  );

  return { watchlist, pending, error, add, remove, removeMany, reorder, patch };
}
