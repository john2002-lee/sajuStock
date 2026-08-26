"""AI 판단 기록 리포지토리. SQL 만 담당한다."""

import secrets

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.advice_verdict import AdviceVerdictRow
from app.schemas.advice_verdict import AdviceVerdictCreate

#: 소유자당 보관 상한. 넘으면 오래된 것부터 버린다.
#:
#: 일괄 분석이 버튼 한 번에 10건을 만든다(`MAX_BULK_SYMBOLS`). 상한이 없으면
#: 헤비 유저의 목록이 무한히 자라고, 홈은 어차피 앞의 몇 건만 그린다.
#: 100 은 "관심종목을 전부 분석해도 남는" 크기다.
MAX_PER_OWNER = 100

#: 목록 조회 기본 개수. 홈 섹션이 쓰는 값이라 화면보다 넉넉하게 둔다.
DEFAULT_LIMIT = 20


class AdviceVerdictRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def upsert(
        self, owner_key: str, payload: AdviceVerdictCreate
    ) -> AdviceVerdictRow:
        """같은 종목이면 덮어쓴다.

        `(owner_key, code)` 유니크와 짝이다 — 모델 주석의 "소유자당 종목당 한 행" 을
        여기서 실행한다. 덮어쓸 때 **`share_id` 는 건드리지 않는다**: 이미 공유한
        링크가 있는데 재분석했다고 죽으면, 남에게 보낸 주소가 조용히 404 가 된다.
        """
        row = await self.get(owner_key, payload.code)
        if row is None:
            row = AdviceVerdictRow(owner_key=owner_key, code=payload.code)
            self._db.add(row)

        row.symbol = payload.symbol
        row.name = payload.name
        row.decision = payload.decision
        row.confidence = payload.confidence
        row.source = payload.source
        row.answer = payload.answer
        row.price_at = payload.price_at
        # Pydantic 모델 리스트를 그대로 넣으면 JSONB 직렬화가 실패한다.
        row.agent_opinions = [opinion.model_dump() for opinion in payload.agent_opinions]

        await self._db.flush()
        await self._prune(owner_key)
        return row

    async def get(self, owner_key: str, code: str) -> AdviceVerdictRow | None:
        stmt = select(AdviceVerdictRow).where(
            AdviceVerdictRow.owner_key == owner_key, AdviceVerdictRow.code == code
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def list_for(
        self, owner_key: str, limit: int = DEFAULT_LIMIT
    ) -> list[AdviceVerdictRow]:
        """최신순. 갱신 시각이 아니라 **생성 시각**이 아니라는 점에 주의 —
        `updated_at` 으로 정렬한다. 재분석한 종목이 위로 올라오는 편이 맞다.
        """
        stmt = (
            select(AdviceVerdictRow)
            .where(AdviceVerdictRow.owner_key == owner_key)
            .order_by(AdviceVerdictRow.updated_at.desc())
            .limit(limit)
        )
        return list((await self._db.execute(stmt)).scalars().all())

    async def get_shared(self, share_id: str) -> AdviceVerdictRow | None:
        """공유 링크로 한 건. **소유자를 묻지 않는다** — 링크가 곧 열쇠다."""
        stmt = select(AdviceVerdictRow).where(AdviceVerdictRow.share_id == share_id)
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def enable_share(self, owner_key: str, code: str) -> AdviceVerdictRow | None:
        """공유를 켜고 `share_id` 를 돌려준다. 이미 켜져 있으면 그대로 쓴다.

        누를 때마다 새 id 를 발급하면 먼저 보낸 링크가 죽는다.

        id 는 `secrets.token_urlsafe(16)` — 128비트다. 짧게 하면 남의 링크를
        긁어 볼 수 있고, 이 주소는 **로그인 없이 열리는 유일한 문**이다.
        """
        row = await self.get(owner_key, code)
        if row is None:
            return None
        if row.share_id is None:
            row.share_id = secrets.token_urlsafe(16)
            await self._db.flush()
        return row

    async def _prune(self, owner_key: str) -> None:
        """상한을 넘은 오래된 행을 버린다.

        **공유 중인 행은 남긴다.** 남에게 보낸 주소가 보관 상한 때문에 조용히
        404 가 되면, 링크를 받은 쪽은 원인을 알 방법이 없다.
        """
        keep = (
            select(AdviceVerdictRow.id)
            .where(AdviceVerdictRow.owner_key == owner_key)
            .order_by(AdviceVerdictRow.updated_at.desc())
            .limit(MAX_PER_OWNER)
            .scalar_subquery()
        )
        stmt = delete(AdviceVerdictRow).where(
            AdviceVerdictRow.owner_key == owner_key,
            AdviceVerdictRow.share_id.is_(None),
            AdviceVerdictRow.id.not_in(keep),
        )
        await self._db.execute(stmt)
