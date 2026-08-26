"""AI 판단 기록 — 소유자 격리 · 덮어쓰기 · 공유.

이 표는 **관심종목 다음으로 사용자가 소유하는 데이터**이고, 관심종목에 없던 것이
하나 있다: **로그인 없이 열리는 문**(`/advice/verdicts/shared/{share_id}`)이다.
그래서 이 파일의 관심사는 셋이다.

  ① 남의 기록이 보이지 않는가        — 관심종목과 같은 첫 번째 관심사
  ② 같은 종목을 다시 분석하면 덮는가  — 일괄 분석이 버튼 한 번에 10건을 만든다
  ③ 공유가 **켤 때만** 열리는가       — 기본값이 비공개여야 한다

그리고 넷째가 하나 더 있다: 저장 스키마가 `personal`(투자 성향 6축)을 **받지
않는지**. 그건 사주에서 유래한 개인 정보라 공유 카드에 새면 안 된다.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.advice_verdict import AdviceVerdictRepository
from app.schemas.advice_verdict import AdviceVerdictCreate

_ALICE = "user:alice"
_BOB = "user:bob"


def _payload(code: str = "005930", **over) -> AdviceVerdictCreate:
    base = {
        "code": code,
        "symbol": f"{code}.KS",
        "name": "삼성전자",
        "decision": "WATCH",
        "confidence": 68,
        "source": "llm",
        "answer": "지금은 관망이 맞습니다.",
        "price_at": 71000.0,
        "agent_opinions": [],
    }
    base.update(over)
    return AdviceVerdictCreate(**base)


@pytest.fixture
def verdicts(db_session: AsyncSession) -> AdviceVerdictRepository:
    return AdviceVerdictRepository(db_session)


async def test_owners_do_not_see_each_others_verdicts(
    verdicts: AdviceVerdictRepository,
) -> None:
    await verdicts.upsert(_ALICE, _payload())
    assert await verdicts.list_for(_BOB) == []


async def test_same_stock_is_overwritten_not_appended(
    verdicts: AdviceVerdictRepository,
) -> None:
    """일괄 분석이 버튼 한 번에 10건을 만든다 — 쌓으면 홈이 한 종목으로 도배된다."""
    await verdicts.upsert(_ALICE, _payload(confidence=40, answer="첫 판단"))
    await verdicts.upsert(_ALICE, _payload(confidence=90, answer="두 번째 판단"))

    rows = await verdicts.list_for(_ALICE)
    assert len(rows) == 1
    assert rows[0].confidence == 90
    assert rows[0].answer == "두 번째 판단"


async def test_different_stocks_are_separate_rows(
    verdicts: AdviceVerdictRepository,
) -> None:
    await verdicts.upsert(_ALICE, _payload("005930"))
    await verdicts.upsert(_ALICE, _payload("000660", name="SK하이닉스"))
    assert len(await verdicts.list_for(_ALICE)) == 2


async def test_share_is_off_until_it_is_turned_on(
    verdicts: AdviceVerdictRepository,
) -> None:
    """기본값이 비공개다. `share_id` 가 없으면 공유 조회로 닿을 길이 없다."""
    row = await verdicts.upsert(_ALICE, _payload())
    assert row.share_id is None

    shared = await verdicts.enable_share(_ALICE, "005930")
    assert shared is not None
    assert shared.share_id

    found = await verdicts.get_shared(shared.share_id)
    assert found is not None
    assert found.code == "005930"


async def test_enabling_share_twice_keeps_the_same_link(
    verdicts: AdviceVerdictRepository,
) -> None:
    """누를 때마다 새로 발급하면 **먼저 보낸 링크가 죽는다.**"""
    await verdicts.upsert(_ALICE, _payload())
    first = await verdicts.enable_share(_ALICE, "005930")
    second = await verdicts.enable_share(_ALICE, "005930")
    assert first is not None and second is not None
    assert first.share_id == second.share_id


async def test_reanalysis_does_not_kill_an_existing_share_link(
    verdicts: AdviceVerdictRepository,
) -> None:
    """덮어쓸 때 `share_id` 를 건드리면 남에게 보낸 주소가 조용히 404 가 된다."""
    await verdicts.upsert(_ALICE, _payload())
    shared = await verdicts.enable_share(_ALICE, "005930")
    assert shared is not None
    link = shared.share_id

    await verdicts.upsert(_ALICE, _payload(confidence=12, answer="재분석"))

    again = await verdicts.get(_ALICE, "005930")
    assert again is not None
    assert again.share_id == link
    assert again.answer == "재분석"


async def test_cannot_share_another_owners_verdict(
    verdicts: AdviceVerdictRepository,
) -> None:
    await verdicts.upsert(_ALICE, _payload())
    assert await verdicts.enable_share(_BOB, "005930") is None


async def test_create_schema_refuses_personal_axes() -> None:
    """**저장 모양이 `personal` 을 아예 모른다.**

    "저장할 때 빼면 된다" 는 방식은 필드가 늘 때마다 다시 판단해야 한다. 받는
    모양을 좁혀 두면 샐 길이 없다 — 그 성질을 여기서 고정한다.
    """
    payload = AdviceVerdictCreate(
        **{
            "code": "005930",
            "symbol": "005930.KS",
            "name": "삼성전자",
            "decision": "BUY",
            "confidence": 70,
            "source": "llm",
            "answer": "…",
            # 클라이언트가 실수로(또는 일부러) 실어 보내도 모델에 남지 않는다.
            "personal": {"risk_appetite": 5, "fit_score": 80},
        }
    )
    assert not hasattr(payload, "personal")


async def test_shared_lookup_needs_no_owner(
    client: AsyncClient, verdicts: AdviceVerdictRepository
) -> None:
    """공유 조회는 소유자 헤더 없이 200 이어야 한다 — 링크가 곧 열쇠다."""
    await verdicts.upsert(_ALICE, _payload())
    row = await verdicts.enable_share(_ALICE, "005930")
    assert row is not None

    response = await client.get(f"/api/v1/advice/verdicts/shared/{row.share_id}")
    assert response.status_code == 200

    body = response.json()
    assert body["code"] == "005930"
    # 소유자·심볼·가격은 공유의 내용이 아니다. 링크를 넘겨받은 제3자에게까지 간다.
    assert "owner_key" not in body
    assert "price_at" not in body
    assert "symbol" not in body


async def test_unknown_share_id_is_404(client: AsyncClient) -> None:
    response = await client.get("/api/v1/advice/verdicts/shared/nope")
    assert response.status_code == 404


async def test_listing_requires_an_owner(client: AsyncClient) -> None:
    """목록은 **소유자 필수**다. 없이 열리면 남의 기록으로 가는 문이 된다.

    **400 이다** — 401 이 아니다. `get_owner_key` 가 그렇게 정해 두었고 근거도
    거기 있다: 이 헤더는 인증이 아니라 **식별**이라, 없는 것은 "권한이 없다" 가
    아니라 "요청이 덜 왔다" 다. 빈 값으로 떨어뜨리면 모든 익명 사용자가 목록
    하나를 공유하게 된다.

    프런트 BFF 는 그보다 앞에서 401 로 끊는다(`app/api/advice/_helpers.ts`) —
    거기서는 신원이 세션의 문제라 뜻이 다르다. 두 계층이 다른 코드를 쓰는 것이
    맞고, 이 테스트는 **백엔드 쪽 계약**을 고정한다.
    """
    response = await client.get("/api/v1/advice/verdicts")
    assert response.status_code == 400
