"""부적 판매 — 주문·승인·다운로드의 계약 테스트.

사주 리포트 결제(`test_saju_orders.py`)와 같은 방식이다: 저장소와 토스를 가짜로 두고
**분기**를 본다. 이 파일이 지키는 약속은 셋이다.

1. 돈을 받기 전에는 원본 바이트에 닿는 경로가 없다.
2. 같은 결제를 두 번 긁지 않고, 모르는 결과를 실패로 단정하지 않는다.
3. 원본이 올라와 있지 않은 부적은 팔지 않는다 — 받을 수 없는 것을 팔면 안 된다.
"""

import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.core.config import settings
from app.domain.talisman.catalog import TALISMANS, find_talisman
from app.integrations.payment.toss import PaymentResult
from app.services import talisman_order_service
from app.services.talisman_order_service import (
    DownloadExpiredError,
    TalismanAlreadyDownloadedError,
    TalismanAssetMissingError,
    TalismanNotFoundError,
    TalismanOrderNotFoundError,
    TalismanPaymentDisabledError,
    TalismanPaymentNeedsAttentionError,
    TalismanPaymentNotConfirmedError,
    confirm_payment,
    create_order,
    download,
    read_order,
)

PAID_AT = datetime(2026, 10, 20, 3, 0, tzinfo=UTC)


@dataclass
class FakeOrder:
    id: str = "order-1"
    talisman_id: str = "jinheung"
    amount: int = 3000
    status: str = "pending"
    idempotency_key: str = "idem-1"
    payment_key: str | None = None
    attention_reason: str | None = None
    paid_at: datetime | None = None
    created_at: datetime = PAID_AT
    downloaded_at: datetime | None = None


@dataclass
class FakeAsset:
    talisman_id: str
    content: bytes
    media_type: str = "image/png"
    filename: str = "jinheung.png"


class FakeRepo:
    def __init__(self, order: FakeOrder | None = None, assets: dict[str, FakeAsset] | None = None):
        self.order = order
        self.assets = (
            assets
            if assets is not None
            else {
                t.id: FakeAsset(t.id, f"PNG-{t.id}".encode(), filename=f"{t.id}.png")
                for t in TALISMANS
            }
        )
        self.created: list[dict] = []
        self.marked_paid = 0
        self.attention: list[str] = []
        self.token_hashes: list[str] = []

    async def create(self, *, order_id, talisman_id, amount, access_token_hash):
        self.created.append({"order_id": order_id, "talisman_id": talisman_id, "amount": amount})
        self.order = FakeOrder(id=order_id, talisman_id=talisman_id, amount=amount)
        return self.order

    async def get(self, order_id):
        return self.order if self.order and self.order.id == order_id else None

    async def get_by_token_hash(self, token_hash):
        self.token_hashes.append(token_hash)
        return self.order

    async def mark_paid(self, order, payment_key, paid_at):
        self.marked_paid += 1
        order.status, order.payment_key, order.paid_at = "paid", payment_key, paid_at
        return order

    async def mark_needs_attention(self, order, reason):
        """실제 저장소처럼 **`pending` 일 때만** 바꾼다. 바꿨는지를 돌려준다."""
        if order.status != "pending":
            return False
        self.attention.append(reason)
        order.status = "needs_attention"
        return True

    async def claim_download(self, order, now):
        """실제 저장소처럼 **아직 안 받은 결제 주문만** 표시한다. 표시했는지를 돌려준다."""
        if order.status != "paid" or order.downloaded_at is not None:
            return False
        order.downloaded_at = now
        return True

    async def has_asset(self, talisman_id):
        return talisman_id in self.assets

    async def get_asset(self, talisman_id):
        return self.assets.get(talisman_id)


class FakeProvider:
    def __init__(self, result: PaymentResult):
        self.result = result
        self.calls: list[dict] = []

    async def confirm(self, **kwargs):
        self.calls.append(kwargs)
        return self.result


