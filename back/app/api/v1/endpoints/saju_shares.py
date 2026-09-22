"""사주 결과 공유 링크 — 발급과 공개 조회.

## 왜 `saju.py` 가 아니라 별도 라우터인가

`saju.py` 의 모듈 주석은 **"이 라우터는 아무것도 저장하지 않는다"** 를 문서로
박아 둔 자리다. 저장하는 엔드포인트를 그 파일에 끼워 넣으면 그 문장이 거짓이
되고, 거짓이 된 주석은 없는 주석보다 나쁘다.

주식 쪽이 `advice_verdicts.py` 를 `stocks.py` 에서 갈라 둔 것과 같은 판단이다 —
규칙이 다르면 파일이 다르다. 예외는 자기 주석을 들고 눈에 보이는 곳에 있어야 한다.

## 인증 — 셋 중 둘은 소유자를 묻지 않는다

`/saju/*` 전체가 그렇다. 이 제품의 무료 경로에는 계정이 없다.

- 발급(`POST ""`)은 그래서 **인증 없는 쓰기 문**이다. 이 저장소의 첫 사례다. 남용의
  상한은 7일 TTL 과 프런트 BFF 의 소프트 레이트리밋이고, 최악의 결과는 표가
  커지는 것이다. 진짜 상한이 필요해지면 여기에 붙인다.
- 조회(`GET`)는 링크가 곧 열쇠다. `share_id` 는 128비트 난수다.
- **유료 발급(`POST "/from-report"`)만 자격을 묻는다.** 결제로 받은 접근 토큰이
  가리키는 주문이 `paid` 여야 한다. 그 판단은 이 파일이 하지 않고
  `saju_order_service.share_paid_report` 가 한다 — 미결제·확인중을 나누는 규칙이
  이미 거기 있고, 두 곳에 두면 한쪽만 고쳐진다.
- **리포트 조회(`GET "/report/{id}"`)** 도 묻지 않는다. 그 id 는 접근 토큰과
  **다른 난수**이고, 그것으로 여는 응답에는 토큰도 생년월일도 추가 질문도 없다.

`AdviceKeyGuard` 는 붙이지 않는다. 그 키는 LLM 을 태우는 문을 지키는 것이고
여기서 나가는 비용은 순수 계산 한 번과 DB 왕복 한 번이다.

## 유료 경로가 왜 여기 있나

`/saju/reports/{token}` 쪽이 아니라 이 파일이다. **무엇을 좁혀서 내보내는가**가 이
라우터의 일이고, 유료 리포트 공유도 정확히 그 일이기 때문이다.

그 주소들이 나누는 것은 이렇다.

- `/saju/reports/{token}` — 구매자 본인. 리포트·생년월일·추가 질문이 다 나가고,
  질문을 더 쓸 수도 있다. **자격 증명이라 공유되면 안 된다.**
- `/saju/s/{shareId}` — 여덟 글자와 무료 요약만. 무료 경로가 보내는 것이다.
- `/saju/shares/report/{id}` — 리포트 본문과 계산 패널. 구매자가 "내 리포트 이렇게
  나왔어" 를 보내고 싶을 때의 답이고, 생년월일·추가 질문·토큰은 빠진다.
"""

from fastapi import APIRouter, HTTPException, status

from app.api.deps import SajuOrderRepo, SajuShareRepo
from app.core.config import settings
from app.integrations.saju.mapper import to_teaser_out
from app.models.saju_share import SajuShareRow
from app.schemas.saju import (
    SajuShareCreated,
    SajuSharedReading,
    SajuSharedReport,
    SajuShareFromReportRequest,
    SajuShareRequest,
)
from app.services import saju_order_service, saju_service

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


@router.post(
    "/from-report",
    response_model=SajuShareCreated,
    status_code=status.HTTP_201_CREATED,
    summary="구매한 리포트의 결과 공유 링크 발급",
)
async def create_share_from_report(
    payload: SajuShareFromReportRequest,
    orders: SajuOrderRepo,
) -> SajuShareCreated:
    """접근 토큰으로 **리포트 공유 id** 를 발급한다. 두 번 불러도 같은 값이다.

    위의 `POST ""` 와 나가는 것이 다르다 — 저쪽은 여덟 글자짜리 `saju_shares` 행을
    만들고, 이쪽은 **이미 있는 리포트를 여는 두 번째 열쇠**를 낸다. 리포트 본문을
    복사하지 않으므로 원본과 사본이 갈라질 일이 없고, 주문이 파기되면 링크도 함께
    죽는다.

    토큰은 "이 리포트의 주인이 맞는가" 를 묻는 데만 쓰이고 응답에 실리지 않는다.
    그 구분이 이 엔드포인트의 존재 이유라 스키마 주석에 적어 두었다.
    """
    return await saju_order_service.share_paid_report(payload.access_token, orders)


@router.get(
    "/report/{share_id}",
    response_model=SajuSharedReport,
    summary="공유 링크로 리포트 보기",
)
async def get_shared_report(share_id: str, orders: SajuOrderRepo) -> SajuSharedReport:
    """**소유자를 묻지 않는다** — 링크가 곧 열쇠다. 그리고 그 열쇠는 토큰이 아니다.

    나가는 것은 `SajuSharedReport` 로 좁혀진다: 리포트 본문과 계산 패널은 담기고,
    양력 생년월일·진태양시 보정 분값·추가 질문·접근 토큰은 담기지 않는다.

    이 경로가 `/{share_id}` 보다 **먼저 선언돼 있어야 한다** — 아래 규칙은 한
    세그먼트만 받으므로 실제로 겹치지는 않지만, 순서에 기대는 규칙을 순서대로 적어
    두는 편이 다음 사람에게 안전하다.
    """
    return await saju_order_service.read_shared_report(share_id, orders)


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
