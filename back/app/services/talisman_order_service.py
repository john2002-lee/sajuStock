"""디지털 부적의 주문·결제·다운로드.

사주 리포트(`saju_order_service`)와 **같은 결제 규칙**을 따른다. 그쪽 모듈 주석이
이유를 길게 적어 두었고, 여기서는 그 규칙을 부적에 옮겨 적을 뿐이다.

1. 금액은 서버가 정하고, 승인 전에 다시 대조한다 — 100원 요청으로 살 수 없게.
2. 이미 `paid` 면 다시 승인하지 않는다 — 새로고침·뒤로가기·토스 재시도.
3. 결과를 모르면(네트워크·5xx·이미 처리됨) 실패로 단정하지 않고 `needs_attention`.

사주와 다른 점은 **전달**이다. 만들 것이 없다 — 원본은 이미 `talisman_assets` 에
있고, 결제가 확인된 토큰으로만 나간다. 그래서 원본이 없는 부적은 **팔지 않는다**:
결제한 뒤에 줄 것이 없는 상태가 이 흐름에서 가장 나쁜 실패다.
"""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.core.exceptions import AppError
from app.domain.talisman.catalog import Talisman, find_talisman
from app.integrations.payment.toss import TossPaymentsProvider
from app.models.talisman import TalismanOrderRow
from app.repositories.saju_order import derive_access_token, hash_access_token, new_order_id
from app.repositories.talisman import TalismanRepository
from app.schemas.talisman import (
    TalismanOrderCreated,
    TalismanOrderOut,
    TalismanPaymentConfirmed,
)

logger = logging.getLogger(__name__)


class TalismanPaymentDisabledError(AppError):
    status_code = 503
    code = "talisman_payment_disabled"
    message = "지금은 부적을 구매할 수 없습니다. 잠시 후 다시 시도해 주세요."


class TalismanNotFoundError(AppError):
    status_code = 404
    code = "talisman_not_found"
    message = "판매하지 않는 부적입니다."


class TalismanAssetMissingError(AppError):
    """원본이 올라와 있지 않다. **우리 쪽 문제**라 503 이다.

    주문 단계에서 나면 팔지 않은 것이고, 다운로드 단계에서 나면 결제는 됐는데 줄 것이
    없는 것이다 — 뒤쪽은 404 로 답하면 "없는 주문" 처럼 읽혀 고객이 포기한다.
    """

    status_code = 503
    code = "talisman_asset_missing"
    message = "부적 원본을 준비하고 있습니다. 잠시 후 다시 시도해 주세요."


class TalismanOrderNotFoundError(AppError):
    status_code = 404
    code = "talisman_order_not_found"
    message = "주문을 찾을 수 없습니다."


class TalismanPaymentNotConfirmedError(AppError):
    status_code = 409
    code = "talisman_payment_not_confirmed"
    message = "결제가 확인되지 않았습니다."


class TalismanPaymentNeedsAttentionError(AppError):
    """결제 상태를 확정할 수 없어 사람이 확인 중이다. **자동으로 환불하지 않는다.**

    문장은 `saju_order_service.PaymentNeedsAttentionError` 와 약관 제6조
    (`front/src/shared/legal/refund.ts` 의 `REFUND_ON_FAILURE`)와 **같아야 한다.**
    """

    status_code = 409
    code = "talisman_payment_needs_attention"
    message = (
        "결제 처리 중 문제가 발생해 담당자가 직접 확인하고 있습니다. "
        "영업일 기준 1일 이내로 결제하신 금액을 전액 환불해 드립니다."
    )


class TalismanAlreadyDownloadedError(AppError):
    """일회 다운로드를 이미 썼다. 410 — 있었지만 이제는 주지 않는다."""

    status_code = 410
    code = "talisman_already_downloaded"
    message = (
        "이미 내려받으신 부적입니다. 한 번만 받으실 수 있어요. "
        "받는 도중 실패했다면 고객센터로 알려 주세요."
    )


class DownloadExpiredError(AppError):
    """다운로드 기간이 지났다. 410 — 있었지만 이제는 주지 않는다."""

    status_code = 410
    code = "talisman_download_expired"
    message = "다운로드 기간이 지났습니다."


@dataclass(frozen=True)
class TalismanFile:
    content: bytes
    media_type: str
    filename: str


def _provider() -> TossPaymentsProvider:
    if not settings.saju_payment_enabled:
        raise TalismanPaymentDisabledError()
    return TossPaymentsProvider(settings.toss_secret_key or "")


def _token_for(order_id: str) -> str:
    return derive_access_token(order_id, settings.saju_access_token_secret or "")


def _talisman(talisman_id: str) -> Talisman:
    talisman = find_talisman(talisman_id)
    if talisman is None:
        raise TalismanNotFoundError()
    return talisman