def toss_result(**overrides) -> PaymentResult:
    base = {
        "order_id": "order-1",
        "paid": True,
        "amount": 3000,
        "currency": "KRW",
        "payment_key": "pk-1",
        "status": "DONE",
        "already_processed": False,
        "ambiguous": False,
    }
    return PaymentResult(**{**base, **overrides})


@pytest.fixture(autouse=True)
def selling(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "toss_secret_key", "test_sk_x", raising=False)
    monkeypatch.setattr(settings, "saju_access_token_secret", "s3cret", raising=False)


def use_provider(monkeypatch, provider: FakeProvider) -> None:
    monkeypatch.setattr(talisman_order_service, "_provider", lambda: provider)


# ---------------------------------------------------------------------------


class TestCatalog:
    def test_three_talismans_in_display_order(self):
        assert [t.id for t in TALISMANS] == ["jinheung", "heukgeum", "silver"]
        assert [t.name for t in TALISMANS] == ["진흥부적", "흑금수호인장", "실버수호창"]

    def test_unknown_id_is_none(self):
        assert find_talisman("jinheung") is TALISMANS[0]
        assert find_talisman("../etc/passwd") is None

    def test_price_is_set_by_code(self):
        assert settings.talisman_price == 3000


_FRONT = Path(__file__).resolve().parents[2] / "front" / "src"


class TestFrontAgrees:
    """화면이 적는 값과 서버가 받는 값이 같은가.

    가격과 상품명은 서버가 정하지만 화면에도 적혀 있다(약관·카드). 한쪽만 고치면
    화면은 3,000원이라 적고 결제창은 다른 금액을 열거나, 카드 명세서의 이름이
    사이트에 없게 된다. 프런트 파일을 직접 읽어 대조한다.
    """

    def test_display_price_and_days_match(self):
        legal = (_FRONT / "shared" / "legal" / "talisman.ts").read_text(encoding="utf-8")
        assert f"TALISMAN_PRICE = {settings.talisman_price};" in legal
        assert f"TALISMAN_DOWNLOAD_DAYS = {settings.talisman_download_days};" in legal

    def test_needs_attention_sentence_matches_the_terms(self):
        """화면이 띄우는 환불 약속은 약관 제6조(`REFUND_ON_FAILURE`)와 같은 문장이어야 한다."""
        refund = (_FRONT / "shared" / "legal" / "refund.ts").read_text(encoding="utf-8")
        promise = TalismanPaymentNeedsAttentionError.message.split(". ", 1)[1]
        assert f'"{promise}"' in refund

    def test_names_match_the_toss_order_names(self):
        legal = (_FRONT / "shared" / "legal" / "talisman.ts").read_text(encoding="utf-8")
        for t in TALISMANS:
            pattern = rf'id:\s*"{re.escape(t.id)}",\s*name:\s*"{re.escape(t.name)}",'
            assert re.search(pattern, legal), t.id


class TestCreateOrder:
    async def test_server_sets_the_amount_and_order_name(self):
        repo = FakeRepo()
        created = await create_order("heukgeum", repo)

        assert created.amount == 3000
        assert created.order_name == "흑금수호인장"
        assert repo.created == [
            {"order_id": created.order_id, "talisman_id": "heukgeum", "amount": 3000}
        ]

    async def test_unknown_talisman_is_refused(self):
        repo = FakeRepo()
        with pytest.raises(TalismanNotFoundError):
            await create_order("gold", repo)
        assert repo.created == []

    async def test_does_not_sell_what_it_cannot_deliver(self):
        """원본이 올라와 있지 않으면 주문을 만들지 않는다 — 결제 뒤에 줄 것이 없다."""
        repo = FakeRepo(assets={})
        with pytest.raises(TalismanAssetMissingError):
            await create_order("silver", repo)
        assert repo.created == []

    async def test_closed_when_payment_is_not_configured(self, monkeypatch):
        monkeypatch.setattr(settings, "toss_secret_key", None, raising=False)
        with pytest.raises(TalismanPaymentDisabledError):
            await create_order("jinheung", FakeRepo())


