"""AI 판단 엔드포인트의 자물쇠 (app/api/auth.py).

여기서 지키는 것은 두 가지다.

1. **키를 설정하면 실제로 잠긴다.** 의존성을 붙였다고 잠기는 게 아니라, 두 경로가
   *모두* 잠겨야 한다 — 스트리밍만 막고 `/advice` 를 열어 두면 우회로가 남는다.
2. **키를 안 넣으면 로컬 개발이 그대로 돈다.** 이게 깨지면 자물쇠가 "개발 시작 전에
   먼저 풀어야 하는 것"이 되어 결국 아무도 켜지 않게 된다.

토큰을 쓰지 않는 엔드포인트까지 잠갔는지도 본다. 잠글 이유가 없는 곳을 잠그면 키가
닿는 표면만 넓어진다.
"""

from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.schemas.advice import (
    AdviceStreamEvent,
    StockAdviceResponse,
    StockRef,
)
from app.schemas.stock import StockHistory, StockMetrics, StockRow
from app.services import advice_service, advice_stream, listed_company_service

_KEY = "test-advice-key-0123456789"
_PATHS = ("/api/v1/stocks/advice", "/api/v1/stocks/advice/stream")

_HISTORY = StockHistory(
    name="삼성전자",
    symbol="005930.KS",
    query="005930",
    timeframe="day",
    period="2y",
    interval="1d",
    rows=[StockRow(name="삼성전자", symbol="005930.KS", date="2026-07-30", close=70000.0)],
    metrics=StockMetrics(latest_close=70000.0, trend="상승 우위", return_20d_pct=4.0),
)


@pytest.fixture(autouse=True)
def no_upstream(monkeypatch: pytest.MonkeyPatch) -> None:
    """자물쇠 **앞**에서 멈추는 테스트라 분석 자체는 대역으로 세운다.

    없으면 키가 맞는 경로가 실제 yfinance·LLM 까지 내려가 테스트가 네트워크를 친다
    (실측 18초). 판단의 동작은 test_advice_stream.py · test_advice_cache.py 가 덮으므로
    여기서 다시 돌릴 이유도 없다.
    """

    async def fake_resolve(repo, symbol: str):
        return None

    async def fake_generate(symbol: str, *, listing=None, profile=None) -> StockAdviceResponse:
        return StockAdviceResponse(
            stock=StockRef(name="삼성전자", symbol="005930.KS", query="005930"),
            stock_data=_HISTORY,
            metrics=_HISTORY.metrics,
            agents=[],
            verdict="WATCH",
            decision_label="관망",
            confidence=50,
            answer="대역 응답.",
            updated_at="2026-08-05T00:00:00Z",
        )

    async def fake_stream(
        symbol: str, *, listing=None, profile=None
    ) -> AsyncIterator[AdviceStreamEvent]:
        yield AdviceStreamEvent(stage=1)

    monkeypatch.setattr(listed_company_service, "resolve_listing", fake_resolve)
    monkeypatch.setattr(advice_service, "generate_advice", fake_generate)
    monkeypatch.setattr(advice_stream, "stream_advice", fake_stream)


@pytest.fixture
def locked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "advice_api_key", _KEY)


@pytest.mark.parametrize("path", _PATHS)
async def test_missing_key_is_rejected(client: AsyncClient, locked: None, path: str) -> None:
    response = await client.post(path, json={"symbol": "005930"})

    assert response.status_code == 401
    # 어느 쪽이 틀렸는지(미제출/오유) 흘리지 않는다 — 헤더 이름부터 알려주는 셈이 된다.
    assert "X-Advice-Key" not in response.text


@pytest.mark.parametrize("path", _PATHS)
async def test_wrong_key_is_rejected(client: AsyncClient, locked: None, path: str) -> None:
    response = await client.post(
        path, json={"symbol": "005930"}, headers={"X-Advice-Key": "not-the-key"}
    )

    assert response.status_code == 401


async def test_prefix_of_the_real_key_is_still_wrong(
    client: AsyncClient, locked: None
) -> None:
    """부분 일치는 통과가 아니다. 상수 시간 비교로 바꾸면서 깨지기 쉬운 지점이다."""
    response = await client.post(
        "/api/v1/stocks/advice",
        json={"symbol": "005930"},
        headers={"X-Advice-Key": _KEY[:-1]},
    )

    assert response.status_code == 401


@pytest.mark.parametrize("path", _PATHS)
async def test_correct_key_passes_the_guard(
    client: AsyncClient, locked: None, path: str
) -> None:
    """자물쇠를 통과하면 그 뒤는 평소 경로다.

    상류(yfinance)를 대역으로 세우지 않았으므로 결과는 성공이 아닐 수 있다 —
    여기서 확인하는 것은 **401 이 아니라는 것** 하나다. 판단 자체의 동작은
    test_advice_stream.py · test_advice_cache.py 가 덮는다.
    """
    response = await client.post(
        path, json={"symbol": "005930"}, headers={"X-Advice-Key": _KEY}
    )

    assert response.status_code != 401


@pytest.mark.parametrize("path", _PATHS)
async def test_unset_key_leaves_the_endpoint_open(client: AsyncClient, path: str) -> None:
    """키 미설정이 기본값이고, 그때는 로컬 개발이 헤더 없이 그대로 돈다."""
    assert settings.advice_api_key is None  # 테스트 환경 기본값

    response = await client.post(path, json={"symbol": "005930"})

    assert response.status_code != 401


async def test_free_endpoints_stay_open_even_when_locked(
    client: AsyncClient, locked: None
) -> None:
    """토큰을 쓰지 않는 경로까지 잠그지 않는다.

    `/markets/*` · `/stocks/suggestions` 는 yfinance·KRX 결과라 남이 불러도 우리
    토큰이 줄지 않는다. 여기까지 잠그면 프런트 서버 컴포넌트의 모든 호출에 키를
    실어야 하고, 키가 닿는 표면이 넓어질수록 새어나갈 곳도 많아진다.
    """
    for path in ("/api/v1/stocks/listed-companies", "/api/v1/health"):
        response = await client.get(path)
        assert response.status_code != 401, path
