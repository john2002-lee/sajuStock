/**
 * 결제 흐름의 순수 계산. 컴포넌트는 테스트할 수 없으므로(node --test, DOM 없음)
 * 판단은 전부 여기에 둔다.
 */

export interface ConfirmRequest {
  payment_key: string;
  order_id: string;
  amount: number;
}

/**
 * 토스가 성공 리다이렉트에 실어 준 값을 승인 요청으로 옮긴다. 하나라도 이상하면
 * `null` — 승인을 보내지 않는다. 금액은 서버가 다시 대조하지만, 숫자가 아닌 값을
 * 보내 409 를 받는 것보다 여기서 멈추는 편이 화면이 정직하다.
 */
export function parseConfirmParams(params: URLSearchParams): ConfirmRequest | null {
  const paymentKey = params.get("paymentKey");
  const orderId = params.get("orderId");
  const rawAmount = params.get("amount");
  if (!paymentKey || !orderId || !rawAmount || !/^\d+$/.test(rawAmount)) return null;
  return { payment_key: paymentKey, order_id: orderId, amount: Number(rawAmount) };
}

/** 구매 완료 화면. 토큰이 곧 자격 증명이다. */
export function orderPath(token: string): string {
  return `/talisman/orders/${encodeURIComponent(token)}`;
}

/** 원본을 내려받는 BFF 경로. 결제가 확인된 토큰으로만 열린다. */
export function downloadPath(token: string): string {
  return `/api/talismans/orders/${encodeURIComponent(token)}/download`;
}

/**
 * `Content-Disposition` 에서 저장할 파일 이름을 꺼낸다. 이름이 없거나 경로 문자가
 * 섞여 있으면 `fallback` — 브라우저가 거르긴 하지만 여기서 먼저 막는다.
 */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  const match = header?.match(/filename="([^"]+)"/);
  const name = match?.[1];
  if (!name || /[\\/]|\.\./.test(name)) return fallback;
  return name;
}

const KST = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "2026년 10월 27일 12:00" — 기기 시간대와 무관하게 한국 시간으로. */
export function formatKstDateTime(iso: string): string {
  const parts = Object.fromEntries(
    KST.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}년 ${parts.month}월 ${parts.day}일 ${parts.hour}:${parts.minute}`;
}