async def create_order(talisman_id: str, repo: TalismanRepository) -> TalismanOrderCreated:
    """주문을 만든다. 팔 수 없는 상태(키 없음·원본 없음)면 여기서 막는다."""
    if not settings.saju_payment_enabled:
        raise TalismanPaymentDisabledError()

    talisman = _talisman(talisman_id)
    if not await repo.has_asset(talisman.id):
        logger.error("부적 원본이 없어 주문을 거절했습니다 — %s", talisman.id)
        raise TalismanAssetMissingError()

    order_id = new_order_id()
    await repo.create(
        order_id=order_id,
        talisman_id=talisman.id,
        amount=settings.talisman_price,
        access_token_hash=hash_access_token(_token_for(order_id)),
    )
    return TalismanOrderCreated(
        order_id=order_id, amount=settings.talisman_price, order_name=talisman.name
    )


async def confirm_payment(
    *, order_id: str, payment_key: str, amount: int, repo: TalismanRepository
) -> TalismanPaymentConfirmed:
    """토스 승인 → 접근 토큰. 분기 순서는 `saju_order_service.confirm_payment` 와 같다."""
    order = await repo.get(order_id)
    if order is None:
        raise TalismanOrderNotFoundError()
    if order.status == "needs_attention":
        raise TalismanPaymentNeedsAttentionError()
    if order.status == "paid":
        return TalismanPaymentConfirmed(access_token=_token_for(order.id))

    if amount != order.amount:
        logger.warning("부적 결제 금액 불일치 — 주문 %s", order_id)
        raise TalismanPaymentNotConfirmedError("결제 금액이 주문과 다릅니다.")

    result = await _provider().confirm(
        payment_key=payment_key,
        order_id=order_id,
        amount=order.amount,
        idempotency_key=order.idempotency_key,
    )

    if result.ambiguous or result.already_processed:
        reason = "승인 응답 미상" if result.ambiguous else "이미 처리된 결제"
        # `pending` 일 때만 바뀐다. 겹친 다른 승인이 그 사이 `paid` 로 만들었다면
        # 이 미상 결과로 덮지 않는다 — 덮으면 돈을 낸 사람이 원본 대신 환불 안내를 본다.
        if not await repo.mark_needs_attention(order, reason):
            current = await repo.get(order_id)
            if current is not None and current.status == "paid":
                return TalismanPaymentConfirmed(access_token=_token_for(current.id))
        logger.warning("부적 결제 상태 미상 — 주문 %s (%s)", order_id, reason)
        raise TalismanPaymentNeedsAttentionError()

    if not result.paid:
        logger.info("부적 결제 거절 — 주문 %s (status=%s)", order_id, result.status)
        raise TalismanPaymentNotConfirmedError("결제가 완료되지 않았습니다.")

    await repo.mark_paid(order, result.payment_key, datetime.now(UTC))
    return TalismanPaymentConfirmed(access_token=_token_for(order.id))


def _expires_at(order: TalismanOrderRow) -> datetime:
    # `paid` 인데 `paid_at` 이 비어 있는 행은 없어야 한다. 있다면 사람이 상태만 손본
    # 것이고, 그때는 **주문 시각**부터 센다. "지금부터" 세면 열 때마다 기한이 밀려
    # 토큰이 영구 다운로드 링크가 된다.
    paid_at = order.paid_at or order.created_at
    return paid_at + timedelta(days=settings.talisman_download_days)


async def _paid_order(token: str, repo: TalismanRepository) -> TalismanOrderRow:
    order = await repo.get_by_token_hash(hash_access_token(token))
    if order is None:
        raise TalismanOrderNotFoundError()
    if order.status == "needs_attention":
        raise TalismanPaymentNeedsAttentionError()
    if order.status != "paid":
        raise TalismanPaymentNotConfirmedError()
    return order


async def read_order(
    token: str, repo: TalismanRepository, *, now: datetime | None = None
) -> TalismanOrderOut:
    """구매 완료 화면. 기간이 지나도 답한다 — 무엇을 샀고 언제 끝났는지는 보여 준다."""
    order = await _paid_order(token, repo)
    talisman = _talisman(order.talisman_id)
    expires_at = _expires_at(order)
    return TalismanOrderOut(
        talisman_id=talisman.id,
        name=talisman.name,
        download_expires_at=expires_at,
        expired=(now or datetime.now(UTC)) >= expires_at,
        downloaded=order.downloaded_at is not None,
    )


async def download(
    token: str, repo: TalismanRepository, *, now: datetime | None = None
) -> TalismanFile:
    """원본 바이트. **결제 확인 + 기간 안 + 아직 안 받음** 일 때 한 번만 나간다.

    1회분은 **나가기 직전에** 쓴다. 원본이 없거나 기간이 지나 못 준 요청이 1회분을
    써 버리면 고객은 받지도 못하고 기회만 잃는다.
    """
    order = await _paid_order(token, repo)
    if order.downloaded_at is not None:
        raise TalismanAlreadyDownloadedError()
    moment = now or datetime.now(UTC)
    if moment >= _expires_at(order):
        raise DownloadExpiredError()

    asset = await repo.get_asset(order.talisman_id)
    if asset is None:
        logger.error("결제된 부적의 원본이 없습니다 — 주문 %s", order.id)
        raise TalismanAssetMissingError()
    if not await repo.claim_download(order, moment):
        # 겹친 다른 요청이 먼저 가져갔다.
        raise TalismanAlreadyDownloadedError()
    logger.info("부적 원본 다운로드 — 주문 %s", order.id)
    return TalismanFile(content=asset.content, media_type=asset.media_type, filename=asset.filename)
