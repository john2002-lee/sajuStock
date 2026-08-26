"""투자 성향 프로파일 서비스 — ORM 행과 도메인 스키마 사이의 유일한 변환 지점.

`domain/fit.py` 는 순수 함수라 ORM 객체를 받으면 안 된다(세션이 닫힌 뒤 지연 로딩이
터진다). 변환을 한곳에 모아 두면 그 경계가 코드로 강제된다.
"""

import logging

from app.models.investor_profile import InvestorProfileRow
from app.repositories.investor_profile import InvestorProfileRepository
from app.schemas.profile import InvestorProfile, InvestorProfileResponse

logger = logging.getLogger(__name__)


def to_schema(row: InvestorProfileRow) -> InvestorProfile:
    return InvestorProfile(
        risk_appetite=row.risk_appetite,
        patience=row.patience,
        decisiveness=row.decisiveness,
        loss_aversion=row.loss_aversion,
        herd_tendency=row.herd_tendency,
        source=row.source,
        saju_summary=row.saju_summary,
    )


def _response(row: InvestorProfileRow | None) -> InvestorProfileResponse:
    if row is None:
        return InvestorProfileResponse()

    return InvestorProfileResponse(
        profile=to_schema(row),
        updated_at=row.updated_at.isoformat(timespec="seconds") if row.updated_at else None,
    )


async def get_profile(repo: InvestorProfileRepository, owner_key: str) -> InvestorProfile | None:
    """판단 경로가 쓰는 조회. 없으면 None 이고, 그때 분석은 개인화 없이 나간다."""
    row = await repo.get(owner_key)
    return to_schema(row) if row is not None else None


async def read(repo: InvestorProfileRepository, owner_key: str) -> InvestorProfileResponse:
    return _response(await repo.get(owner_key))


async def save(
    repo: InvestorProfileRepository, owner_key: str, profile: InvestorProfile
) -> InvestorProfileResponse:
    row = await repo.upsert(owner_key, profile)
    return _response(row)
