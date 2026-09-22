"""사주 결과 공유 링크 리포지토리. SQL 만 담당한다."""

import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.saju_share import SajuShareRow

#: 한 번의 정리에서 지울 최대 행 수.
#:
#: 정리가 쓰기 경로 안에서 돌기 때문에 상한이 필요하다. 조용한 한 주가 지난 뒤
#: 첫 공유 요청이 수만 행을 지우며 응답을 붙들면, 그 사용자는 우리 청소 비용을
#: 대신 내는 셈이 된다.
PRUNE_LIMIT = 500


def new_share_id() -> str:
    """`secrets.token_urlsafe(16)` = 128비트, 22자.

    주소가 곧 열쇠이고 이것은 **인증 없이 열리는 문**이다. 짧게 하면 남의 링크를
    긁어 볼 수 있다. `advice_verdicts.share_id` 와 같은 폭이다.
    """
    return secrets.token_urlsafe(16)


def _cutoff() -> datetime:
    """이 시각보다 오래된 행은 만료다."""
    return datetime.now(UTC) - timedelta(days=settings.saju_share_retention_days)


class SajuShareRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(
        self,
        *,
        pillars_hangul: list[str],
        day_master_hangul: str,
        visible_wuxing: dict[str, int],
        strength_verdict: str,
        summary: str,
    ) -> SajuShareRow:
        """공유 행 하나를 만든다. **갱신 경로는 없다 — 쓰고 나면 끝이다.**

        인자를 통째 객체가 아니라 다섯 개로 펼쳐 받는다. 이 표가 담는 것이 정확히
        이 다섯이고, 부르는 쪽에서 **무엇을 넘기는지가 눈에 보여야** 좁히기가
        검토 가능한 사실로 남는다. 응답 스키마를 그대로 받으면 나중에 그 스키마에
        칸이 하나 붙는 날 조용히 함께 저장된다.

        같은 사주를 두 번 공유하면 id 가 두 개 생긴다. 지문(생년월일시 해시)으로
        유니크를 걸어 합칠 수도 있지만 그러면 안 된다: 생년월일시의 경우 수는
        대략 3×10⁹(1920~2026 × 366 × 1440 × 성별 × 출생지)이라 **몇 분이면 전수
        대조가 된다.** 후추를 섞어도 그것이 새는 순간 지문이 곧 생년월일시가 되고,
        그건 이 표가 담지 않기로 한 바로 그 값이다.

        `flush` 가 아니라 `commit` 이다 — `get_db` 는 커밋하지 않는다
        (`SajuOrderRepository` 주석과 같은 이유).
        """
        row = SajuShareRow(
            share_id=new_share_id(),
            pillars_hangul=pillars_hangul,
            day_master_hangul=day_master_hangul,
            visible_wuxing=visible_wuxing,
            strength_verdict=strength_verdict,
            summary=summary,
        )
        self._db.add(row)
        await self._db.flush()
        # 쓰는 길에 청소를 붙인다. 이 저장소에는 스케줄러가 없으므로
        # (`advice_verdict._prune` 도 같은 수법이다) 쓰기가 유일한 기회다.
        await self.prune_expired(limit=PRUNE_LIMIT)
        await self._db.commit()
        return row

    async def get(self, share_id: str) -> SajuShareRow | None:
        """공유 링크로 한 건. **만료를 여기서 강제한다.**

        `created_at` 조건이 이 기능의 보관 기간을 *실제로* 만드는 자리다. 삭제
        스크립트나 크론에 맡기면, 아무도 그것을 돌리지 않는 배포에서 링크가
        영원히 열린다 — 그리고 이 저장소에는 크론이 없다
        (`app/models/saju_share.py` 모듈 주석).
        """
        stmt = select(SajuShareRow).where(
            SajuShareRow.share_id == share_id,
            SajuShareRow.created_at >= _cutoff(),
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def prune_expired(self, limit: int | None = None) -> int:
        """만료된 행을 지운다. 지운 개수를 돌려준다.

        커밋하지 않는다 — 부르는 쪽의 트랜잭션에 얹힌다(`create` 는 뒤에서 함께
        커밋하고, 정리 스크립트는 자기가 커밋한다).
        """
        cutoff = _cutoff()
        if limit is None:
            stmt = delete(SajuShareRow).where(SajuShareRow.created_at < cutoff)
        else:
            doomed = (
                select(SajuShareRow.share_id)
                .where(SajuShareRow.created_at < cutoff)
                .limit(limit)
                .scalar_subquery()
            )
            stmt = delete(SajuShareRow).where(SajuShareRow.share_id.in_(doomed))
        result = await self._db.execute(stmt)
        return result.rowcount or 0

    async def count_expired(self) -> int:
        """정리 스크립트의 dry-run 이 쓰는 값."""
        stmt = (
            select(func.count())
            .select_from(SajuShareRow)
            .where(SajuShareRow.created_at < _cutoff())
        )
        return (await self._db.execute(stmt)).scalar_one()
