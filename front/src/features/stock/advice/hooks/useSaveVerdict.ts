"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bff } from "@/lib/http/browser";
import type { Decision } from "../model/types";
import type { VerdictRecord } from "../model/verdict";

export type SaveState = "idle" | "saving" | "saved" | "failed";

/** 저장에 필요한 종목 정보. `Decision` 에는 없어서 호출부가 준다. */
export interface VerdictStock {
  code: string;
  symbol: string;
  name: string;
  /** 판단 시점의 가격. 나중에 "그 뒤 +4.2%" 의 기준선이 된다 */
  price?: number | null;
}

/**
 * 판단이 도착하면 **한 번** 기록한다.
 *
 * ## 왜 프런트가 저장하나
 *
 * 백엔드가 스스로 저장하는 편이 낫지만 `services/advice_stream.py` 가 그것을
 * 비싸게 만든다 — 엔드포인트가 일부러 DB 를 스트림 밖에서 읽고(*"제너레이터
 * 안에서 DB 를 만지면 수십 초 동안 세션이 붙잡힌다"*), 최종 판단이 나가는 출구가
 * 셋이다(정상 4단계 · 예산 만료 착지 · 이미 낸 결론 유지). 근거는 기획 §11-3.
 *
 * ## 한 번만 — 그리고 무엇이 "한 번" 인가
 *
 * `decision` 객체는 렌더마다 같은 참조가 아닐 수 있고, 캐시에서 되살아나면
 * 드로어를 열 때마다 또 온다. 그래서 **`코드 + 판단 생성 시각`** 을 키로 삼는다.
 * 같은 판단을 다시 보는 것은 저장할 일이 아니고, 재분석은 `updatedAt` 이 달라
 * 자연히 다시 저장된다(백엔드가 덮어쓴다).
 *
 * ## 실패해도 화면을 막지 않는다
 *
 * 기록은 **부가 기능**이다. 401(비로그인)·502(백엔드 다운) 어느 쪽이든 판단
 * 자체는 이미 화면에 있다. 다만 조용히 삼키지는 않는다 — 저장됐는지 아닌지를
 * 화면이 말해야 나중에 홈에서 안 보일 때 사용자가 이유를 안다.
 */
export function useSaveVerdict(stock: VerdictStock | null, decision: Decision | null) {
  const [state, setState] = useState<SaveState>("idle");
  const [shareId, setShareId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  /** 이미 저장을 시도한 키. StrictMode 의 이중 실행도 이걸로 막는다. */
  const done = useRef<string | null>(null);

  const key = stock && decision ? `${stock.code}:${decision.updatedAt}` : null;

  useEffect(() => {
    if (!key || !stock || !decision) return;
    if (done.current === key) return;
    done.current = key;

    let alive = true;
    setState("saving");

    bff
      .post<VerdictRecord>("/api/advice/verdicts", {
        code: stock.code,
        symbol: stock.symbol,
        name: stock.name,
        decision: decision.verdict,
        confidence: decision.confidence,
        source: decision.source,
        answer: decision.answer,
        price_at: stock.price ?? null,
        // **`personal` 을 넣지 않는다.** 투자 성향 6축이 들어 있고 사주에서 유래한
        // 값이다 — 백엔드 스키마도 이 필드를 모른다(`schemas/advice_verdict.py`).
        agent_opinions: [],
      })
      .then((row) => {
        if (!alive) return;
        setState("saved");
        setShareId(row?.shareId ?? null);
      })
      .catch(() => {
        if (!alive) return;
        setState("failed");
      });

    return () => {
      alive = false;
    };
  }, [key, stock, decision]);

  /** 공유를 켜고 링크 id 를 받는다. 두 번 눌러도 같은 id 다. */
  const share = useCallback(async () => {
    if (!stock || shareId || sharing) return;
    setSharing(true);
    try {
      const row = await bff.post<VerdictRecord>(
        `/api/advice/verdicts/${encodeURIComponent(stock.code)}/share`,
        {},
      );
      setShareId(row?.shareId ?? null);
    } catch {
      // 실패는 버튼이 그대로 남는 것으로 드러난다. 판단 화면에 오류 상자를
      // 하나 더 띄우면 정작 판단이 밀린다.
    } finally {
      setSharing(false);
    }
  }, [stock, shareId, sharing]);

  return { state, shareId, share, sharing };
}
