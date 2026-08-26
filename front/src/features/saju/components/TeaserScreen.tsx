"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { bff } from "@/lib/http/browser";
import type { PaymentConfig } from "../model/types";
import { useStoredReading } from "../model/storage";
import { StartOverPrompt, TeaserView } from "./TeaserView";

/**
 * 티저 화면 — sessionStorage 에서 결과를 꺼내 그린다.
 *
 * `undefined`(아직 모름)와 `null`(없음)을 구분한다. 하나로 뭉치면 첫 페인트에
 * "다시 입력하기" 가 한 번 번쩍인 뒤 결과가 나타난다 — 자세한 이유는
 * `model/storage.ts` 의 `useStoredReading` 주석에 있다.
 *
 * 결제 설정은 **서버에 물어본다.** 키가 없으면 결제 UI 를 그리지 않고 무료로 연다 —
 * 팔 수 없는 상태에서 결제 버튼을 보여 주면 눌러 본 사람이 결제창에서 실패한다.
 */
export function TeaserScreen() {
  const router = useRouter();
  const stored = useStoredReading();
  const [payment, setPayment] = useState<PaymentConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    bff
      .get<PaymentConfig>("/api/saju/payment-config")
      .then((data) => {
        if (!cancelled && data) setPayment(data);
      })
      .catch(() => {
        // 못 받으면 `null` 로 남는다 — 결제 UI 없이 무료 경로가 그려진다.
        // 결제 가능한데 못 파는 것이, 팔 수 없는데 버튼을 보여 주는 것보다 낫다.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (stored === undefined) return null;
  if (stored === null) return <StartOverPrompt />;

  return (
    <TeaserView
      reading={stored.reading}
      birth={stored.birth}
      payment={payment}
      onOpenReport={() => router.push("/saju/report")}
    />
  );
}
