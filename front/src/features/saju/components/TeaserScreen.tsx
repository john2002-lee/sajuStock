"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { bff } from "@/lib/http/browser";
import { SAJU_EVENT } from "@/shared/analytics/events";
import type { PaymentConfig } from "../model/types";
import { useStoredReading } from "../model/storage";
import { trackSaju } from "../model/analytics";
import { markTime, setReportTier } from "../model/analytics-context";
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
 *
 * ## 계측: 왜 마운트가 아니라 "결제 설정이 정해진 뒤" 인가
 *
 * `saju_teaser_viewed` 는 매출 퍼널의 분모다. 마운트 직후에 쏘면 결제 설정이 아직
 * `null` 이라 가격도 등급도 비어 나가고, 그 값들은 **이 이벤트에서만** 얻을 수 있다
 * (그 뒤로는 `report_tier` 가 상속 컨텍스트로 따라다닌다). 화면이 최종 모습을
 * 갖춘 시점이 곧 사람이 "살지 말지" 를 보기 시작하는 시점이기도 하다.
 */
export function TeaserScreen() {
  const router = useRouter();
  const stored = useStoredReading();
  const [payment, setPayment] = useState<PaymentConfig | null>(null);
  /** 결제 설정 조회가 끝났는가 — 성공이든 실패든. `payment === null` 과 다르다. */
  const [paymentSettled, setPaymentSettled] = useState(false);
  const teaserTracked = useRef(false);

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
      })
      .finally(() => {
        if (!cancelled) setPaymentSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // 저장된 결과가 없으면 티저가 아니라 "다시 입력하기" 가 그려진다 — 그건
    // 본 것이 아니므로 세지 않는다.
    if (teaserTracked.current || !stored || !paymentSettled) return;
    teaserTracked.current = true;

    setReportTier(payment?.enabled ? "paid" : "free");
    markTime("teaser_viewed");
    trackSaju(SAJU_EVENT.teaserViewed, {
      // 설정을 못 받았으면 가격을 **모르는** 것이지 0원이 아니다.
      price_krw: payment?.price ?? null,
      retention_days: payment?.retention_days ?? null,
      is_payment_enabled: Boolean(payment?.enabled),
    });
  }, [stored, paymentSettled, payment]);

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
