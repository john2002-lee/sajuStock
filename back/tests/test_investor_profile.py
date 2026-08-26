"""투자 성향 프로파일 저장소와 엔드포인트 (사주 통합 계획 5.2).

관심종목과 같은 관심사가 첫 번째다 — **소유자 격리**. 여기서 틀리면 남의 투자 성향이
보이고, 그 값으로 남의 판단이 개인화된다.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.investor_profile import InvestorProfileRepository
from app.schemas.advice import AdviceStreamEvent, InvestmentDecision
from app.schemas.profile import InvestorProfile
from app.schemas.stock import StockHistory, StockMetrics, StockRow
from app.services import (
    advice_service,
    advice_stream,
    fundamentals_service,
    listed_company_service,
    profile_service,
    rag_service,
    stock_service,
)

_ALICE = "anon:alice"
_BOB = "anon:bob"
_ACCOUNT = "user:0c9f"

_PAYLOAD = {
    "risk_appetite": 30,
    "patience": 20,
    "decisiveness": 75,
    "loss_aversion": 85,
    "herd_tendency": 80,
    "source": "saju",
    "saju_summary": "화(火) 기운이 강해 결단이 빠른 편입니다.",
}


@pytest.fixture
def profiles(db_session: AsyncSession) -> InvestorProfileRepository:
    return InvestorProfileRepository(db_session)


def _profile(**kwargs) -> InvestorProfile:
    return InvestorProfile(**{**_PAYLOAD, **kwargs})


async def test_upsert_creates_then_updates_a_single_row(
    profiles: InvestorProfileRepository,
) -> None:
    await profiles.upsert(_ALICE, _profile())
    await profiles.upsert(_ALICE, _profile(risk_appetite=90, source="user_edited"))

    row = await profiles.get(_ALICE)
    assert row is not None
    assert row.risk_appetite == 90
    assert row.source == "user_edited"


async def test_profiles_are_isolated_by_owner(
    profiles: InvestorProfileRepository,
) -> None:
    await profiles.upsert(_ALICE, _profile(risk_appetite=10))
    await profiles.upsert(_BOB, _profile(risk_appetite=95))

    alice = await profiles.get(_ALICE)
    bob = await profiles.get(_BOB)
    assert alice is not None and bob is not None
    assert (alice.risk_appetite, bob.risk_appetite) == (10, 95)


async def test_missing_profile_is_none_not_an_error(
    profiles: InvestorProfileRepository,
) -> None:
    assert await profiles.get("anon:nobody") is None
    assert await profile_service.get_profile(profiles, "anon:nobody") is None


async def test_delete_is_idempotent(profiles: InvestorProfileRepository) -> None:
    await profiles.upsert(_ALICE, _profile())

    assert await profiles.delete(_ALICE) is True
    assert await profiles.delete(_ALICE) is False


async def test_claim_moves_an_anonymous_profile_to_the_account(
    profiles: InvestorProfileRepository,
) -> None:
    await profiles.upsert(_ALICE, _profile(risk_appetite=42))

    assert await profiles.transfer_owner(_ALICE, _ACCOUNT) is True
    assert await profiles.get(_ALICE) is None
    moved = await profiles.get(_ACCOUNT)
    assert moved is not None and moved.risk_appetite == 42


async def test_claim_never_overwrites_an_existing_account_profile(
    profiles: InvestorProfileRepository,
) -> None:
    """계정에 보정해 둔 값이 익명 초안에 덮이면 조용한 데이터 손실이다."""
    await profiles.upsert(_ACCOUNT, _profile(risk_appetite=95, source="user_edited"))
    await profiles.upsert(_ALICE, _profile(risk_appetite=10))

    assert await profiles.transfer_owner(_ALICE, _ACCOUNT) is False
    kept = await profiles.get(_ACCOUNT)
    assert kept is not None
    assert kept.risk_appetite == 95
    assert kept.source == "user_edited"


async def test_get_returns_null_profile_before_onboarding(client: AsyncClient) -> None:
    """온보딩 전은 404 가 아니라 200 + profile:null 이다."""
    response = await client.get("/api/v1/profile", headers={"X-Owner-Key": _ALICE})

    assert response.status_code == 200
    assert response.json()["profile"] is None


async def test_put_then_get_round_trips(client: AsyncClient) -> None:
    headers = {"X-Owner-Key": _ALICE}

    saved = await client.put("/api/v1/profile", json=_PAYLOAD, headers=headers)
    assert saved.status_code == 200
    assert saved.json()["profile"]["loss_aversion"] == 85

    fetched = await client.get("/api/v1/profile", headers=headers)
    assert fetched.json()["profile"] == _PAYLOAD
    assert fetched.json()["updated_at"] is not None


async def test_put_rejects_out_of_range_axes(client: AsyncClient) -> None:
    response = await client.put(
        "/api/v1/profile",
        json={**_PAYLOAD, "risk_appetite": 140},
        headers={"X-Owner-Key": _ALICE},
    )

    assert response.status_code == 422


async def test_profile_endpoints_require_an_owner_key(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/profile")).status_code == 400
    assert (await client.put("/api/v1/profile", json=_PAYLOAD)).status_code == 400


async def test_one_owner_cannot_read_another_profile(client: AsyncClient) -> None:
    await client.put("/api/v1/profile", json=_PAYLOAD, headers={"X-Owner-Key": _ALICE})

    response = await client.get("/api/v1/profile", headers={"X-Owner-Key": _BOB})

    assert response.status_code == 200
    assert response.json()["profile"] is None


async def test_claim_rejects_transferring_to_yourself(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/profile/claim",
        json={"from_key": _ALICE},
        headers={"X-Owner-Key": _ALICE},
    )

    assert response.status_code == 400


# ---------------------------------------------------------------------------
# 저장한 프로파일이 실제로 판단까지 도달하는지 — 배선 전체를 한 번에 본다.
# 계층별 단위 테스트가 전부 초록이어도 엔드포인트가 프로파일을 안 넘기면 기능은 없다.
# ---------------------------------------------------------------------------

_VOLATILE = StockMetrics(
    latest_close=82_000.0,
    day_change_pct=6.4,
    volatility_20d_pct=32.0,
    week52_position_pct=91.0,
    volume_ratio_20d=2.6,
    sma5=80_000.0,
    sma20=76_000.0,
    trend="상승 우위",
)

_BUY = InvestmentDecision(
    verdict="BUY",
    decision_label="매수 가능",
    confidence=74,
    answer="BUY. 상승 추세가 확인됩니다.",
)


@pytest.fixture
def buy_verdict(monkeypatch: pytest.MonkeyPatch) -> None:
    """상류(yfinance·LLM)를 전부 대역으로 세우고 시장 판단을 BUY 로 고정한다."""
    history = StockHistory(
        name="삼성전자",
        symbol="005930.KS",
        query="005930",
        timeframe="day",
        period="2y",
        interval="1d",
        rows=[StockRow(name="삼성전자", symbol="005930.KS", date="2026-08-05", close=82_000.0)],
        metrics=_VOLATILE,
    )

    async def fake_resolve(repo, symbol: str):
        return None

    async def fake_history(params, *, listing=None) -> StockHistory:
        return history

    async def fake_fundamentals(symbol: str):
        return None

    async def fake_documents(*args, **kwargs) -> list:
        return []

    async def fake_opinions(*args, **kwargs) -> list:
        return []

    async def fake_decide(*args, **kwargs):
        return _BUY, False

    monkeypatch.setattr(listed_company_service, "resolve_listing", fake_resolve)
    monkeypatch.setattr(stock_service, "get_history", fake_history)
    monkeypatch.setattr(stock_service, "get_metrics", lambda data: _VOLATILE)
    monkeypatch.setattr(fundamentals_service, "get_fundamentals_or_none", fake_fundamentals)
    monkeypatch.setattr(rag_service, "documents_for_advice", fake_documents)
    monkeypatch.setattr(advice_service, "collect_opinions", fake_opinions)
    monkeypatch.setattr(advice_service, "decide", fake_decide)


async def test_advice_without_an_owner_key_is_unchanged(
    client: AsyncClient, buy_verdict: None
) -> None:
    """개인화는 얹는 기능이다 — 헤더가 없어도 400 이 아니라 종전 응답 그대로다."""
    response = await client.post("/api/v1/stocks/advice", json={"symbol": "005930"})

    assert response.status_code == 200
    body = response.json()
    assert body["verdict"] == "BUY"
    assert body["personal"] is None


async def test_advice_without_a_saved_profile_is_unchanged(
    client: AsyncClient, buy_verdict: None
) -> None:
    response = await client.post(
        "/api/v1/stocks/advice",
        json={"symbol": "005930"},
        headers={"X-Owner-Key": _ALICE},
    )

    assert response.json()["personal"] is None


async def test_saved_profile_downgrades_the_verdict_end_to_end(
    client: AsyncClient, buy_verdict: None
) -> None:
    """저장 → 조회 → 적합도 → 결합까지 한 요청 안에서 이어지는지."""
    headers = {"X-Owner-Key": _ALICE}
    await client.put("/api/v1/profile", json=_PAYLOAD, headers=headers)

    response = await client.post(
        "/api/v1/stocks/advice", json={"symbol": "005930"}, headers=headers
    )

    body = response.json()
    # 상단은 여전히 시장 판단이다 — 기존 클라이언트가 보는 필드는 안 바뀐다.
    assert body["verdict"] == "BUY"

    personal = body["personal"]
    assert personal is not None
    assert personal["market_verdict"] == "BUY"
    assert personal["verdict"] == "WATCH"
    assert personal["adjusted"] is True
    assert personal["fit_level"] == "low"
    assert personal["concerns"]
    assert personal["guardrails"]


async def test_two_profiles_get_different_verdicts_for_the_same_stock(
    client: AsyncClient, buy_verdict: None
) -> None:
    """계획 5.6 의 완료 기준 — 프로파일이 다른 두 계정이 서로 다른 최종 판단을 받는다."""
    await client.put("/api/v1/profile", json=_PAYLOAD, headers={"X-Owner-Key": _ALICE})
    await client.put(
        "/api/v1/profile",
        json={
            "risk_appetite": 90,
            "patience": 85,
            "decisiveness": 30,
            "loss_aversion": 15,
            "herd_tendency": 20,
            "source": "survey",
            "saju_summary": None,
        },
        headers={"X-Owner-Key": _BOB},
    )

    async def verdict_for(owner: str) -> str:
        response = await client.post(
            "/api/v1/stocks/advice",
            json={"symbol": "005930"},
            headers={"X-Owner-Key": owner},
        )
        return response.json()["personal"]["verdict"]

    assert await verdict_for(_ALICE) == "WATCH"
    assert await verdict_for(_BOB) == "BUY"


async def test_stream_endpoint_hands_the_saved_profile_to_the_stream(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`/advice/stream` 이 소유자의 프로파일을 실제로 넘기는지.

    이 배선이 이 기능의 **유일한** 실사용 경로다. 프런트는 비스트리밍 `/advice` 를
    부르지 않으므로, 여기가 끊기면 계층 테스트가 전부 초록이어도 화면에는 2축 판단이
    나타나지 않는다 — 실제로 한 번 그렇게 만들었다.
    """
    captured: dict = {}

    async def fake_stream(symbol: str, *, listing=None, profile=None):
        captured["symbol"] = symbol
        captured["profile"] = profile
        yield AdviceStreamEvent(stage=1)

    async def fake_resolve(repo, symbol: str):
        return None

    monkeypatch.setattr(listed_company_service, "resolve_listing", fake_resolve)
    monkeypatch.setattr(advice_stream, "stream_advice", fake_stream)

    headers = {"X-Owner-Key": _ALICE}
    await client.put("/api/v1/profile", json=_PAYLOAD, headers=headers)

    response = await client.post(
        "/api/v1/stocks/advice/stream", json={"symbol": "005930"}, headers=headers
    )
    assert response.status_code == 200

    profile = captured["profile"]
    assert profile is not None, "소유자 프로파일이 스트림까지 전달되지 않았다"
    assert profile.loss_aversion == 85
    assert profile.source == "saju"


async def test_stream_endpoint_passes_none_without_an_owner_key(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict = {}

    async def fake_stream(symbol: str, *, listing=None, profile=None):
        captured["profile"] = profile
        yield AdviceStreamEvent(stage=1)

    async def fake_resolve(repo, symbol: str):
        return None

    monkeypatch.setattr(listed_company_service, "resolve_listing", fake_resolve)
    monkeypatch.setattr(advice_stream, "stream_advice", fake_stream)

    response = await client.post("/api/v1/stocks/advice/stream", json={"symbol": "005930"})

    assert response.status_code == 200
    assert captured["profile"] is None
