"""AI 판단 기록 — 저장 · 내 이력 · 공유 조회.

## 왜 `stocks.py` 가 아니라 별도 라우터인가

`/stocks/advice` 는 **판단을 만드는** 경로이고 여기는 **만든 것을 보관하는**
경로다. 앞은 LLM 4회가 나가는 무거운 문이라 동시 실행 상한·실행 예산·SSE 프레이밍이
붙어 있고, 여기는 평범한 CRUD 다. 같은 파일에 두면 그 파일을 열 때마다 어느 쪽
규칙이 걸리는지 매번 확인해야 한다.

## 인증

- 저장·목록·공유 켜기는 **소유자 필수**(`OwnerKey`). 남의 기록을 읽거나 쓸 길이 없다.
- 공유 조회만 **소유자를 묻지 않는다** — 링크가 곧 열쇠다.

`AdviceKeyGuard` 는 붙이지 않는다. 그 키는 LLM 을 태우는 문을 지키는 것이고
(`require_advice_key` 주석), 여기서 나가는 비용은 DB 왕복 한 번이다.
"""

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import AdviceVerdictRepo, OwnerKey
from app.models.advice_verdict import AdviceVerdictRow
from app.repositories.advice_verdict import DEFAULT_LIMIT, MAX_PER_OWNER
from app.schemas.advice_verdict import (
    AdviceVerdictCreate,
    AdviceVerdictList,
    AdviceVerdictOut,
    AdviceVerdictShared,
)
from app.services import advice_verdict_service

router = APIRouter(prefix="/advice/verdicts", tags=["advice"])


def _to_out(row: AdviceVerdictRow, price_now: float | None = None) -> AdviceVerdictOut:
    return AdviceVerdictOut(
        price_now=price_now,
        since_percent=advice_verdict_service.since_percent(row, price_now),
        id=row.id,
        code=row.code,
        symbol=row.symbol,
        name=row.name,
        decision=row.decision,
        confidence=row.confidence,
        source=row.source,  # type: ignore[arg-type]
        answer=row.answer,
        price_at=row.price_at,
        agent_opinions=row.agent_opinions or [],
        share_id=row.share_id,
        created_at=row.created_at.isoformat(),
    )


@router.post("", response_model=AdviceVerdictOut, summary="AI 판단 기록")
async def create_verdict(
    payload: AdviceVerdictCreate,
    repo: AdviceVerdictRepo,
    owner: OwnerKey,
) -> AdviceVerdictOut:
    """판단 하나를 기록한다. 같은 종목이면 **덮어쓴다**.

    `owner_key` 는 **서버가 헤더에서 채운다** — 본문으로 받지 않는다. 받으면
    남의 목록에 쓸 수 있다.
    """
    row = await repo.upsert(owner, payload)
    return _to_out(row)


@router.get("", response_model=AdviceVerdictList, summary="내 판단 기록")
async def list_verdicts(
    repo: AdviceVerdictRepo,
    owner: OwnerKey,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_PER_OWNER),
) -> AdviceVerdictList:
    rows = await repo.list_for(owner, limit=limit)
    # **여기서만** 시세를 붙인다. 저장(POST)·공유 켜기 응답에는 필요 없다 —
    # 그때는 방금 만든 판단이라 "그 뒤 얼마" 가 아직 뜻이 없고, 상류 호출을
    # 한 번 더 하는 값이 없다.
    prices = await advice_verdict_service.current_prices(rows)
    return AdviceVerdictList(
        items=[_to_out(row, prices.get(row.symbol)) for row in rows]
    )


@router.post(
    "/{code}/share",
    response_model=AdviceVerdictOut,
    summary="공유 켜기",
)
async def enable_share(
    code: str,
    repo: AdviceVerdictRepo,
    owner: OwnerKey,
) -> AdviceVerdictOut:
    """공유를 켜고 `share_id` 를 돌려준다. 이미 켜져 있으면 같은 값이다.

    누를 때마다 새로 발급하면 먼저 보낸 링크가 죽는다 (repository 주석).
    """
    row = await repo.enable_share(owner, code)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="기록이 없습니다. 먼저 AI 판단을 받아 주세요.",
        )
    return _to_out(row)


@router.get(
    "/shared/{share_id}",
    response_model=AdviceVerdictShared,
    summary="공유 링크로 판단 보기",
)
async def get_shared(share_id: str, repo: AdviceVerdictRepo) -> AdviceVerdictShared:
    """**소유자를 묻지 않는 유일한 경로다.**

    `share_id` 는 128비트 난수라 추측으로 닿을 수 없고, 공유를 켠 행에만 있다.
    응답에 소유자·심볼·가격을 넣지 않는다 — 링크를 받은 사람에게 필요한 것은
    종목과 판단이고, 그 이상은 링크를 넘겨받은 제3자에게까지 흘러간다.
    """
    row = await repo.get_shared(share_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="공유된 판단을 찾을 수 없습니다."
        )
    return AdviceVerdictShared(
        code=row.code,
        name=row.name,
        decision=row.decision,
        confidence=row.confidence,
        source=row.source,  # type: ignore[arg-type]
        answer=row.answer,
        agent_opinions=row.agent_opinions or [],
        created_at=row.created_at.isoformat(),
    )
