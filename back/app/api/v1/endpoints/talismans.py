"""디지털 부적 판매 엔드포인트.

라우터는 파라미터 수신과 서비스 호출만 한다. 결제 규칙은
`services/talisman_order_service` 에 있다.

**이 라우터의 경로 중 원본 바이트에 닿는 것은 `/download` 하나**이고, 그 경로는
결제가 확인된 토큰으로만 열린다. 견본(저해상도 + 워터마크)은 프런트의 `public/` 에
있어 이 서버를 거치지 않는다.
"""

from fastapi import APIRouter, Response

from app.api.deps import TalismanRepo
from app.schemas.talisman import (
    TalismanConfirmRequest,
    TalismanOrderCreated,
    TalismanOrderOut,
    TalismanOrderRequest,
    TalismanPaymentConfirmed,
)
from app.services import talisman_order_service

router = APIRouter(prefix="/talismans", tags=["talisman"])


@router.post("/orders", response_model=TalismanOrderCreated, summary="부적 주문 생성")
async def create_talisman_order(
    payload: TalismanOrderRequest, repo: TalismanRepo
) -> TalismanOrderCreated:
    """결제창을 열기 전에 주문을 만든다. 금액과 주문명은 서버가 정해 돌려준다."""
    return await talisman_order_service.create_order(payload.talisman_id, repo)


@router.post("/payments/confirm", response_model=TalismanPaymentConfirmed, summary="부적 결제 승인")
async def confirm_talisman_payment(
    payload: TalismanConfirmRequest, repo: TalismanRepo
) -> TalismanPaymentConfirmed:
    """토스 승인 → 접근 토큰. 같은 요청이 두 번 와도 두 번 긁지 않는다."""
    return await talisman_order_service.confirm_payment(
        order_id=payload.order_id,
        payment_key=payload.payment_key,
        amount=payload.amount,
        repo=repo,
    )


@router.get("/orders/{token}", response_model=TalismanOrderOut, summary="구매한 부적 정보")
async def read_talisman_order(token: str, repo: TalismanRepo) -> TalismanOrderOut:
    return await talisman_order_service.read_order(token, repo)


@router.get("/orders/{token}/download", summary="구매한 부적 원본 다운로드")
async def download_talisman(token: str, repo: TalismanRepo) -> Response:
    """원본 바이트. 결제 확인 + 다운로드 기간 안일 때만.

    `no-store` — 토큰이 곧 자격 증명이라 중간 캐시에 원본이 남으면 기간이 끝나도
    열린다.
    """
    file = await talisman_order_service.download(token, repo)
    return Response(
        content=file.content,
        media_type=file.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{file.filename}"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
