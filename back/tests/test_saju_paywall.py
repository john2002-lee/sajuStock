"""유료 상품을 값 없이 내주지 않는다.

## 이 파일이 막는 것

결제가 붙기 전에 만들어진 생성 경로들이 인증도 결제 확인도 없이 열려 있었다.
티저에서 생년월일을 넣은 사람이 `/saju/report` 로 바로 가면 유료 상품인 전체
풀이가 그냥 나왔고, 그래서 **결제 버튼을 되살려도 아무도 누를 이유가 없었다.**
LLM 비용도 상한 없이 열려 있었다(요청 하나가 Gemini 1~2회).

DB 없이 돌아야 하므로 순수 함수만 다룬다 — 게이트는 요청 본문만 보고 판단한다.
`client` 픽스처는 Postgres 를 요구하는데, 이 규칙은 DB 와 아무 상관이 없다.
"""

import pytest

from app.api.v1.endpoints.saju import _deny_unpaid_full_reading
from app.core.config import settings
from app.schemas.saju import BirthInput
from app.services.saju_order_service import ReportRequiresPaymentError

BIRTH = BirthInput(
    year=1990,
    month=5,
    day=17,
    hour=9,
    minute=30,
    gender="M",
    birth_place_code="SEOUL",
)


@pytest.fixture
def selling(monkeypatch: pytest.MonkeyPatch) -> None:
    """결제를 팔 수 있는 상태 — 키 둘 다 있음(`saju_payment_enabled` 의 조건)."""
    monkeypatch.setattr(settings, "toss_secret_key", "test_sk_x", raising=False)
    monkeypatch.setattr(settings, "saju_access_token_secret", "s3cret", raising=False)
    assert settings.saju_payment_enabled


@pytest.fixture
def not_selling(monkeypatch: pytest.MonkeyPatch) -> None:
    """토스 키가 없는 개발·프리뷰 환경."""
    monkeypatch.setattr(settings, "toss_secret_key", None, raising=False)
    monkeypatch.setattr(settings, "saju_access_token_secret", None, raising=False)
    assert not settings.saju_payment_enabled


class TestGateWhenSelling:
    def test_raw_birth_is_refused(self, selling: None) -> None:
        """**이 파일의 존재 이유.** 생년월일시를 그대로 실은 요청 = 값을 치르지 않은 요청."""
        with pytest.raises(ReportRequiresPaymentError):
            _deny_unpaid_full_reading(BIRTH)

    def test_the_error_says_payment_not_permission(self, selling: None) -> None:
        """402 여야 한다.

        401/403 으로 두면 화면이 로그인을 권하게 되는데 이 제품에는 로그인이 없다.
        503(`PaymentDisabledError`)으로 두면 "잠시 후 다시" 라고 안내하게 되는데
        기다린다고 열리지 않는다. 없는 것은 권한도 자원도 아니고 결제다.
        """
        with pytest.raises(ReportRequiresPaymentError) as caught:
            _deny_unpaid_full_reading(BIRTH)

        assert caught.value.status_code == 402
        assert caught.value.code == "saju_report_requires_payment"

    def test_a_paid_request_carries_no_birth_and_passes(self, selling: None) -> None:
        """유료 경로는 `access_token` 만 들고 온다 — 생년월일시는 서버가 주문에서 꺼낸다.

        추가 질문(`/followup/jobs`)은 유료·무료가 **같은 엔드포인트**를 쓰므로,
        이 구분이 무너지면 구매자의 추가 질문까지 끊긴다.
        """
        _deny_unpaid_full_reading(None)


class TestGateWhenNotSelling:
    def test_free_path_stays_open_where_nothing_can_be_sold(self, not_selling: None) -> None:
        """살 방법이 없는 환경에서 막으면 제품을 아예 볼 수 없다.

        화면도 같은 근거로 무료 경로를 그린다(`PurchaseCard` 의 `enabled === false`).
        """
        _deny_unpaid_full_reading(BIRTH)
        _deny_unpaid_full_reading(None)


class TestPriceStaysInSync:
    """가격의 원본은 여기다. 복사본이 하나 있고, 그 사실을 여기서 못박는다.

    돈이 걸리는 경로(주문 금액·승인 검증·결제 화면)는 전부 이 값을 서버에서
    받아 쓴다. 예외가 하나 있다 — 공개 소개 페이지(`/saju/intro`)의 표시용
    가격(`front/src/lib/config/public.ts` 의 `REPORT_PRICE`)이다. 그 페이지는
    심사자와 사기 전에 값을 보려는 사람이 처음 닿는 곳이라 백엔드가 죽어도
    서야 해서, 조회 대신 상수를 둔다.

    복사본이 있으면 언젠가 어긋난다. 그래서 **가격을 바꾸는 순간 이 테스트가
    깨지게** 해 둔다 — 실패 메시지가 어디를 같이 고쳐야 하는지 알려 준다.
    """

    def test_price_change_must_update_the_public_page(self) -> None:
        assert settings.saju_report_price == 1000, (
            "가격을 바꿨다면 front/src/lib/config/public.ts 의 REPORT_PRICE 도 "
            "함께 바꾸고 이 숫자를 고치세요."
        )