class TestConfirmPayment:
    async def test_amount_mismatch_never_reaches_toss(self, monkeypatch):
        repo = FakeRepo(FakeOrder())
        provider = FakeProvider(toss_result())
        use_provider(monkeypatch, provider)

        with pytest.raises(TalismanPaymentNotConfirmedError):
            await confirm_payment(order_id="order-1", payment_key="pk", amount=100, repo=repo)

        assert provider.calls == []
        assert repo.marked_paid == 0

    async def test_confirms_with_server_amount_and_order_idempotency_key(self, monkeypatch):
        repo = FakeRepo(FakeOrder())
        provider = FakeProvider(toss_result())
        use_provider(monkeypatch, provider)

        confirmed = await confirm_payment(
            order_id="order-1", payment_key="pk-1", amount=3000, repo=repo
        )

        assert provider.calls == [
            {
                "payment_key": "pk-1",
                "order_id": "order-1",
                "amount": 3000,
                "idempotency_key": "idem-1",
            }
        ]
        assert repo.marked_paid == 1
        assert repo.order.status == "paid"
        assert repo.order.paid_at is not None
        assert confirmed.access_token

    async def test_already_paid_is_not_charged_again(self, monkeypatch):
        repo = FakeRepo(FakeOrder(status="paid", payment_key="pk-1", paid_at=PAID_AT))
        provider = FakeProvider(toss_result())
        use_provider(monkeypatch, provider)

        first = await confirm_payment(
            order_id="order-1", payment_key="pk-1", amount=3000, repo=repo
        )
        second = await confirm_payment(
            order_id="order-1", payment_key="pk-1", amount=3000, repo=repo
        )

        assert provider.calls == []
        assert first.access_token == second.access_token

    @pytest.mark.parametrize(
        "result",
        [
            toss_result(paid=False, ambiguous=True, status="UNKNOWN"),
            toss_result(paid=False, already_processed=True, status="ALREADY_PROCESSED_PAYMENT"),
        ],
    )
    async def test_unknown_outcome_goes_to_a_human(self, monkeypatch, result):
        repo = FakeRepo(FakeOrder())
        use_provider(monkeypatch, FakeProvider(result))

        with pytest.raises(TalismanPaymentNeedsAttentionError):
            await confirm_payment(order_id="order-1", payment_key="pk-1", amount=3000, repo=repo)

        assert repo.order.status == "needs_attention"
        assert repo.marked_paid == 0

    async def test_a_concurrent_success_is_not_overwritten_by_an_unknown_result(self, monkeypatch):
        """두 승인이 겹쳐 A 가 먼저 `paid` 로 만들었다면, B 의 미상 결과가 그것을 덮지 않는다.

        덮으면 돈을 낸 사람이 원본 대신 "담당자가 확인 중" 을 본다.
        """
        repo = FakeRepo(FakeOrder())

        class RacingProvider(FakeProvider):
            async def confirm(self, **kwargs):
                # 이 요청이 토스를 기다리는 동안 다른 요청이 승인을 끝냈다.
                repo.order.status, repo.order.paid_at = "paid", PAID_AT
                return await super().confirm(**kwargs)

        use_provider(monkeypatch, RacingProvider(toss_result(paid=False, ambiguous=True)))

        confirmed = await confirm_payment(
            order_id="order-1", payment_key="pk-1", amount=3000, repo=repo
        )

        assert confirmed.access_token
        assert repo.order.status == "paid"
        assert repo.attention == []

    async def test_rejected_payment_stays_pending(self, monkeypatch):
        repo = FakeRepo(FakeOrder())
        use_provider(monkeypatch, FakeProvider(toss_result(paid=False, status="REJECT_CARD")))

        with pytest.raises(TalismanPaymentNotConfirmedError):
            await confirm_payment(order_id="order-1", payment_key="pk-1", amount=3000, repo=repo)

        assert repo.order.status == "pending"

    async def test_needs_attention_order_is_not_retried(self, monkeypatch):
        repo = FakeRepo(FakeOrder(status="needs_attention"))
        provider = FakeProvider(toss_result())
        use_provider(monkeypatch, provider)

        with pytest.raises(TalismanPaymentNeedsAttentionError):
            await confirm_payment(order_id="order-1", payment_key="pk-1", amount=3000, repo=repo)
        assert provider.calls == []

    async def test_unknown_order(self, monkeypatch):
        use_provider(monkeypatch, FakeProvider(toss_result()))
        with pytest.raises(TalismanOrderNotFoundError):
            await confirm_payment(order_id="nope", payment_key="pk", amount=3000, repo=FakeRepo())


