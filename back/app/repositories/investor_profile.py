"""투자 성향 프로파일 리포지토리. SQL 만 담당한다."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.investor_profile import InvestorProfileRow
from app.schemas.profile import InvestorProfile

# 6개 축 + 표시용 필드. 스키마 → 행 복사가 두 곳(신규·갱신)이라 목록을 한 번만 적는다.
_FIELDS = (
    "risk_appetite",
    "patience",
    "decisiveness",
    "loss_aversion",
    "herd_tendency",
    "source",
    "saju_summary",
)


class InvestorProfileRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get(self, owner_key: str) -> InvestorProfileRow | None:
        stmt = select(InvestorProfileRow).where(InvestorProfileRow.owner_key == owner_key)
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def upsert(self, owner_key: str, profile: InvestorProfile) -> InvestorProfileRow:
        """있으면 갱신, 없으면 생성.

        PUT 하나로 온보딩 저장과 사용자 보정을 모두 받는다. 둘을 POST/PATCH 로 나누면
        화면이 "내 프로파일이 이미 있는가"를 먼저 물어봐야 하고, 그 왕복이 실패하면
        저장 자체를 못 한다.
        """
        row = await self.get(owner_key)
        if row is None:
            row = InvestorProfileRow(owner_key=owner_key)
            self._db.add(row)

        for field in _FIELDS:
            setattr(row, field, getattr(profile, field))

        # `get_db` 는 커밋하지 않고 세션을 닫는다 — flush 로 끝내면 응답이 나간 뒤
        # 조용히 롤백된다 (watchlist 리포지토리 `save` 주석과 같은 규약).
        await self._db.commit()
        await self._db.refresh(row)
        return row

    async def delete(self, owner_key: str) -> bool:
        row = await self.get(owner_key)
        if row is None:
            return False

        await self._db.delete(row)
        await self._db.commit()
        return True

    async def transfer_owner(self, from_key: str, to_key: str) -> bool:
        """익명으로 만든 프로파일을 로그인 계정으로 승계한다.

        **계정에 이미 프로파일이 있으면 옮기지 않는다.** 익명 쪽은 방금 만든 초안이고
        계정 쪽은 사용자가 이전에 보정해 둔 값일 수 있다. 초안이 보정본을 덮으면
        사용자가 한 수정이 로그인 한 번으로 사라진다 — 조용히 일어나는 데이터 손실이다.
        """
        source = await self.get(from_key)
        if source is None or await self.get(to_key) is not None:
            return False

        source.owner_key = to_key
        await self._db.commit()
        return True
