"""사주 결과 공유 링크 — 발급과 공개 조회.

## 왜 `saju.py` 가 아니라 별도 라우터인가

`saju.py` 의 모듈 주석은 **"이 라우터는 아무것도 저장하지 않는다"** 를 문서로
박아 둔 자리다. 저장하는 엔드포인트를 그 파일에 끼워 넣으면 그 문장이 거짓이
되고, 거짓이 된 주석은 없는 주석보다 나쁘다.

주식 쪽이 `advice_verdicts.py` 를 `stocks.py` 에서 갈라 둔 것과 같은 판단이다 —
규칙이 다르면 파일이 다르다. 예외는 자기 주석을 들고 눈에 보이는 곳에 있어야 한다.

## 인증

**둘 다 소유자를 묻지 않는다.** `/saju/*` 전체가 그렇다 — 이 제품의 무료 경로에는
계정이 없다.

- 발급(`POST`)은 그래서 **인증 없는 쓰기 문**이다. 이 저장소의 첫 사례다. 남용의
  상한은 7일 TTL 과 프런트 BFF 의 소프트 레이트리밋이고, 최악의 결과는 표가
  커지는 것이다. 진짜 상한이 필요해지면 여기에 붙인다.
- 조회(`GET`)는 링크가 곧 열쇠다. `share_id` 는 128비트 난수다.

`AdviceKeyGuard` 는 붙이지 않는다. 그 키는 LLM 을 태우는 문을 지키는 것이고
여기서 나가는 비용은 순수 계산 한 번과 DB 왕복 한 번이다.
"""

from fastapi import APIRouter, HTTPException, status

from app.api.deps import SajuShareRepo
from app.core.config import settings
from app.integrations.saju.mapper import to_teaser_out
from app.models.saju_share import SajuShareRow
from app.schemas.saju import (
    SajuShareCreated,
    SajuSharedReading,
    SajuShareRequest,
)
from app.services import saju_service

router = APIRouter(prefix="/saju/shares", tags=["saju"])


def _to_shared(row: SajuShareRow) -> SajuSharedReading:
    return SajuSharedReading(
        pillars_hangul=row.pillars_hangul,
        day_master_hangul=row.day_master_hangul,
        visible_wuxing=row.visible_wuxing,
        strength_verdict=row.strength_verdict,
        summary=row.summary,
        created_at=row.created_at.isoformat(),
        retention_days=settings.saju_share_retention_days,
    )


@router.post(
    "",
    response_model=SajuShareCreated,
    status_code=status.HTTP_201_CREATED,
    summary="사주 결과 공유 링크 발급",
)
async def create_share(
    payload: SajuShareRequest,
    repo: SajuShareRepo,
) -> SajuShareCreated:
    """생년월일시를 받아 **서버가 다시 계산하고** 티저 수준 투영만 저장한다.

    결과를 본문으로 받지 않는 이유는 `SajuShareRequest` 주석에 있다 — 요약문이
    자유 텍스트이고 그것이 공개 페이지와 미리보기 카드에 우리 브랜드로 실린다.

    **생년월일시는 저장되지 않는다.** 계산에만 쓰고 버린다. 로그에도 남기지
    않는다 (`endpoints/saju.py` 와 같은 규칙).

    누를 때마다 새 id 다. 같은 사주를 두 번 공유하면 링크가 둘 생기고, 먼저 보낸
    것도 계속 살아 있다 — 지문으로 합치지 않는 이유는 리포지토리 주석에 있다.
    """
    reading = saju_service.read_chart(payload.birth)
    teaser = to_teaser_out(reading.teaser)

    # **좁히기가 일어나는 한 줄이다.** `reading` 에는 원국·대운·보정값이 다 있고
    # `teaser` 에는 `char_count` 가 있다. 아래 다섯 개 말고는 표로 갈 길이 없다.
    row = await repo.create(
        pillars_hangul=teaser.pillars_hangul,
        day_master_hangul=teaser.day_master_hangul,
        visible_wuxing=teaser.visible_wuxing,
        strength_verdict=teaser.strength_verdict,
        summary=teaser.summary,
    )

    return SajuShareCreated(
        share_id=row.share_id,
        retention_days=settings.saju_share_retention_days,
    )


@router.get(
    "/{share_id}",
    response_model=SajuSharedReading,
    summary="공유 링크로 사주 보기",
)
async def get_shared(share_id: str, repo: SajuShareRepo) -> SajuSharedReading:
    """**소유자를 묻지 않는다** — 링크가 곧 열쇠다.

    만료된 링크와 없는 링크를 구분하지 않고 둘 다 404 다. 구분해 주면 "있었지만
    만료됐다" 가 곧 **그 사람이 이 서비스를 썼다는 사실**을 아무에게나 확인해 주는
    창구가 된다.
    """
    row = await repo.get(share_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="공유된 사주를 찾을 수 없습니다. 링크가 만료되었을 수 있습니다.",
        )
    return _to_shared(row)