class TestDownload:
    async def test_paid_order_gets_the_original_bytes(self):
        repo = FakeRepo(FakeOrder(status="paid", paid_at=PAID_AT))
        file = await download("token", repo, now=PAID_AT + timedelta(hours=1))

        assert file.content == b"PNG-jinheung"
        assert file.media_type == "image/png"
        assert file.filename == "jinheung.png"

    async def test_only_one_download_per_order(self):
        """일회 다운로드 — 두 번째 요청에는 바이트가 나가지 않는다."""
        repo = FakeRepo(FakeOrder(status="paid", paid_at=PAID_AT))
        await download("t", repo, now=PAID_AT)
        assert repo.order.downloaded_at == PAID_AT

        with pytest.raises(TalismanAlreadyDownloadedError) as exc:
            await download("t", repo, now=PAID_AT + timedelta(minutes=1))
        assert exc.value.status_code == 410

    async def test_missing_asset_does_not_burn_the_download(self):
        """원본이 없어 못 준 요청이 1회분을 써 버리면, 원본을 올린 뒤에도 못 받는다."""
        repo = FakeRepo(FakeOrder(status="paid", paid_at=PAID_AT), assets={})
        with pytest.raises(TalismanAssetMissingError):
            await download("t", repo, now=PAID_AT)
        assert repo.order.downloaded_at is None

    async def test_expired_request_does_not_burn_the_download(self):
        repo = FakeRepo(FakeOrder(status="paid", paid_at=PAID_AT))
        with pytest.raises(DownloadExpiredError):
            await download("t", repo, now=PAID_AT + timedelta(days=8))
        assert repo.order.downloaded_at is None

    async def test_token_is_looked_up_by_hash_never_in_plain(self):
        repo = FakeRepo(FakeOrder(status="paid", paid_at=PAID_AT))
        await download("plain-token", repo, now=PAID_AT)
        assert repo.token_hashes and "plain-token" not in repo.token_hashes

    @pytest.mark.parametrize("status", ["pending", "needs_attention"])
    async def test_unpaid_order_cannot_reach_the_bytes(self, status):
        repo = FakeRepo(FakeOrder(status=status))
        with pytest.raises((TalismanPaymentNotConfirmedError, TalismanPaymentNeedsAttentionError)):
            await download("token", repo, now=PAID_AT)

    async def test_unknown_token(self):
        with pytest.raises(TalismanOrderNotFoundError):
            await download("token", FakeRepo(None), now=PAID_AT)

    async def test_window_is_seven_days_from_payment(self):
        repo = FakeRepo(FakeOrder(status="paid", paid_at=PAID_AT))
        days = settings.talisman_download_days
        assert days == 7

        last_moment = PAID_AT + timedelta(days=days) - timedelta(seconds=1)
        assert (await download("t", repo, now=last_moment)).content

        fresh = FakeRepo(FakeOrder(status="paid", paid_at=PAID_AT))
        with pytest.raises(DownloadExpiredError):
            await download("t", fresh, now=PAID_AT + timedelta(days=days))

    async def test_window_never_renews_when_paid_at_is_missing(self):
        """사람이 상태만 `paid` 로 고친 행 — 기간을 '지금부터' 세면 영구 링크가 된다."""
        month_ago = datetime.now(UTC) - timedelta(days=30)
        repo = FakeRepo(FakeOrder(status="paid", paid_at=None, created_at=month_ago))
        with pytest.raises(DownloadExpiredError):
            await download("t", repo)

    async def test_missing_asset_after_payment_is_not_a_404(self):
        """결제됐는데 원본이 사라졌다면 **우리 쪽 문제**다. 없는 주문처럼 답하면 안 된다."""
        repo = FakeRepo(FakeOrder(status="paid", paid_at=PAID_AT), assets={})
        with pytest.raises(TalismanAssetMissingError):
            await download("t", repo, now=PAID_AT)


