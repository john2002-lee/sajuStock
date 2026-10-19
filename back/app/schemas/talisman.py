"""부적 판매 API 의 요청·응답."""

from datetime import datetime

from pydantic import BaseModel, Field


class TalismanOrderRequest(BaseModel):
    talisman_id: str = Field(min_length=1, max_length=32)


class TalismanOrderCreated(BaseModel):
    """결제창을 열기 위한 최소한. 금액과 주문명은 **서버가** 정한다."""

    order_id: str
    amount: int
    order_name: str


class TalismanConfirmRequest(BaseModel):
    """토스가 리다이렉트로 돌려준 값 그대로."""

    payment_key: str = Field(min_length=1, max_length=200)
    order_id: str = Field(min_length=1, max_length=40)
    amount: int = Field(ge=0)


class TalismanPaymentConfirmed(BaseModel):
    #: 원본을 받는 열쇠. 주소를 아는 사람이 곧 산 사람이다.
    access_token: str


class TalismanOrderOut(BaseModel):
    """구매 완료 화면이 그리는 것. 원본 바이트는 싣지 않는다 — 그것은 다운로드 경로다."""

    talisman_id: str
    name: str
    download_expires_at: datetime
    expired: bool
    #: 일회 다운로드를 이미 썼는가.
    downloaded: bool
