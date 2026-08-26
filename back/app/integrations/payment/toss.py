"""토스페이먼츠 연동. 원본 `SajuService/src/lib/payment/toss.ts` 를 옮긴 것이다.

## 이 모듈이 절대 하지 않는 것: 모르는 것을 실패라고 말하기

결제는 **세 가지 결과**가 있다. 성공, 실패, 그리고 **모름**. 네트워크가 끊기거나
타임아웃이 나거나 5xx 가 오면 결제가 됐는지 안 됐는지 알 수 없고, 실제로는 성공한
경우가 있다. 그것을 실패로 보고하면 **돈을 낸 고객이 아무것도 못 받는다.**

그래서 `ambiguous` 가 별도 필드로 있고, 호출자는 그때 주문을 `needs_attention` 으로
두고 사람이 대조한다. 같은 이유로 환불 메서드가 없다(패키지 주석).
"""

import base64
import logging
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_TOSS_API_BASE = "https://api.tosspayments.com/v1/payments"

#: 이미 처리된 결제에 confirm 을 다시 보냈을 때 토스가 주는 코드. **실패가 아니다.**
_ALREADY_PROCESSED_CODE = "ALREADY_PROCESSED_PAYMENT"

#: 토스가 권위 있는 값을 주지 못했을 때만 쓰는 표시용 기본값(네트워크 오류 등).
#: 토스가 실제 값을 주면 언제나 그쪽이 이긴다.
_FALLBACK_CURRENCY = "KRW"


@dataclass(frozen=True)
class PaymentResult:
    order_id: str
    #: HTTP 가 성공했고 **동시에** 토스가 status "DONE" 을 보고했을 때만 True.
    paid: bool
    amount: int
    currency: str
    payment_key: str
    status: str
    #: 재시도된 confirm 을 토스가 "이미 처리됨" 으로 답했다. 실패가 아니다 —
    #: 호출자는 `query()` 로 대조해야 한다.
    already_processed: bool
    #: 실제 상태를 알 수 없다(네트워크·타임아웃·5xx). 성공했을 수도 있다.
    ambiguous: bool


def _ambiguous(order_id: str, payment_key: str, amount: int) -> PaymentResult:
    return PaymentResult(
        order_id=order_id,
        paid=False,
        amount=amount,
        currency=_FALLBACK_CURRENCY,
        payment_key=payment_key,
        status="UNKNOWN",
        already_processed=False,
        ambiguous=True,
    )


class TossPaymentsProvider:
    """토스 결제 연동. 시크릿 키는 Basic 인증의 **아이디** 자리에 들어가고 비밀번호는 빈 값이다."""

    def __init__(self, secret_key: str, timeout_seconds: float = 15.0) -> None:
        token = base64.b64encode(f"{secret_key}:".encode()).decode()
        self._auth_header = f"Basic {token}"
        self._timeout = timeout_seconds

    async def confirm(
        self, *, payment_key: str, order_id: str, amount: int, idempotency_key: str
    ) -> PaymentResult:
        """결제를 승인한다.

        `idempotency_key` 는 **호출자가 준다** — 주문에서 파생돼 재시도해도 같은 값이라,
        같은 승인이 두 번 일어나지 않는다. 이 모듈이 스스로 만들지 않는다.
        """
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    f"{_TOSS_API_BASE}/confirm",
                    headers={
                        "Authorization": self._auth_header,
                        "Content-Type": "application/json",
                        "Idempotency-Key": idempotency_key,
                    },
                    json={"paymentKey": payment_key, "orderId": order_id, "amount": amount},
                )
        except httpx.HTTPError:
            # 네트워크 오류·타임아웃: 실제 상태를 모른다. 성공했을 수도 있다.
            logger.warning("토스 승인 요청이 응답을 받지 못했습니다 — 상태 미상으로 둡니다")
            return _ambiguous(order_id, payment_key, amount)

        return _interpret(response, order_id, payment_key, amount)

    async def query(self, payment_key: str) -> PaymentResult:
        """결제의 현재 상태를 다시 물어본다. `ambiguous` 를 사람이 대조할 때 쓴다."""
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(
                    f"{_TOSS_API_BASE}/{payment_key}",
                    headers={"Authorization": self._auth_header},
                )
        except httpx.HTTPError:
            return _ambiguous("", payment_key, 0)

        return _interpret(response, "", payment_key, 0)


def _interpret(
    response: httpx.Response,
    fallback_order_id: str,
    fallback_payment_key: str,
    fallback_amount: int,
) -> PaymentResult:
    """토스 응답을 결과로 옮긴다.

    기본값은 **토스가 자기 값을 주지 못한 자리에서만** 쓰인다(오류 응답에는 금액·통화가
    없고, 네트워크 실패에는 본문 자체가 없다). 토스가 값을 주면 언제나 그쪽이 이긴다.
    """
    try:
        body: Any = response.json()
    except ValueError:
        # 본문이 JSON 이 아니다 — 어느 쪽으로도 단정할 수 없다.
        return _ambiguous(fallback_order_id, fallback_payment_key, fallback_amount)

    if response.is_success:
        status = body.get("status") if isinstance(body, dict) else None
        status = status if isinstance(status, str) else "UNKNOWN"
        return PaymentResult(
            order_id=_str_or(body, "orderId", fallback_order_id),
            paid=status == "DONE",
            amount=_int_or(body, "totalAmount", fallback_amount),
            currency=_str_or(body, "currency", _FALLBACK_CURRENCY),
            payment_key=_str_or(body, "paymentKey", fallback_payment_key),
            status=status,
            already_processed=False,
            ambiguous=False,
        )

    code = body.get("code") if isinstance(body, dict) else None
    if code == _ALREADY_PROCESSED_CODE:
        # 재시도가 이미 처리된 결제를 만났다. 실패가 아니므로 `query()` 로 대조한다.
        return PaymentResult(
            order_id=fallback_order_id,
            paid=False,
            amount=fallback_amount,
            currency=_FALLBACK_CURRENCY,
            payment_key=fallback_payment_key,
            status=_ALREADY_PROCESSED_CODE,
            already_processed=True,
            ambiguous=False,
        )

    # 5xx 는 우리 쪽 문제도 토스 쪽 문제도 될 수 있고, 어느 쪽이든 **결제가 됐는지
    # 알 수 없다.** 4xx 만 확정적인 거절로 본다.
    if response.status_code >= 500:
        return _ambiguous(fallback_order_id, fallback_payment_key, fallback_amount)

    return PaymentResult(
        order_id=fallback_order_id,
        paid=False,
        amount=fallback_amount,
        currency=_FALLBACK_CURRENCY,
        payment_key=fallback_payment_key,
        status=str(code) if code else f"HTTP_{response.status_code}",
        already_processed=False,
        ambiguous=False,
    )


def _str_or(body: Any, key: str, fallback: str) -> str:
    value = body.get(key) if isinstance(body, dict) else None
    return value if isinstance(value, str) else fallback


def _int_or(body: Any, key: str, fallback: int) -> int:
    value = body.get(key) if isinstance(body, dict) else None
    return value if isinstance(value, int) else fallback