class TestReadOrder:
    async def test_paid_order_reports_name_and_expiry(self):
        repo = FakeRepo(FakeOrder(talisman_id="silver", status="paid", paid_at=PAID_AT))
        out = await read_order("t", repo, now=PAID_AT)

        assert out.talisman_id == "silver"
        assert out.name == "실버수호창"
        assert out.download_expires_at == PAID_AT + timedelta(days=7)
        assert out.expired is False
        assert out.downloaded is False

    async def test_downloaded_order_says_so(self):
        order = FakeOrder(status="paid", paid_at=PAID_AT, downloaded_at=PAID_AT)
        out = await read_order("t", FakeRepo(order), now=PAID_AT)
        assert out.downloaded is True

    async def test_expired_order_still_reads_but_says_so(self):
        repo = FakeRepo(FakeOrder(status="paid", paid_at=PAID_AT))
        out = await read_order("t", repo, now=PAID_AT + timedelta(days=8))
        assert out.expired is True

    async def test_unpaid_order_is_not_ready(self):
        with pytest.raises(TalismanPaymentNotConfirmedError):
            await read_order("t", FakeRepo(FakeOrder()), now=PAID_AT)


# ---------------------------------------------------------------------------
# HTTP — 라우터가 바이트를 어떻게 내보내는가
# ---------------------------------------------------------------------------


@pytest.fixture
def http(request):
    from httpx import ASGITransport, AsyncClient

    from app.api.deps import get_talisman_repository
    from app.main import create_app

    repo: FakeRepo = request.param
    app = create_app()
    app.dependency_overrides[get_talisman_repository] = lambda: repo
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _paid_now() -> FakeOrder:
    return FakeOrder(status="paid", paid_at=datetime.now(UTC))


class TestHttp:
    @pytest.mark.parametrize("http", [FakeRepo(_paid_now())], indirect=True)
    async def test_download_is_an_uncached_attachment(self, http):
        async with http as client:
            res = await client.get("/api/v1/talismans/orders/tok/download")

        assert res.status_code == 200
        assert res.content == b"PNG-jinheung"
        assert res.headers["content-type"] == "image/png"
        assert res.headers["content-disposition"] == 'attachment; filename="jinheung.png"'
        assert "no-store" in res.headers["cache-control"]

    @pytest.mark.parametrize("http", [FakeRepo(_paid_now())], indirect=True)
    async def test_second_download_is_410_without_bytes(self, http):
        async with http as client:
            first = await client.get("/api/v1/talismans/orders/tok/download")
            second = await client.get("/api/v1/talismans/orders/tok/download")

        assert first.status_code == 200
        assert second.status_code == 410
        assert second.json()["error"]["code"] == "talisman_already_downloaded"
        assert b"PNG" not in second.content

    @pytest.mark.parametrize("http", [FakeRepo(FakeOrder())], indirect=True)
    async def test_unpaid_download_is_409_without_bytes(self, http):
        async with http as client:
            res = await client.get("/api/v1/talismans/orders/tok/download")

        assert res.status_code == 409
        assert b"PNG" not in res.content

    @pytest.mark.parametrize("http", [FakeRepo(None)], indirect=True)
    async def test_unknown_token_is_404(self, http):
        async with http as client:
            res = await client.get("/api/v1/talismans/orders/forged/download")
        assert res.status_code == 404

    @pytest.mark.parametrize("http", [FakeRepo()], indirect=True)
    async def test_order_endpoint_returns_server_price(self, http):
        async with http as client:
            res = await client.post("/api/v1/talismans/orders", json={"talisman_id": "silver"})

        assert res.status_code == 200
        body = res.json()
        assert body["amount"] == 3000
        assert body["order_name"] == "실버수호창"
